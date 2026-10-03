---
name: deploy
description: gym-memo を本番（gym-memo.kuni-app.dev）に反映する手順。機能変更のみ / スキーマ変更 / データ変換を伴う / R2 など新リソース追加の4ケースで危険度が違う。「デプロイして」「本番に反映」と言われたとき、および pnpm run deploy / db:migrate:remote / wrangler d1 execute --remote を打つ前に読む。
---

# 本番に反映する

**ケースごとに危険度が違う。**該当するケースを選んでから進める。

| ケース | 手順 | 巻き戻し |
|---|---|---|
| 1. 機能変更のみ | `pnpm run deploy` | ✅ `wrangler rollback` |
| 2. スキーマ変更 | `db:migrate:remote` → `deploy` | ⚠️ 手動で逆マイグレーション |
| 3. + データ変換 | export → `migrate:remote` → 検証 → `deploy` | ⚠️ Time Travel（30日以内） |
| 4. + R2 など新リソース | bucket 作成 → `pnpm types` → 上記 | ⚠️ 同上 |

## 共通の土台

本番に触る前に必ず通す。

```bash
pnpm -r typecheck && pnpm test && pnpm check
```

⚠️ **デプロイは `pnpm run deploy`。** `run` を落とすと pnpm の組み込みコマンドに
食われて何も起きない（`ERR_PNPM_NOTHING_TO_DEPLOY`）。`deploy:dry` は
組み込みに無いので素通りする、という非対称さに注意。

⚠️ **`infra/`（Terraform）はアプリを変えても触らない。** 触るのは Access の
許可者を変えるときだけ。

## デプロイ後に必ず確認する

```bash
# Access が全経路を守っているか（302 → ログインになること）
for p in "/" "/exercises" "/api/exercises"; do
  printf "%-18s %s\n" "$p" "$(curl -s -m 25 -o /dev/null -w '%{http_code}' "https://gym-memo.kuni-app.dev$p")"
done
```

200 が返ったら保護が外れている。即座に `wrangler.jsonc` の `routes` を外して
デプロイし直す。

---

## ケース1: アプリの機能を変えるだけ

```bash
pnpm dev                                      # ローカルで確認
pnpm -r typecheck && pnpm test && pnpm check
pnpm run deploy
```

戻すとき:

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```

⚠️ **ロールバックが安全なのはこのケースだけ。** スキーマを変えた後だと、
古いコードが新しい DB を読めずに壊れる。

---

## ケース2: DB のマイグレーション（構造だけ）

```bash
# 1. apps/api/src/db/schema.ts を編集 → 生成
pnpm db:generate

# 2. 生成された apps/api/migrations/00XX_*.sql を目で読む
# 3. ローカルで適用して動かす
pnpm db:migrate:local && pnpm dev
pnpm -r typecheck && pnpm test && pnpm check

# 4. 本番。マイグレーションが先、デプロイが後
pnpm db:migrate:remote
pnpm run deploy
```

⚠️ **生成された SQL を必ず読むこと。** drizzle-kit は意図を推測するので、
**列のリネームを「削除＋追加」と解釈することがある**（データが消える）。

### 順序がマイグレーション → デプロイである理由

逆にすると、新しいコードが存在しない列を読んで落ちる。
この順序が成立する条件は **「古いコードが新しいスキーマでも動くこと」**。
列の追加は満たす（古いコードは新しい列を無視するだけ）。

**列の削除・リネームは満たさないので2段階に分ける:**

```
1回目: コードから列の参照を消す  → deploy
2回目: マイグレーションで列を落とす → migrate:remote
```

やらないと「デプロイした瞬間だけ壊れる」時間が生まれる。

---

## ケース3: マイグレーション + 既存データの変換

**一番危険。**4,000件超の実データが対象になる。

### drizzle-kit は DDL しか作らない

データ変換（`UPDATE` / `INSERT`）は**生成されたファイルに手で書き足す**。
前例は `0001_magenta_gravity.sql` / `0002_clammy_silver_sable.sql` /
`0004_flaky_black_tom.sql`。

```sql
ALTER TABLE `exercises` ADD `display_order` integer DEFAULT 999 NOT NULL;--> statement-breakpoint
-- これまでの並びを分割ごとの順位に焼き直す
UPDATE `exercises` SET `display_order` = (...);
```

⚠️ `--> statement-breakpoint` が文の区切り。wrangler はこれで分割して実行する。

⚠️ **DML だけのマイグレーションを手で足すときは、スナップショットも直す。**
`meta/_journal.json` にエントリを追加し、直前の `NNNN_snapshot.json` をコピーして
**`id` を新しい UUID に、`prevId` を直前のものに**する。やらないと次の
`db:generate` が `pointing to a parent snapshot ... collision` で止まる
（`0003_pullup_main_sets.sql` でこれを踏んだ）。

### 手順

```bash
# 1. スキーマ編集 → 生成 → データ変換 SQL を手で追記
pnpm db:generate

