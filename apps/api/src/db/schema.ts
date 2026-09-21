import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { v7 as uuidv7 } from 'uuid'

/**
 * 主キーは UUIDv7。
 *
 * v4 ではなく v7 を選んだ理由は「先頭が時刻なので辞書順 = 生成順」になること。
 * 既存クエリが id をタイブレーカーに使っている（同日に複数セッションがある場合の
 * 並び順、同一 setOrder の並び順）ため、ランダム ID だとそこが壊れる。
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

/** 1回のトレーニングセッション。 */
export const workouts = sqliteTable('workouts', {
  id: id(),
  // 日付のみ (YYYY-MM-DD)。同じ日に複数セッションを作ることは許す。
  performedOn: text('performed_on').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
})

/**
 * 1セットの記録。このアプリの主役テーブル。
 * 「前回この種目を何kgで何回やったか」を引くため exercise_id に索引を張る。
 *
 * weight_kg は**負数を許す**。懸垂のアシストマシンを使ったときの補助量を
 * マイナスで表すため（-36kg → -18kg という減少がそのまま上達の記録になる）。
 *
 * failed は「挙がらなかった」セット。重量に挑戦して0回だった記録を残せる。
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
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    failed: integer('failed', { mode: 'boolean' }).notNull().default(false),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index('sets_exercise_idx').on(t.exerciseId),
    index('sets_workout_idx').on(t.workoutId),
  ],
)
