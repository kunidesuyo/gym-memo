import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { Db } from './index'
import { exercises, sets, workouts } from './schema'

export function listExercises(db: Db) {
  return db.select().from(exercises).orderBy(exercises.id)
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
export async function getWorkout(db: Db, id: number) {
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
  workoutId: number,
  input: { exerciseId: number; weightKg: number; reps: number },
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
  exerciseId: number,
  excludeWorkoutId?: number,
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
    })
    .from(sets)
    .where(
      and(eq(sets.workoutId, last.workoutId), eq(sets.exerciseId, exerciseId)),
    )
    .orderBy(sets.setOrder, sets.id)

  return { ...last, sets: rows }
}