# 2. 本番同等のデータでローカルに再現する
pnpm db:reset:local
pnpm db:migrate:local
npx wrangler d1 execute gym-memo --local --file=tmp/import.sql -y

# 3. 変換前後を突き合わせて検証する ← ここが本番
npx wrangler d1 execute gym-memo --local --command "SELECT ..."

# 4. 本番のバックアップ
npx wrangler d1 export gym-memo --remote --output=tmp/backup-$(date +%Y%m%d-%H%M).sql -y

# 5. 適用して、同じ検証クエリを本番でも流す
pnpm db:migrate:remote
npx wrangler d1 execute gym-memo --remote --command "SELECT ..."

# 6. デプロイ
pnpm run deploy
```

⚠️ **3で件数だけ見て通さないこと。** 28章でメインセットを入れたときは全セットを
突き合わせて「意図した変更以外はゼロ」を確認した。件数一致だけでは、
黙って消えたデータと黙って増えたデータが相殺して見逃せる。

⚠️ **`db:reset:local` は空の DB にマイグレーションを流すので、既存行を更新する
DML は空振りする。**ローカルで移行結果を見たいときは同じ UPDATE を手で流す。

⚠️ **「エラーが出た後の成功メッセージ」を信用しない。** 31章で
`db:migrate:remote` が「権限一覧を吐いて exit 1」という落ち方をし、再実行すると
`✅ No migrations to apply!` と出た（直後から D1 が全部認証エラー）。
適用有無は `d1_migrations` テーブルを直接見て確定させる:

```bash
npx wrangler d1 execute gym-memo --remote --command "SELECT name FROM d1_migrations ORDER BY id"
```

### 保険: D1 Time Travel

過去30日の任意の時点に巻き戻せる。

```bash
npx wrangler d1 time-travel info gym-memo
npx wrangler d1 time-travel restore gym-memo --timestamp=<ISO8601>
```

⚠️ **復元するとそれ以降に追加した記録も消える。**ジムで記録した直後は避ける。

### やらないこと

```bash
pnpm db:seed:remote    # ← 流さない
```

`seed.sql` はクローン直後の開発用（13種目）。本番には `import.sql` 由来の
51種目が入っているので、流す意味がない。

---

## ケース4: 新しいリソースを足す（R2 の例）

### バケットは Wrangler で作る。Terraform ではない

```bash
npx wrangler r2 bucket create gym-memo-images
```

D1 と同じ理屈（5章）。`wrangler.jsonc` に書けば宣言的に管理でき、Terraform を
重ねると `bucket_name` の受け渡しで二重管理の摩擦が起きる。`infra/` は触らない。

R2 は初回にダッシュボードでの有効化が要り、**無料枠でも支払い方法の登録**を
求められることがある。

### binding の追加後は `pnpm types` が必須

```jsonc
"r2_buckets": [{ "binding": "IMAGES", "bucket_name": "gym-memo-images" }]
```

```bash
pnpm types      # worker-configuration.d.ts を再生成。忘れると c.env.IMAGES が型エラー
```

生成物だがコミットする（無いと clone 直後の typecheck が落ちる）。

### ⚠️ 画像は Worker 経由で配る。R2 の公開 URL を使わない

`r2.dev` の公開 URL は **Access の外に出る**。URL を知っている人は誰でも見られる。

```
GET /api/images/:id → Worker → env.IMAGES.get(key) → 返す
```

`workers_dev: false` を外さないのと同じ理由 —— 保護を迂回する別経路を作らない。

### 付随して起きること

- **メタデータは D1 に持つ**（どのセットの写真か）。つまりケース2か3も同時に発生する
- **テストの `resetDb()` に R2 の掃除を足す**。ストレージ分離はテストファイル単位なので、
  同一ファイル内でオブジェクトが残る

---

## 認証が切れたとき

`wrangler` の OAuth トークンは切れる。D1 への API が
`Authentication error [code: 10000]` を返したら:

```
! npx wrangler login
```

⚠️ ユーザー自身が対話で実行する必要がある（ブラウザが開く）。
`whoami` は通るのに D1 だけ落ちることがあるので、症状で判断する。
一度の失敗なら再実行で通ることもある。
