# 7. データモデル（たたき台）

⚠️ **これは計画当時のたたき台で、現状とは食い違う。**実際のスキーマでは
`performed_at` → `performed_on`（日付のみ・UNIQUE）、`weight_kg` → `weight_g`（グラム整数）、
`rpe` は未実装、`exercises` に `category` / `display_order` が、`sets` に
`is_successful` / `is_main_set` が増えている。**現在の定義は
`apps/api/src/db/schema.ts` を見ること。**


```
exercises        種目マスタ
  id, name, muscle_group, created_at

workouts         1回のトレーニングセッション
  id, performed_at, note

sets             1セットの記録（このアプリの主役テーブル）
  id, workout_id, exercise_id, set_order,
  weight_kg, reps, rpe, note
```

**最重要クエリ**: 種目を選んだとき「前回この種目でやった全セット」を返す。
これが出るかどうかでアプリの価値が決まる。TanStack Query のキャッシュ設計も、
まずこのクエリを中心に考える。

集計・グラフは後回し。まず記録できること、前回が見えること。
