import { desc, eq } from 'drizzle-orm'
import type { Db } from '../index'
import { exercises, sets, workouts } from '../schema'
import { withKg } from './shared'

/**
 * セッション一覧（新しい順）。
 *
 * ホームのカレンダーが「記録のある日」を塗るために全件を引く。
 * 2年分でも数百行なので、月ごとに絞らず一度に返して手元で引く。
 */
export function listWorkouts(db: Db) {
  return db
    .select({ id: workouts.id, performedOn: workouts.performedOn })
    .from(workouts)
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
}

/** その日のセッション。1日1セッションなので高々1件。 */
export async function findWorkoutByDate(db: Db, performedOn: string) {
  const [row] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.performedOn, performedOn))
  return row ?? null
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
      weightG: sets.weightG,
      reps: sets.reps,
      isSuccessful: sets.isSuccessful,
      isMainSet: sets.isMainSet,
      note: sets.note,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .where(eq(sets.workoutId, id))
    .orderBy(sets.exerciseId, sets.setOrder, sets.id)

  return { ...workout, sets: rows.map(withKg) }
}

export async function deleteWorkout(db: Db, id: string) {
  await db.delete(workouts).where(eq(workouts.id, id))
}
