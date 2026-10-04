# gym-memo

自分専用の筋トレ記録アプリ。**技術学習が主目的**（TanStack 系 → Terraform/Cloudflare の順で優先）。

**知識の置き場所。**このファイルは毎セッション読まれるので、薄く保つ。

- **`biome.json`** — 機械で止められる規約（`noRestrictedImports` に理由つきで入っている）
- **`.claude/skills/`** — 手順。読むタイミングが決まっているもの（`deploy`）
- **コードの `⚠️` コメント** — そのコードを触る瞬間だけ要るもの
- **`docs/design-notes/`** — **なぜ**そうなっているか。代案と落とし穴（1章 = 1ファイル。目次は README）
- **このファイル** — 上のどれでもない「破ると壊れる一行」、地図、コマンド

⚠️ 規約を増やすときは、まず **lint で止められないか**を考える。止められるなら
`biome.json` に理由を書いて終わり、ここには書かない。

## アーキテクチャ

**1つの Cloudflare Worker が SPA と API の両方を返す。**

```
/assets/*.js   → 静的アセット（CDN が直接返す。Worker は起動しない）
/api/*         → Worker → Hono → Drizzle → D1
/workouts/42   → 静的なし → SPA フォールバックで index.html
```

コードは分離、デプロイは1つ。型は Hono RPC で `apps/api` → `apps/web` に貫通する。

```
apps/api   Hono + Drizzle + D1     Worker のエントリ。migration/ は一度きりの移行コード
apps/web   React + Vite + TanStack  SPA
infra      Terraform（Access とゾーン設定のみ）
docs       design-notes/（1章 = 1ファイル。目次は README.md）
```

`apps/web/src` は **feature 単位**（32章）。

```
api/        client.ts / keys.ts / error.ts   ← feature を知らない
features/
  exercises/  api.ts + 画面・部品 + テスト
  workouts/   api.ts + 画面・部品 + テスト（セットも含む）
components/   ui/（shadcn）と、両 feature から使う部品だけ
routes/       薄いラッパー。ロジックは features にある
```

⚠️ **依存は `workouts → exercises` の一方向だけ**（種目の選択肢が要るため）。
逆向きを作らないこと。`components/` と `api/` から `features/` を参照しないこと。

## コマンド

```bash
pnpm dev              # wrangler dev (:8787) + vite (:5180) を並列起動
pnpm test             # 全パッケージのテスト
pnpm -r typecheck
pnpm build
pnpm check:fix        # Biome

pnpm db:generate      # スキーマ差分から SQL 生成（drizzle-kit）
pnpm db:migrate:local # ローカル D1 に適用
pnpm db:seed:local    # 種目マスタ投入
pnpm db:reset:local   # .wrangler を消してやり直し
pnpm types            # wrangler types 再生成（wrangler.jsonc を変えたら）
```

ローカル実行は **完全にローカル**（workerd + SQLite）。Cloudflare への通信も課金も無い。

本番に触るコマンド（`pnpm run deploy` / `db:migrate:remote` / `--remote`）は
**`deploy` スキル**に手順ごとまとめてある。単体で打たないこと。

## 守るべき規約

破ると壊れるものだけ。**lint で止まるものはここに書かない**（`biome.json` の
`noRestrictedImports` に理由つきで入っている: `schema/` への Drizzle 混入、
`@hono/zod-validator` の直接 import、react-hook-form、feature の依存の向き）。

**`apps/api/src/routes.ts` のメソッドチェーンを崩さない**
Hono RPC の型はチェーンで積み上がる。変数に代入して分けると型が消える。
web が型解決するのはこのファイルだけ（Worker エントリの `index.ts` は読まない）。

**成功レスポンスに `c.json(x, 200)` と明示する**
省くと成功 body が 404 / 409 / 500 など**他の全ステータスの型に混入する**。

**`InferResponseType` には必ず `, 200` を付ける**
付けないと 400 のエラー型とのユニオンになる。

**`api/keys.ts` を feature ごとに分けない**
「階層 = 無効化の単位」で設計してあり、`['exercises']` の invalidate が
`['exercises', id, 'last-sets']` も巻き込む（種目名の変更を記録画面に追従させるため）。
分けるとこの関係が見えなくなる（32章）。

**`mutateAsync` を await した後に `mutation.isError` を見ない**
レンダー時点の古い値を掴んでいる。`try` / `catch` で判断する（これで2回バグった）。

**セット1行の表示は `SetLine` を使う。画面ごとに書かない**
アップを薄くする規則をここ1箇所に集約している。以前3画面が別々に書いて揃っていなかった。

**boolean のチェックボックスはラベルを値と同じ向きにする**（28章）

**日付キーは `toISOString()` で作らない**
UTC なので JST の午前9時前が前日になる。ローカル時刻から組む（`dateKey`）。

**`wrangler d1` に `--local` を忘れない**。付けないと本番に流れる

**テストは対象の隣に置く。`test/` には置かない**
`test/` は共通部品だけ（`helpers.ts` / `setup.ts`）。api も web も同居方式（34章）。
HTTP 層のテストは `routes.ts` が分割できないので **`src/routes.<リソース>.test.ts`**
に置く。どのファイルかは**パスの先頭で決まる**（`/api/exercises/...` → `routes.exercises`）。

