import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { NewExercise } from '../schema/exercise'
import type { Db } from './index'
import { toG, toKg } from './weight'

/** DB の行（g）を API が返す形（kg）に直す。保存形式を外に漏らさないための境界。 */
const withKg = <T extends { weightG: number }>({ weightG, ...rest }: T) => ({
  ...rest,
  weightKg: toKg(weightG),
})

import { exercises, sets, workouts } from './schema'

/**
 * 種目一覧。記録済みのセット数を添える。
 *
 * 並びは**セット数の多い順**。よく使う種目が上に来るので、
 * 記録画面の種目選択がそのまま使える（種目が50件を超えるため）。
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
      createdAt: exercises.createdAt,
      setCount: count(sets.id),
    })
    .from(exercises)
    .leftJoin(sets, eq(sets.exerciseId, exercises.id))
    .where(category ? eq(exercises.category, category) : undefined)
    .groupBy(exercises.id)
    .orderBy(desc(count(sets.id)), exercises.name)
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
    isSuccessful?: boolean
    isMainSet?: boolean
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
      weightG: toG(input.weightKg),
      reps: input.reps,
      isSuccessful: input.isSuccessful ?? true,
      isMainSet: input.isMainSet ?? false,
      note: input.note ?? null,
    })
    .returning()

  if (!row) throw new Error('set の作成に失敗しました')
  return withKg(row)
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
      weightG: sets.weightG,
      reps: sets.reps,
      isSuccessful: sets.isSuccessful,
      isMainSet: sets.isMainSet,
      note: sets.note,
    })
    .from(sets)
    .where(
      and(eq(sets.workoutId, last.workoutId), eq(sets.exerciseId, exerciseId)),
    )
    .orderBy(sets.setOrder, sets.id)

  return { ...last, sets: rows.map(withKg) }
}

/** 内部専用。**kg に直していない**行をそのまま返すので export しない。 */
async function getSet(db: Db, id: string) {
  const [row] = await db.select().from(sets).where(eq(sets.id, id))
  return row ?? null
}

export async function updateSet(
  db: Db,
  id: string,
  input: {
    weightKg: number
    reps: number
    isSuccessful?: boolean
    isMainSet?: boolean
    note?: string | null
  },
) {
  const [row] = await db
    .update(sets)
    .set({
      weightG: toG(input.weightKg),
      reps: input.reps,
      isSuccessful: input.isSuccessful ?? true,
      isMainSet: input.isMainSet ?? false,
      note: input.note ?? null,
    })
    .where(eq(sets.id, id))
    .returning()
  return row ? withKg(row) : null
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
