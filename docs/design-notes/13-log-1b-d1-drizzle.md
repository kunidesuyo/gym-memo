# 13. 実装ログ: 1-b（D1 + Drizzle）—— 完了 2026-09-20

### スキーマ（実装済み）

```
exercises   id, name(UNIQUE), muscle_group, created_at
workouts    id, performed_on(YYYY-MM-DD), created_at
sets        id, workout_id→workouts(CASCADE), exercise_id→exercises,
            set_order, weight_kg, reps, created_at
            INDEX: sets_exercise_idx, sets_workout_idx
```

RPE・メモは方針どおり後回し。`sets.exercise_id` の索引は「前回の記録」クエリのため。

### API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | 疎通確認 |
| GET | `/api/exercises` | 種目一覧 |
| POST | `/api/workouts` | セッション作成（201） |
| GET | `/api/workouts/:id` | セッション + セット（種目名つき） |
| POST | `/api/workouts/:id/sets` | セット記録（201） |
| GET | `/api/exercises/:id/last-sets` | **前回の記録**（`?excludeWorkoutId=` で記録中を除外） |

**`excludeWorkoutId` が要る理由**: これが無いと、今日1セット入れた時点で
「前回」が今日自身になってしまう。

**`setOrder` はサーバーが採番する**（同一ワークアウト×種目の連番）。
クライアントに決めさせると、並行して入力したときに破綻する。

### マイグレーションの流れ（論点2の分担どおり動いた）

```bash
pnpm db:generate       # drizzle-kit がスキーマ差分から SQL を生成
pnpm db:migrate:local  # wrangler がローカル D1 に適用
pnpm db:seed:local     # 種目マスタを投入
pnpm db:reset:local    # .wrangler を消して上2つをやり直す
```

**drizzle-kit の `meta/` フォルダは wrangler が無視する**ので、
`migrations/` を両者で共有して問題ない。実測で確認済み。

### テスト（API 側 17本）

- `queries.test.ts` — Drizzle クエリの単体。`getLastSets` を重点的に
  （記録なし / 直近が返る / 他種目を混ぜない / excludeWorkoutId）
- `routes.test.ts` — `exports.default.fetch` で Worker 全体を叩く統合テスト
  （201 / 400 バリデーション / 404）
- `health.test.ts` — 疎通

ストレージ分離がファイル単位なので、**`beforeEach` で `resetDb()`** している（11章の訂正どおり）。
削除順序は FK の都合で sets → workouts → exercises。

テストは本番の `seed.sql` に依存せず、自分でフィクスチャを作る。

### 積み残しを解消: `cloudflare:test` → `cloudflare:workers`

12章で「`SELF` / `env` が非推奨」と記録していた件。**移行できることを実測して移行した。**

```ts
// 旧（非推奨）
import { SELF, env } from 'cloudflare:test'
await SELF.fetch(url, init)

// 新
import { exports, env } from 'cloudflare:workers'
await exports.default.fetch(url, init)   // 2引数形式もそのまま使える
```

`applyD1Migrations` だけは `cloudflare:test` にしか無いので、そこだけ併用する。

### ハマりどころ

**1. `migrations_dir` の指定が必須**

`wrangler.jsonc` の D1 設定に書かないと、wrangler はリポジトリ直下の `./migrations` を探し
`No migrations present at <repo>/migrations` で失敗する。今回は `apps/api/migrations`。

**2. `noUncheckedIndexedAccess` がレスポンス型を汚していた**

`const [row] = await db.insert(...).returning()` は `T | undefined` になる。
これをそのまま返していたため、**Hono RPC のレスポンス型に `undefined` が混入**していた。
テスト側も `w!.id` と非 null アサーションだらけになり、Biome が16件警告を出して発覚。

→ クエリ関数側で潰すのが正しい。INSERT ... RETURNING は必ず1行返すのだから:

```ts
const [row] = await db.insert(workouts).values({ performedOn }).returning()
if (!row) throw new Error('workout の作成に失敗しました')
return row
```

**lint の警告が設計の弱さを指していた**例。`!` で黙らせなくてよかった。

### 動作確認（`wrangler dev` に実際に curl）

```
① GET  /api/exercises                     → シードした8種目が返る
② POST /api/workouts                      → id 採番
③ POST /api/workouts/:id/sets  x2         → setOrder 1, 2 と採番される
   GET  /api/workouts/:id                 → 種目名つきでセットが並ぶ
④ GET  /api/exercises/1/last-sets
        ?excludeWorkoutId=<今日>           → 前回(09-13)のセットが返る
⑤ POST 負の重量                            → 400
```