**テストのストレージ分離は「テストファイル単位」**
同一ファイル内は D1 の状態を共有する。`beforeEach` で `resetDb()`。
削除順序は FK の都合で sets → workouts → exercises。

**削除・更新は失敗系こそテストする**

## 意図的にそうしているもの（直さないこと）

「なぜ」は `docs/design-notes/` の該当章にある（`NN-` で始まるファイル）。
ここは**戻すと壊れる一行**だけ。

- **主キーは UUIDv7**。`id` をソートのタイブレーカーに使っている（17章）
- **重量は DB にグラム整数（`sets.weight_g`）、API は kg**。変換は `db/weight.ts` に閉じる。
  ⚠️ `toG` の `Math.round` は必須（`1.005 * 1000` は `1004.9999999999999`）
- **重量は負数を許す**（懸垂のアシスト量）。`nonnegative()` に戻さないこと。
  ⚠️ **負数は `SetForm` の「±」ボタンでしか入力できない。** iOS の数値キーパッドに
  マイナスキーが無く、消すと iPhone から懸垂を記録できなくなる
- **`sets.isSuccessful`** は挙がったかどうか。false のときだけ `reps` 0 を許す
- **`sets.isMainSet`** は本番セットか。**既定 false**。自動判定はしない（28章）。
  ⚠️ 懸垂だけは **5回なら本番**。逆（10回は常にアップ）は成り立たない
- **boolean は否定形にせず `is` / `has` / `can` を接頭辞に付ける**
- **`src/routes/` はディレクトリ記法**。フラットと混ぜない。
  ⚠️ **`createFileRoute` のパス文字列は手で編集しない**（プラグインが管理している）
- **`src/routes/` からの import は `@/`**。`test/` へは `@test/`（32章）
- **ネイティブ `<select>` を使う**。スマホは OS のピッカーが開くほうが良い（20章）
- **種目の絞り込みはクライアント側**。API を叩かない（21章）
- **種目の並びは `分割 → display_order → 名前`**（31章）。**既定 999 = 未設定**で下に沈む。
  ⚠️ **`UNIQUE(category, display_order)` を張らない**（入れ替えと分割変更が壊れる）
  ⚠️ **`listExercises` で `sets` を join しない**（4,401行読んで51行返していた）
- **分割は PPL + その他の4分類**。⚠️ **その他はどの分割を選んでも末尾に出す**（腹筋）
- **部位に `abs` は無い**。`other` に寄せた。`calves` の表示名は**「カーフ」**（27章）
- **1日1セッション**。`performed_on` は UNIQUE、重複は 409（`workoutId` 付き）（27章）
- **ホームは月カレンダー**。react-day-picker は入れない（27章）
- **種目削除は物理削除 + 使用中なら 409**。アーカイブ方式は不採用（15章）

## 環境の癖

- **TypeScript 7 は `baseUrl` を廃止**。`paths` だけで `@/` を張る
- **`apps/api/scripts/` の相対 import には `.ts` を付ける**。`node --experimental-strip-types`
  で直接実行するため。tsc 側は `allowImportingTsExtensions` で通している（`--noEmit` なので安全）
- **Biome の対象外**: `components/ui/`（shadcn 生成物）、`routeTree.gen.ts`、`src/index.css`（Tailwind v4 構文を CSS パーサが読めない）、`worker-configuration.d.ts`
- **`worker-configuration.d.ts` はコミットする**。生成物だが、無いと clone 直後の typecheck が落ちる
- `wrangler dev` を止めたつもりで `workerd` が残っていることがある。API の挙動が実装と食い違ったら
  `lsof -nP -iTCP:8787 -sTCP:LISTEN` を見る

## 現在地

**フェーズ1 / MVP / フェーズ2 まで完了。本番稼働中**（Cloudflare Access で自分のみ）:
https://gym-memo.kuni-app.dev

```
Worker gym-memo + D1 gym-memo (APAC)   ← wrangler（pnpm run deploy）
Access アプリ + ポリシー                ← infra/ (Terraform)
Zero Trust 組織 / ゾーンの TLS          ← 手動（値は infra/README.md）
```

⚠️ **`workers_dev: false` / `preview_urls: false` を外さない。** `workers.dev` は
Access の対象外の別ホスト名なので、生やすと保護を迂回する無認証の裏口になる。

⚠️ **`pnpm deploy` は動かない。** pnpm の組み込みと衝突する。**`pnpm run deploy`**。

⚠️ **`database_id` を変えるとローカル D1 が見えなくなる**（`.wrangler` の SQLite
ファイル名がこの ID から導出されている）。変えたら `tmp/import.sql` から入れ直す。

**本番への反映手順は `deploy` スキル**（4ケース）。Terraform の境界線は
`infra/README.md` と 5章・29章。**`infra/` は「このアプリに属するもの」だけ**を管理し、
ドメインやアカウントに属するものは手動の前提条件に置く。

バックログ（画像アップロード/R2、グラフ、PR、オフライン対応 など）は 15章。

## スキルの読み込み（TanStack Intent）

以下は `npx @tanstack/intent install` が生成した管理ブロック。
TanStack のスキルは `node_modules` 内にあり Claude Code のスキャン対象外なので、
この案内を頼りに必要時だけ読みに行く。**手で編集しないこと**（再実行時に上書きされる）。

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
