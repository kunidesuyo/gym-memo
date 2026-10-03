# 23. 公式スキルによるレビューと修正 —— 2026-09-21

導入した公式スキルを使い、**スキルごとに独立したサブエージェント**を立ててレビューさせた
（コンテキストを混ぜないため）。Terraform は `infra/` が空なので対象外。

| 担当 | 読み込んだスキル |
|---|---|
| Cloudflare | `cloudflare:wrangler` / `workers-best-practices` |
| Hono | `hono:hono` |
| shadcn | `shadcn` / `migrate-radix-to-base` |
| TanStack Router | Intent 経由で router-core 系7スキル |

指摘は40件強。**そのうち実バグは1件**だった。

### 🔴 実バグ: 400 のとき画面に `[object Object]` が出ていた

`@hono/zod-validator` の 400 は `{ error: string }` ではなかった。実測した body:

```json
{"success":false,"error":{"name":"ZodError","message":"[...\"message\": \"種目名を入力してください\"...]"}}
```

`error` が**オブジェクト**なので `apps/web/src/api/hooks.ts` の `errorFrom` が

```js
new Error(body.error).message  →  "[object Object]"
```

となり、そのまま画面に出ていた。**再現経路**: `/exercises/<不正なUUID>` を開く → 400 →
`useExerciseHistory` → `[object Object]`。`errorFrom` を使う7フックすべてが同じ経路を持つ。

さらに **Zod スキーマに書いた日本語メッセージが一度もユーザーに届いていなかった**。
上の body のとおり存在はするが、ネストの奥で潰れていた。

既存テストは `expect(res.status).toBe(400)` しか見ていなかったので検出できなかった。

**修正**: `apps/api/src/validator.ts` にラッパーを置き、hook で `{ error: string }` に揃えた。

```ts
export const zValidator = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target, schema: T,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? '入力が不正です' }, 400)
    }
  })
```

⚠️ ラッパー化でジェネリクスの伝播が壊れると `c.req.valid()` の型が緩む恐れがあったので、
**存在しないフィールドを参照させて型が narrow なままか実測**した
（`Property 'bogusField' does not exist on type '{ performedOn: string; }'` を確認）。

あわせて Zod の既定英語メッセージが残っていた箇所（`z.uuid()`、`nonnegative()`、
`int()`、`positive()`、`z.enum()`）に日本語を入れた。

### 🟡 CLAUDE.md の記述が不正確だった（訂正済み）

`c.json(x, 200)` について「省くと 200 が絞れなくなる」と書いていたが、**逆**だった。
`tsc` での実測結果:

| 絞り込み | `c.json(workout)`（200省略） |
|---|---|
| `..., 200` | `Workout` ✅ 絞れている |
| `..., 404` | `Workout \| {error}` ❌ 汚染 |
| `..., 500` | `Workout` ❌（500 ハンドラは存在しないのに） |

**壊れるのは 200 以外**。成功 body が全ステータスの型に混入する。
`InferResponseTypeFromEndpoint<T,U> = S extends U ? O : never` が分配されるため、
`S = ContentfulStatusCode` でも 200 側は通る。

`, 200` が抜けていた6箇所を修正し、CLAUDE.md の文言も直した。

### 修正したもの（計4件）

| | 内容 |
|---|---|
| 1 | **400 の body 形**（上記）+ 回帰テスト2本 |
| 2 | `index.css` に `color-scheme: light` / `dark` を追加 |
| 3 | `SetForm` / `ExerciseForm` の id を `useId()` 化 + 回帰テスト |
| 4 | `test/utils.tsx` の `as any` 削除、`, 200` 6箇所、CLAUDE.md 訂正 |

**② の `color-scheme`**: `.dark` クラスだけでは UA が light 扱いのままで、
**ネイティブ `<select>` のポップアップが白背景に白文字**になっていた。
「スマホで OS のピッカーを開く」判断（20章）をしているからこそ直撃する。2行で解決。

**③ の id 重複**: `id={field.name}`（`"weightKg"` 等の固定値）だったため、
**追加フォームと編集行の `SetForm` が同時に出た瞬間に DOM 内で id が重複**し、
`htmlFor` / `aria-describedby` が別フォームの入力欄に解決されていた。
`SetRow` は行ごとに編集状態を持つので複数行編集で3つ以上重複する。

→ 回帰テストを書き、**修正を一時的に戻すとテストが落ちること**を確認してから採用した。

**④ の `as any`**: `RouterProvider` は `TRouter extends AnyRouter` のジェネリックなので
キャスト不要だった。スキルが「キャストは型推論の連鎖を壊す最大のアンチパターン」と明記。

### 見送った主な指摘

| 指摘 | 判断 |
|---|---|
| D1 のバッチ化・複合インデックス | 年間1,800行では体感差ゼロ。必要になってから |
| `AlertDialog` / `Empty` / `Skeleton` / `Alert` 導入 | 見た目の底上げ。機能的な問題ではない |
| not-found / errorComponent / `defaultPreload` | フェーズ2で入れる |
| `basePath('/api')` への集約 | RPC の型は変わらないが、今やる必要が薄い |
| loader / search params | 既知のバックログ |

### フェーズ2 で必ずやること（Cloudflare レビューより）

1. **`workers_dev: false` / `preview_urls: false`** —— `wrangler deploy` すると
   `gym-memo.<subdomain>.workers.dev` が**自動で生え、無認証で D1 を読み書きできる**。
   **Access を張る前にデプロイしないこと。順序が命。**
2. `observability` を有効化（`logs` と `traces` は別々に指定が必要）
3. `database_id` を実 UUID に差し替え → 直後に `pnpm db:reset:local`
   （miniflare が `database_id` をローカル DB のファイル名に使っているため、
   差し替えるとローカルデータが別ファイルに切り替わって空になる）
4. `deploy` / `db:migrate:remote` の scripts 整備
5. `onError` + 構造化ログ（`console.log(JSON.stringify({...}))`）

### 副産物: レビュー手法として有効だった

- **スキルごとにサブエージェントを分けた**ので、Cloudflare の指摘が Hono の文脈に
  引きずられるといったことが起きなかった
- 各エージェントが**実測（`tsc` / `wrangler deploy --dry-run` / `shadcn view`）で裏を取った**
  指摘は精度が高かった。逆に「一般論」と自己申告された指摘は採否を判断しやすかった
- **`@shadcn/field` は `form` と別物で react-hook-form に依存しない**という指摘は、
  レジストリの実物を `view` して確認した上でのもので、こちらの思い込みを正してくれた（次回対応）
