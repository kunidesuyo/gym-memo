import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

/** 種目マスタ。フェーズ1では固定シードのみで、CRUD は作らない。 */
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
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
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index('sets_exercise_idx').on(t.exerciseId),
    index('sets_workout_idx').on(t.workoutId),
  ],
)
