# 32. フロントを feature 単位に切る（2026-10-03）

### 前の構成の問題

```
src/components/   ui/ + 自前10ファイルが平ら
src/api/hooks.ts  365行。種目・セッション・セットのフック13個が同居
```

`WorkoutDetail`（画面）と `SetLine`（部品）が同じ階層に並び、ファイル名から
どちらなのか読めない。`hooks.ts` が一番「育った」ファイルだった。

調べてみると**実態は既に機能ごとに分かれていた**ので、構造を実態に合わせた。

### 後の構成

```
src/
├── api/          client.ts / keys.ts / error.ts   ← feature を知らない
├── features/
│   ├── exercises/  api.ts(81) + ExerciseManager / ExerciseHistory
│   │               / ExerciseForm / ExerciseFilters + テスト
│   └── workouts/   api.ts(276) + WorkoutCalendar / WorkoutDetail
│                   / LastSets / SetForm / SetRow + テスト
├── components/   ui/（shadcn）+ SetLine.tsx
└── routes/ lib/ main.tsx
```

### 決めたこと

#### セットは独立した feature にしない

セットのフックは全部 `workoutId` を受け取り、セッションの文脈でしか存在しない。
`workouts/api.ts` に入れた（13フックのうち7つがセット関連）。

#### `keys.ts` は分けない —— ここが一番重要

⚠️ `keys.ts` には **feature を跨いだ設計**が入っている。

```
['exercises']                           ← 種目の変更で invalidate
['exercises', id, 'last-sets']          ← 巻き添えで無効化される（意図的）
```

種目名を変えたとき記録画面の「前回の記録」に出る名前も追従させるため、
前方一致で巻き込む設計にしてある（`keys.ts` の「階層 = 無効化の単位」）。

feature ごとに分けるとこの関係が**コード上から見えなくなり**、将来うっかり壊す。
キーの木は1箇所にまとめたまま、`api/` に残した。

#### `SetLine` は共有に置く

`ExerciseHistory`（exercises）と `SetRow` / `LastSets`（workouts）の両方が使う。
feature 間の相互 import を作るより `components/` に置くほうが素直。

#### `errorFrom` を `api/error.ts` に切り出す

両 feature の `api.ts` が使う共有ヘルパだった。

### 依存の向き

⚠️ **`workouts → exercises` の一方向だけ**を許す。

```
features/workouts/WorkoutDetail.tsx → useExercises       種目の選択肢
features/workouts/api.ts            → type Exercise      楽観的更新で種目名を借りる
```

逆向き（exercises → workouts）は無い。`components/` と `api/` も features を
知らない。grep で機械的に確認してある。

### 踏んだもの

#### `test/` が `src/` の外にあるので `@/` で届かない

`src/components/` から `../../test/utils` だったものが、`src/features/exercises/`
からは `../../../test/utils` になる。深さに依存するのが嫌なので
**`@test/*` エイリアス**を張った（`tsconfig.json` の `paths` と
`vitest.config.ts` の `alias` の2箇所。対で設定する）。

#### 型定義の塊は機械的に切り出せない

`hooks.ts` の先頭の型5つは**空行なしで連続**していたため、
「空行区切りでセグメントを切る」スクリプトが空を返した。手で組み立て直した。
