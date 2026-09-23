import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { v7 as uuidv7 } from 'uuid'

/**
 * 主キーは UUIDv7。
 *
 * v4 ではなく v7 を選んだ理由は「先頭が時刻なので辞書順 = 生成順」になること。
 * 既存クエリが id をタイブレーカーに使っている（同一 setOrder の並び順、
 * 同日付のワークアウトの並び順）ため、ランダム ID だとそこが壊れる。
 *
 * 発行は API 側（この $defaultFn）。クライアント発行に変えればオフライン対応や
 * 楽観的更新の仮 ID 撤廃に繋がるが、今はサーバーで採番する。
 */
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())

/**
 * 種目マスタ。ユーザーが自分で追加・編集・削除する。
 * 削除は物理削除で、セットから参照されている場合は API 側で拒否する（409）。
 *
 * category(分割) と muscleGroup(細かい部位) は独立したカラム。
 * 矛盾は DB 制約ではなく画面側の既定値で防ぐ（schema/exercise.ts の defaultCategoryFor）。
 */
export const exercises = sqliteTable('exercises', {
  id: id(),
  name: text('name').notNull().unique(),
  category: text('category')
    .notNull()
    .$type<'push' | 'pull' | 'legs' | 'other'>(),
  muscleGroup: text('muscle_group').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
})

/**
 * 1回のトレーニングセッション。
 *
 * **1日1セッション**。performed_on に UNIQUE 索引を張って DB で保証する。
 * 分割（Push / Pull / Legs）は1日1つしかやらないので、同じ日に複数作れると
 * 「今日の記録」がどれなのか決まらず、ホームの「今日のセッションを始める」も
 * 分岐できなくなる。API 側でも重複は 409 で弾くが、最後の砦はこの索引。
 */
export const workouts = sqliteTable(
  'workouts',
  {
    id: id(),
    /** 日付のみ (YYYY-MM-DD)。 */
    performedOn: text('performed_on').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex('workouts_performed_on_unique').on(t.performedOn)],
)

/**
 * 1セットの記録。このアプリの主役テーブル。
 * 「前回この種目を何kgで何回やったか」を引くため exercise_id に索引を張る。
 *
 * weight_g は**グラム単位の整数**で持つ。kg を REAL にすると 110.8 のような値が
 * 2進で厳密に表現できず、集計のたびに「この比較は安全か」を考える羽目になる。
 * 整数なら SUM(weight_g * reps) が厳密。JS の number は 2^53 まで整数が厳密で、
 * このアプリの総ボリューム（約 2.5e9）に対して360万倍の余裕がある。
 * API は kg で公開し、変換は db/weight.ts に閉じ込める。
 *
 * **負数を許す**。懸垂のアシストマシンを使ったときの補助量を
 * マイナスで表すため（-36kg → -18kg という減少がそのまま上達の記録になる）。
 *
 * isSuccessful は挙がったかどうか。false = 重量に挑戦して0回だった記録。
 * 否定形（failed）だと二重否定が生まれて読みにくいので肯定形で持つ。
 */
export const sets = sqliteTable(
  'sets',
  {
    id: id(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setOrder: integer('set_order').notNull(),
    weightG: integer('weight_g').notNull(),
    reps: integer('reps').notNull(),
    isSuccessful: integer('is_successful', { mode: 'boolean' })
      .notNull()
      .default(true),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index('sets_exercise_idx').on(t.exerciseId),
    index('sets_workout_idx').on(t.workoutId),
  ],
)
