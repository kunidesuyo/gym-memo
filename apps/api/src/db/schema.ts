import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

/**
 * 種目マスタ。ユーザーが自分で追加・編集・削除する。
 * 削除は物理削除で、セットから参照されている場合は API 側で拒否する（409）。
 *
 * category(PPL) と muscleGroup(細かい部位) は独立したカラム。
 * 矛盾は DB 制約ではなく画面側の既定値で防ぐ（schema/exercise.ts の defaultCategoryFor）。
 */
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  category: text('category').notNull().$type<'push' | 'pull' | 'legs'>(),
  muscleGroup: text('muscle_group').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
})

/** 1回のトレーニングセッション。 */
export const workouts = sqliteTable('workouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // 日付のみ (YYYY-MM-DD)。同じ日に複数セッションを作ることは許す。
  performedOn: text('performed_on').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
})

/**
 * 1セットの記録。このアプリの主役テーブル。
 * 「前回この種目を何kgで何回やったか」を引くため exercise_id に索引を張る。
 */
export const sets = sqliteTable(
  'sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setOrder: integer('set_order').notNull(),
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index('sets_exercise_idx').on(t.exerciseId),
    index('sets_workout_idx').on(t.workoutId),
  ],
)
