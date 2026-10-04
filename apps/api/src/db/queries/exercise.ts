import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { categories, type NewExercise } from '../../schema/exercise'
import type { Db } from '../index'
import { exercises, sets, workouts } from '../schema'
import { withKg } from './shared'

/**
 * 分割の並び順。`categories` の定義順。
 * ⚠️ その他が末尾に来ることに記録画面が依存している。
 */
const categoryRank = sql`case ${exercises.category} ${sql.join(
  categories.map((c, i) => sql`when ${c} then ${i}`),
  sql` `,
)} end`

/**
 * 種目一覧。並びは 分割 → displayOrder → 名前。
 * ⚠️ sets を join しないこと。かつてセット数順に並べており、
 *    1回の呼び出しで sets を全件読んでいた（4,200行読んで51行返す）。
 */
export function listExercises(
  db: Db,
  category?: 'push' | 'pull' | 'legs' | 'other',
) {
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      category: exercises.category,
      muscleGroup: exercises.muscleGroup,
      displayOrder: exercises.displayOrder,
      createdAt: exercises.createdAt,
    })
    .from(exercises)
    .where(category ? eq(exercises.category, category) : undefined)
    .orderBy(categoryRank, exercises.displayOrder, exercises.name)
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

/**
 * 種目ごとの記録。セッション単位にまとめて新しい順に返す。
 *
 * 「どのセッションか」を先に絞ってから、そのセットを取る2段構え。
 * 1クエリで取って JS で切ると件数制限がかけられないため。
 */
export async function getExerciseHistory(
  db: Db,
  exerciseId: string,
  limit = 30,
) {
  const sessions = await db
    .select({ workoutId: workouts.id, performedOn: workouts.performedOn })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(limit)

  if (sessions.length === 0) return []

  const rows = await db
    .select({
      id: sets.id,
      workoutId: sets.workoutId,
      setOrder: sets.setOrder,
      weightG: sets.weightG,
      reps: sets.reps,
      isSuccessful: sets.isSuccessful,
      isMainSet: sets.isMainSet,
      note: sets.note,
    })
    .from(sets)
    .where(
      and(
        eq(sets.exerciseId, exerciseId),
        inArray(
          sets.workoutId,
          sessions.map((s) => s.workoutId),
        ),
      ),
    )
    .orderBy(sets.setOrder, sets.id)

  return sessions.map((s) => ({
    ...s,
    sets: rows
      .filter((r) => r.workoutId === s.workoutId)
      .map(({ workoutId: _, ...rest }) => withKg(rest)),
  }))
}
