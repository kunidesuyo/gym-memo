# 14. 実装ログ: 1-c（ドメイン実装）—— 完了 2026-09-20

### 画面

```
/                        セッション一覧 + 「今日のセッションを始める」
/workouts/$workoutId     記録画面
```

記録画面の構造:

```
2026-09-20
種目: [ベンチプレス ▼]
┌─ 前回の記録 (2026-09-13) ─┐   ← このアプリの存在理由
│ 1. 60kg × 10              │
│ 2. 65kg × 8               │
└───────────────────────────┘
重量[67.5]kg  回数[8]回  [記録する]
┌─ 今日 ──────────┐
│ 1. 67.5kg × 8   │
└─────────────────┘
```

### TanStack Query —— 学習の主役

**queryKey は階層 = 無効化の単位で設計する**（`src/api/keys.ts` に集約）:

```ts
exercises: () => ['exercises']
workouts:  () => ['workouts']
workout:   (id) => ['workouts', id]        // ['workouts'] の invalidate で両方が対象
lastSets:  (exerciseId, excludeWorkoutId) => ['exercises', exerciseId, 'last-sets', {...}]
```

**`staleTime` の使い分け**: 種目マスタは固定シードなので `Number.POSITIVE_INFINITY`。
取り直す理由がないものを取り直さない。

**楽観的更新**（`useAddSet`）: ジムでサーバー応答を待って画面が固まるのが最悪なので、
`onMutate` で先に画面を進め、`onError` で巻き戻し、`onSettled` でサーバーの真実に合わせ直す。

- 仮 id は **負数**にして本物の採番と衝突させない
- 種目名は**取得済みの種目一覧キャッシュから借りる**（`qc.getQueryData`）。再取得しない

**無効化の粒度がこの設計の肝**:

```ts
onSettled: () => {
  qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
  qc.invalidateQueries({ queryKey: keys.workouts() })   // セット数が変わるので一覧も古い
  // 「前回の記録」は excludeWorkoutId で今日を除外しているので影響を受けない。
  // ここを無闇に invalidate しないのがポイント。
}
```

### TanStack Form + 共有 Zod スキーマ

`apps/api/src/schema/set.ts` の `setFormSchema` を **web の検証にそのまま渡している**
（Standard Schema 対応）。サーバーと同じルールなので
「クライアントは通るのにサーバーで 400」が構造的に起きない。

`<input>` からは文字列で届くので、`z.string().min(1).transform(Number).pipe(z.number()...)` の形にした。

⚠️ **`z.coerce.number()` は `.pipe()` の先に置けない**。
入力型が `unknown` で `ZodSafeParseError ... unknown is not assignable to string` になる。
`transform(Number)` を挟むのが正解。

UX 判断: **送信後は重量を残して回数だけ消す**（同じ重量で複数セット組むため）。

### 当初計画からの変更: 配列フィールドをやめた

設計メモでは「1回のワークアウトで種目→セットを N 行、動的配列フィールドが Form の見せ場」
としていたが、**ジムでの実際の使い方は「1セット終わるたびに1件記録」**。
UX を優先して1件ずつの入力にした。

→ 配列フィールドの練習は未消化。必要なら後で別の画面（例: テンプレート機能）で扱う。

### テスト（フロント 12本）

- `SetForm.test.tsx` (4) — 共有スキーマによる検証がクライアント側でも効くこと
- `WorkoutRecorder.test.tsx` (5) — MSW 経由。**楽観的更新とロールバックを実測**
- `WorkoutList.test.tsx` (3) — メモリ履歴でルータを組んで `<Link>` を検証

**楽観的更新の検証方法**: MSW ハンドラを `delay(100)` で遅らせ、
それより早く画面に出ていれば楽観的更新が効いている、と判定する。
ロールバックはエラーハンドラ（同じく遅延つき）に差し替えて、
「一度出てから消える」ことを確認する。

### ハマりどころ

**1. `InferResponseType` にステータスを指定しないとエラー型が混ざる**

zValidator を付けたルートは 400 も返すので、推論型が
`ZodSafeParseError<...> | 本来の型` のユニオンになり、プロパティにアクセスできない。

```ts
InferResponseType<typeof client.api.workouts[':id']['$get'], 200>   // ← 200 を指定する
```

型の定義箇所は `src/api/hooks.ts` に集約した。

**2. `mutateAsync` の拒否が未処理 Promise 拒否になる**

TanStack Form の `onSubmit` が `mutateAsync` を await するため、失敗が上に伝播する。
エラーは `addSet.error` として画面に出すので、`.catch(() => {})` で明示的に握る。

**3. ルータプラグインは `react()` より前に置く**

`tanstackRouter({ target: 'react', autoCodeSplitting: true })` を plugins 配列の先頭に。
プラグイン名は現在 `tanstackRouter`（旧 `TanStackRouterVite` も残っているが非推奨）。

**4. 生成ファイルを Biome の対象から外す**

`src/routeTree.gen.ts` は自動生成で `any` を含むため、`biome.json` の
`files.includes` に `"!**/routeTree.gen.ts"` を追加。

**5. `any` を使わずに TanStack Form の Field を受ける**

`FieldApi` は型引数が非常に多い。必要な形だけを**メソッド記法の構造的な型**で受ければ
実際の `FieldApi` が代入可能になり、`any` も biome-ignore も不要になる。

```ts
type FieldLike = {
  name: string
  state: { value: string; meta: { errors: unknown[] } }
  handleBlur(): void
  handleChange(value: string): void
}
```

**6. 日付は `toISOString()` を使わない**

UTC になるので日本時間の夜は日付が1日ずれる。ローカル時刻から組み立てる。

### 動作確認（実データを入れて全経路）

```
① :5180/ が SPA を返す                          <title>gym-memo</title>
② /workouts/1 が 200（vite / wrangler 両方）     SPA フォールバック
③ GET  /api/workouts（proxy 経由）               過去セッションが返る
④ POST /api/workouts                             今日のセッション作成
⑤ GET  /api/exercises/1/last-sets?exclude...     前回(09-13)の3セットが返る
⑥ POST セット → GET セッション                   種目名つきで反映される
```

⚠️ **ブラウザでの E2E は未実施**。Playwright のブラウザ（約150MB）が未インストールのため。
フェーズ3で Playwright を入れるときに合わせて実施する。
