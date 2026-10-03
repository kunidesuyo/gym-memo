# 16. 実装ログ: 1-d（スキーマ拡張 + 種目 CRUD）—— 完了 2026-09-20

### 変更点

- `exercises.category`（PPL）を追加、`sets.note` を追加
- 種目マスタを「固定シード」から「初期データ」に格下げ（13種目）
- 種目 CRUD の API と `/exercises` 画面
- `GET /api/exercises?category=push` で絞り込み
- セット記録フォームにメモ欄

**部位 → PPL の自動補完**は `schema/exercise.ts` の `defaultCategoryFor` に集約した。
画面で部位を選ぶと分割が埋まり、手で変更もできる。テストで3パターン検証済み。

### ハマりどころ

**1. `InferResponseType` は明示的な `200` が無いと絞り込めない**

`c.json(rows)` はステータスが `ContentfulStatusCode`（広い型）になる。
zValidator を足して 400 が生えると、`InferResponseType<..., 200>` で絞ろうとしても
ユニオンが残り `[number]` で添字アクセスできなくなる。

→ **成功レスポンスに `c.json(rows, 200)` と明示する。**
一覧系は今後も `zValidator('query')` を足しがちなので、最初から付けておくのが無難。

**2. web に Worker の `Response` 型が見えている問題が実際に出た**

12章で「web の tsconfig が `worker-configuration.d.ts` を読むトレードオフ」と記録した件。
エラーレスポンスを読むヘルパを `(res: Response) => ...` と書いたら、
`Response` が Worker 版（`webSocket` / `cf` を持つ）に解決され、
Hono の `ClientResponse` を受け取れなかった。

→ 必要な形だけを構造的に受ける: `(res: { json(): Promise<unknown> })`。

**3. `ALTER TABLE ... ADD COLUMN NOT NULL` は既存行があると失敗する**

`category` は NOT NULL なので、行があるテーブルには DEFAULT 無しで足せない。
今回はローカルの捨てデータだったので `pnpm db:reset:local` で回避した。
→ **本番（フェーズ2以降）では、既存行があるテーブルに NOT NULL 列を足すとき
   DEFAULT を付けるか、多段マイグレーションにする必要がある。**

**4. 型付き MSW モックがドリフトを検出した**

`exercises` に `category`、`sets` に `note` を足した時点で、
モックのフィクスチャがコンパイルエラーになった。11章で狙ったとおりの挙動。

### 検証で踏んだ事故: 古い `wrangler dev` が生き残っていた

curl での確認結果が「フィルタが効かない」「POST が 404」「note が無い」と
実装と食い違った。原因は **5時間前に起動した `wrangler dev` が 8787 を握ったまま**
だったこと。バックグラウンド起動した pnpm ラッパーを `kill` しても、
子の `wrangler` / `workerd` までは止まっていなかった。

→ API の挙動が実装と食い違ったら、まず `lsof -nP -iTCP:8787 -sTCP:LISTEN` を見る。
   後片付けは `pkill -f 'gym-memo.*workerd'` のようにプロセス名で行う。
   （対話シェルで `pnpm dev` を Ctrl-C する分にはプロセスグループに届くのでこの問題は起きない）

### テスト

API 29本（+12）／フロント 19本（+6）。合計48本。

`ExerciseManager.test.tsx` では **部位→PPL の自動補完**と、
**使用中の種目削除でサーバーの 409 文言が画面に出ること**を検証している。
