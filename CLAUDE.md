# gym-memo

自分専用の筋トレ記録アプリ。**技術学習が主目的**（TanStack 系 → Terraform/Cloudflare の順で優先）。

設計判断の経緯・検討した代案・踏んだ落とし穴は **`docs/design-notes.md`** に全部ある。
「なぜこうなっているのか」はまずそちらを見ること。

## アーキテクチャ

**1つの Cloudflare Worker が SPA と API の両方を返す。**

```
/assets/*.js   → 静的アセット（CDN が直接返す。Worker は起動しない）
/api/*         → Worker → Hono → Drizzle → D1
/workouts/42   → 静的なし → SPA フォールバックで index.html
```

コードは分離、デプロイは1つ。型は Hono RPC で `apps/api` → `apps/web` に貫通する。

```
apps/api   Hono + Drizzle + D1     Worker のエントリ
apps/web   React + Vite + TanStack  SPA
infra      Terraform（Access とゾーン設定のみ）
docs       design-notes.md
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

pnpm deploy:dry       # ビルド + 設定検証（デプロイはしない）
pnpm deploy           # ビルド + wrangler deploy
pnpm db:migrate:remote  # 本番 D1 にマイグレーション
pnpm db:seed:remote     # 本番 D1 に種目マスタ
```

ローカル実行は **完全にローカル**（workerd + SQLite）。Cloudflare への通信も課金も無い。

## 守るべき規約

コメントにも書いてあるが、破ると壊れるものを列挙する。

**`apps/api/src/schema/` に Drizzle / D1 を import しない**
web 側からも import する共有領域。混ざるとサーバーコードがフロントのバンドルに入る。

**`apps/api/src/routes.ts` のメソッドチェーンを崩さない**
Hono RPC の型はチェーンで積み上がる。途中で変数に代入して分けると型が消える。
web が型解決するのはこのファイルだけ（`api/routes` として export）。Worker エントリの `index.ts` は読まない。

**成功レスポンスに `c.json(x, 200)` と明示する**
省くとステータスが `ContentfulStatusCode`（広い型）になり、**成功 body が
404 / 409 / 500 など他の全ステータスの型に混入する**。
（200 側の絞り込み自体は省いても効くが、エラー側の型が壊れる）

**バリデーションは `./validator` の `zValidator` を使う**
`@hono/zod-validator` を直接 import しないこと。素のままだと 400 の body が
`{ success: false, error: <ZodError オブジェクト> }` になり、クライアントが
`body.error` を文字列として扱えず画面に `[object Object]` が出る。
ラッパーが `{ error: string }` に揃えている。

**`InferResponseType` には必ず `, 200` を付ける**
付けないと 400 のエラー型とのユニオンになる。型の定義は `apps/web/src/api/hooks.ts` に集約。

**`api/keys.ts` を feature ごとに分けない**
「階層 = 無効化の単位」で設計してあり、**feature を跨いだ関係**が入っている
（`['exercises']` を invalidate すると `['exercises', id, 'last-sets']` も巻き込む。
種目名を変えたとき記録画面の表示も追従させるため）。分けるとこの関係が見えなくなる。

**`mutateAsync` を await した後に `mutation.isError` を見ない**
レンダー時点の古い値を掴んでいる。`try` / `catch` で Promise の結果から判断する。
（これで2回バグった。18章・21章）

**セット1行の表示は `SetLine` を使う。画面ごとに書かない**
アップ（非メインセット）を薄くする規則をここ1箇所に集約している。
以前は3画面が別々に書いていて揃っておらず、セッション詳細だけ薄く、
「前回の記録」と「種目の記録」は本番セットと同じ濃さで出ていた。

**boolean のチェックボックスはラベルを値と同じ向きにする**
`isSuccessful` の値を「失敗」ラベルで出していて、成功時にチェックが入って見えていた（28章）。

**日付キーは `toISOString()` で作らない**
UTC なので JST では午前9時より前が前日になる。ローカル時刻から組むこと
（`WorkoutCalendar.tsx` の `dateKey`）。

**`wrangler d1` に `--local` を忘れない**
付けないと本番の D1 に流れる。scripts に固めてあるのでそれを使う。

**テストのストレージ分離は「テストファイル単位」**
同一ファイル内のテストは D1 の状態を共有する。`beforeEach` で `resetDb()` すること。
削除順序は FK の都合で sets → workouts → exercises。

**削除・更新は失敗系こそテストする**
成功時しか試さないと上記のクロージャバグのようなものを見逃す。

## 意図的にそうしているもの（直さないこと）

- **主キーは UUIDv7**。v4 ではない。`id` をソートのタイブレーカーに使っているため（17章）
- **重量は DB にグラム整数（`sets.weight_g`）で持ち、API は kg で公開する**。
  変換は `apps/api/src/db/weight.ts` の `toG` / `toKg` に閉じ込める。
  ⚠️ `toG` の `Math.round` は必須（`1.005 * 1000` は `1004.9999999999999` になる）
- **重量は負数を許す**。懸垂のアシスト量をマイナスで表す
  （-36kg → -18kg の減少がそのまま上達の記録になる）。`nonnegative()` に戻さないこと。
  ⚠️ **負数は `SetForm` の「±」ボタンでしか入力できない。** iOS の数値キーパッド
  （`inputMode="decimal"` / `"numeric"`）に**マイナスキーが無い**ため。
  ボタンを消すと iPhone から懸垂を記録できなくなる。`inputMode` を外して
  通常キーボードにする案は、数字のたびにレイヤ切り替えが要るので採らない
