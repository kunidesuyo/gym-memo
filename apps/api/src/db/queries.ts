import { and, count, desc, eq, ne, sql } from 'drizzle-orm'
import type { NewExercise } from '../schema/exercise'
import type { Db } from './index'
import { exercises, sets, workouts } from './schema'

export function listExercises(db: Db, category?: 'push' | 'pull' | 'legs') {
  return db
    .select()
    .from(exercises)
    .where(category ? eq(exercises.category, category) : undefined)
    .orderBy(exercises.category, exercises.muscleGroup, exercises.name)
}

export async function getExercise(db: Db, id: string) {
  const [row] = await db.select().from(exercises).where(eq(exercises.id, id))
  return row ?? null
}

export async function createExercise(db: Db, input: NewExercise) {
  const [row] = await db.insert(exercises).values(input).returning()
  if (!row) throw new Error('種目の作成に失敗しました')
  return row
}

export async function updateExercise(db: Db, id: string, input: NewExercise) {
  const [row] = await db
    .update(exercises)
    .set(input)
    .where(eq(exercises.id, id))
    .returning()
  return row ?? null
}

/** この種目を参照しているセットの件数。削除可否の判定に使う。 */
export async function countSetsForExercise(db: Db, exerciseId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId))
  return row?.n ?? 0
}

export async function deleteExercise(db: Db, id: string) {
  await db.delete(exercises).where(eq(exercises.id, id))
}

/** セッション一覧（新しい順）。セット数を添えて一覧表示に使う。 */
export function listWorkouts(db: Db) {
  return db
    .select({
      id: workouts.id,
      performedOn: workouts.performedOn,
      setCount: sql<number>`count(${sets.id})`,
    })
    .from(workouts)
    .leftJoin(sets, eq(sets.workoutId, workouts.id))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
}

export async function createWorkout(db: Db, performedOn: string) {
  const [row] = await db.insert(workouts).values({ performedOn }).returning()
  // INSERT ... RETURNING は必ず1行返す。ここで潰しておかないと
  // 戻り値が `T | undefined` になり、API のレスポンス型にも undefined が混入する。
  if (!row) throw new Error('workout の作成に失敗しました')
  return row
}

/** セッション1件と、そのセット（種目名つき）。 */
export async function getWorkout(db: Db, id: string) {
  const [workout] = await db.select().from(workouts).where(eq(workouts.id, id))
  if (!workout) return null

  const rows = await db
    .select({
      id: sets.id,
      exerciseId: sets.exerciseId,
      exerciseName: exercises.name,
      setOrder: sets.setOrder,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .where(eq(sets.workoutId, id))
    .orderBy(sets.exerciseId, sets.setOrder, sets.id)

  return { ...workout, sets: rows }
}

/**
 * セットを追加する。
 * setOrder はクライアントに決めさせず、同一ワークアウト×種目の連番をサーバーが採番する。
 */
export async function addSet(
  db: Db,
  workoutId: string,
  input: {
    exerciseId: string
    weightKg: number
    reps: number
    note?: string | null
  },
) {
  const [agg] = await db
    .select({ maxOrder: sql<number | null>`max(${sets.setOrder})` })
    .from(sets)
    .where(
      and(eq(sets.workoutId, workoutId), eq(sets.exerciseId, input.exerciseId)),
    )

  const [row] = await db
    .insert(sets)
    .values({
      workoutId,
      exerciseId: input.exerciseId,
      setOrder: (agg?.maxOrder ?? 0) + 1,
      weightKg: input.weightKg,
      reps: input.reps,
      note: input.note ?? null,
    })
    .returning()

  if (!row) throw new Error('set の作成に失敗しました')
  return row
}

/**
 * 「前回この種目をやったときの全セット」——このアプリの存在理由。
 *
 * 記録中のセッションを excludeWorkoutId で除外できるようにしてある。
 * そうしないと、今日1セット入れた時点で「前回」が今日になってしまう。
 */
export async function getLastSets(
  db: Db,
  exerciseId: string,
  excludeWorkoutId?: string,
) {
  const [last] = await db
    .select({ workoutId: workouts.id, performedOn: workouts.performedOn })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(
      and(
        eq(sets.exerciseId, exerciseId),
        excludeWorkoutId === undefined
          ? undefined
          : ne(sets.workoutId, excludeWorkoutId),
      ),
    )
    .groupBy(workouts.id)
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(1)

  if (!last) return null

  const rows = await db
    .select({
      id: sets.id,
      setOrder: sets.setOrder,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
    })
    .from(sets)
    .where(
      and(eq(sets.workoutId, last.workoutId), eq(sets.exerciseId, exerciseId)),
    )
    .orderBy(sets.setOrder, sets.id)

  return { ...last, sets: rows }
}

export async function getSet(db: Db, id: string) {
  const [row] = await db.select().from(sets).where(eq(sets.id, id))
  return row ?? null
}

export async function updateSet(
  db: Db,
  id: string,
  input: { weightKg: number; reps: number; note?: string | null },
) {
  const [row] = await db
    .update(sets)
    .set({
      weightKg: input.weightKg,
      reps: input.reps,
      note: input.note ?? null,
    })
    .where(eq(sets.id, id))
    .returning()
  return row ?? null
}

/**
 * セットを削除し、同じワークアウト×種目の setOrder を 1 から詰め直す。
 *
 * 詰め直さないと 1,3 のような歯抜けになり、記録として不自然に見える。
 * 件数が小さい（1種目あたい数セット）ので素直に順次 UPDATE する。
 */
export async function deleteSet(db: Db, id: string) {
  const target = await getSet(db, id)
  if (!target) return null

  await db.delete(sets).where(eq(sets.id, id))

  const rest = await db
    .select({ id: sets.id })
    .from(sets)
    .where(
      and(
        eq(sets.workoutId, target.workoutId),
        eq(sets.exerciseId, target.exerciseId),
      ),
    )
    .orderBy(sets.setOrder, sets.id)

  for (const [i, row] of rest.entries()) {
    await db
      .update(sets)
      .set({ setOrder: i + 1 })
      .where(eq(sets.id, row.id))
  }

  return target
}

export async function deleteWorkout(db: Db, id: string) {
  await db.delete(workouts).where(eq(workouts.id, id))
}
