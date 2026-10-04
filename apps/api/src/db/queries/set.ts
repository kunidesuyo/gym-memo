import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { sets, workouts } from '../schema'
import { toG } from '../weight'
import { withKg } from './shared'

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
 * 前回この種目をやったときのセットを、そのまま今日に複製する。前回が無ければ null。
 *
 * ⚠️ kg に直さずグラムのまま写す。往復すると `Math.round` を余計に挟む。
 * ⚠️ setOrder を 1 から振り直すので、今日すでに記録がある種目には呼ばないこと
 *    （ルート側で 409 にしている）。
 */
export async function copyLastSets(
  db: Db,
  workoutId: string,
  exerciseId: string,
) {
  const [last] = await db
    .select({ workoutId: workouts.id })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, exerciseId), ne(sets.workoutId, workoutId)))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(1)

  if (!last) return null

  const source = await db
    .select()
    .from(sets)
    .where(
      and(eq(sets.workoutId, last.workoutId), eq(sets.exerciseId, exerciseId)),
    )
    .orderBy(sets.setOrder, sets.id)

  if (source.length === 0) return null

  const rows = await db
    .insert(sets)
    .values(
      source.map((s, i) => ({
        workoutId,
        exerciseId,
        setOrder: i + 1,
        weightG: s.weightG,
        reps: s.reps,
        // 失敗も含めてそのまま写す。画面に出ている内容と一致させるため
        isSuccessful: s.isSuccessful,
        isMainSet: s.isMainSet,
        note: s.note,
      })),
    )
    .returning()

  return rows.map(withKg)
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