- **`sets.isSuccessful`** は挙がったかどうか。false のときだけ `reps` 0 を許す（Zod の refine）
- **`sets.isMainSet`** は本番セットかどうか。**既定 false**、画面のチェックボックスで立てる。
  「ラスト3」の自動判定はしない（移行データの初期値を決めるのに使っただけ。28章）。
  ⚠️ **懸垂だけは5回が本番・10回がアップ**。ただし「10回は常にアップ」は成り立たない
  （130日中125日は10回しかやっておらず、その日は10回が本番）
- **boolean は否定形にせず、`is` / `has` / `can` を接頭辞に付ける**。
  `failed` のような否定形は二重否定が生まれて読みにくい
- **`src/routes/` はディレクトリ記法**。`exercises.index.tsx` ではなく
  `exercises/index.tsx`。フラット記法と混ぜないこと（どちらの規則か読めなくなる）。
  ⚠️ **`createFileRoute` のパス文字列は手で編集しない。** Vite プラグインが管理していて、
  ファイルを移動すれば自動で追従する（`routeTree.gen.ts` も再生成される）
- **`src/routes/` からの import は `@/` を使う**。相対パスだとディレクトリの深さに依存する
- **ネイティブ `<select>` を使っている**。スマホでは OS のピッカーが開くほうが UX が良い（20章）
- **shadcn の `form` コンポーネントは入れない**。中身が react-hook-form で TanStack Form と競合する（20章）
- **種目の絞り込みはクライアント側**。API を叩かない（21章）
- **種目の並びは `分割 → exercises.display_order → 名前`**（31章）。
  `display_order` は**分割の中での**順番で、小さいほど上。**既定 999 = 未設定**で、
  番号を振った種目より下に沈む（0 にすると逆になるので戻さないこと）。
  ⚠️ **`UNIQUE(category, display_order)` を張らないこと。** 入れ替えが一時値を
  経由する多段階になり、分割を変えただけで衝突して 409 になる。同値は名前順で解決する。
  ⚠️ **`listExercises` で `sets` を join しないこと。** かつて「セット数の多い順」に
  並べており、1回の呼び出しで `sets` を全件読んでいた（4,401行読んで51行返す）。
  `setCount` はどの画面も読んでいなかったので API から消した
- **分割は PPL + 「その他」の4分類**。腹筋系は PPL のどこにも入らないため。
  記録画面は `[すべて][Push][Pull][Legs]` で絞り込むが、
  **その他はどの分割を選んでも末尾に出す**（腹筋はどの日にもやるため）
- **部位に `abs` は無い。`other`（その他）に寄せてある**（27章）。
  `calves` の表示名は「ふくらはぎ」ではなく**「カーフ」**
- **1日1セッション**。`workouts.performed_on` は UNIQUE、`POST /api/workouts` は
  既存があれば 409（`workoutId` 付き）。画面は「今日のセッションを始める」で
  有れば遷移・無ければ作成する（27章）
- **ホームは月カレンダー**。一覧に戻さないこと。react-day-picker は入れない（27章）
- **種目削除は物理削除 + 使用中なら 409**。アーカイブ方式は検討のうえ不採用（15章）

## 環境の癖

- **TypeScript 7 は `baseUrl` を廃止**。`paths` だけで `@/` を張る
- **`apps/api/scripts/` の相対 import には `.ts` を付ける**。`node --experimental-strip-types`
  で直接実行するため。tsc 側は `allowImportingTsExtensions` で通している（`--noEmit` なので安全）
- **Biome の対象外**: `components/ui/`（shadcn 生成物）、`routeTree.gen.ts`、`src/index.css`（Tailwind v4 構文を CSS パーサが読めない）、`worker-configuration.d.ts`
- **`worker-configuration.d.ts` はコミットする**。生成物だが、無いと clone 直後の typecheck が落ちる
- `wrangler dev` を止めたつもりで `workerd` が残っていることがある。API の挙動が実装と食い違ったら
  `lsof -nP -iTCP:8787 -sTCP:LISTEN` を見る

## 現在地

**フェーズ1 / MVP / フェーズ2 まで完了**（テスト143本）。
**本番稼働中: https://gym-memo.kuni-app.dev**（Cloudflare Access で自分のみ）。

```
Worker gym-memo  ← wrangler run deploy
D1 gym-memo (APAC / a009e578-…)  種目51 / セッション267 / セット4190
Access アプリ + ポリシー     ← infra/ (Terraform)
Zero Trust 組織 / ゾーンの TLS ← 手動（値は infra/README.md に記録）
```

**`infra/` は「このアプリに属するもの」だけを管理する。**ドメインやアカウントに
属するものは手動の前提条件に置く（`infra/README.md` に値がある）。
どちらも一度 Terraform で書いてから外した。経緯は 29章。

⚠️ **`workers_dev: false` / `preview_urls: false` を外さないこと。** 外すと
`gym-memo.<subdomain>.workers.dev` が生える。これは **Access の対象外の別ホスト名**
なので、保護を迂回する無認証の裏口になる。

⚠️ **`pnpm deploy` は動かない。** pnpm の組み込みコマンドと名前が衝突していて
script が呼ばれない（`ERR_PNPM_NOTHING_TO_DEPLOY`）。**`pnpm run deploy`** と書く。
`deploy:dry` は組み込みに無いので素通りする、という非対称さに注意。

⚠️ **`database_id` を変えるとローカル D1 が見えなくなる。** `.wrangler` 配下の
SQLite ファイル名はこの ID から導出されている。変えたら `tmp/import.sql` から入れ直す。

**改修を本番に反映する手順は `docs/design-notes.md` 30章**（機能変更のみ /
マイグレーション / データ変換を伴う場合 / R2 など新リソースを足す場合の4ケース）。
Terraform の使い方・境界線・Access の中身は `infra/README.md` と 5章・29章。

バックログ（画像アップロード/R2、グラフ、PR、オフライン対応 など）は `docs/design-notes.md` 15章。

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
