import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSet,
  createWorkout,
  getLastSets,
  getWorkout,
} from '../src/db/queries'
import { resetDb, seedExercises, testDb } from './helpers'

/** 形式は正しいが存在しない UUID。404 の確認に使う。 */
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'

let benchId: string
let squatId: string

beforeEach(async () => {
  await resetDb()
  const { bench, squat } = await seedExercises()
  benchId = bench.id
  squatId = squat.id
})

describe('addSet', () => {
  it('setOrder を種目ごとに 1 から採番する', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-20')

    const a = await addSet(db, w.id, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })
    const b = await addSet(db, w.id, {
      exerciseId: benchId,
      weightKg: 65,
      reps: 8,
    })
    const c = await addSet(db, w.id, {
      exerciseId: squatId,
      weightKg: 80,
      reps: 5,
    })

    expect(a.setOrder).toBe(1)
    expect(b.setOrder).toBe(2)
    // 種目が違えば連番は独立している
    expect(c.setOrder).toBe(1)
  })
})

describe('getWorkout', () => {
  it('セットを種目名つきで返す', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-20')
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })

    const got = await getWorkout(db, w.id)

    expect(got?.performedOn).toBe('2026-09-20')
    expect(got?.sets).toHaveLength(1)
    expect(got?.sets[0]).toMatchObject({
      exerciseName: 'ベンチプレス',
      weightKg: 60,
      reps: 10,
    })
  })

  it('存在しない ID には null', async () => {
    expect(await getWorkout(testDb(), MISSING_ID)).toBeNull()
  })
})

describe('getLastSets —— このアプリの存在理由', () => {
  it('記録がなければ null', async () => {
    expect(await getLastSets(testDb(), benchId)).toBeNull()
  })

  it('直近のセッションのセットを順番どおり返す', async () => {
    const db = testDb()
    const old = await createWorkout(db, '2026-09-10')
    await addSet(db, old.id, { exerciseId: benchId, weightKg: 50, reps: 10 })

    const recent = await createWorkout(db, '2026-09-18')
    await addSet(db, recent.id, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })
    await addSet(db, recent.id, { exerciseId: benchId, weightKg: 65, reps: 8 })

    const last = await getLastSets(db, benchId)

    expect(last?.performedOn).toBe('2026-09-18')
    expect(last?.sets.map((s) => s.weightKg)).toEqual([60, 65])
  })

  it('他の種目のセットを混ぜない', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-18')
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })
    await addSet(db, w.id, { exerciseId: squatId, weightKg: 100, reps: 5 })

    const last = await getLastSets(db, benchId)

    expect(last?.sets).toHaveLength(1)
    expect(last?.sets[0]?.weightKg).toBe(60)
  })

  it('excludeWorkoutId で記録中のセッションを除外する', async () => {
    const db = testDb()
    const prev = await createWorkout(db, '2026-09-10')
    await addSet(db, prev.id, { exerciseId: benchId, weightKg: 50, reps: 10 })

    const today = await createWorkout(db, '2026-09-20')
    await addSet(db, today.id, { exerciseId: benchId, weightKg: 60, reps: 10 })

    // 除外しないと「前回」が今日になってしまう
    expect((await getLastSets(db, benchId))?.performedOn).toBe('2026-09-20')

    const last = await getLastSets(db, benchId, today.id)
    expect(last?.performedOn).toBe('2026-09-10')
    expect(last?.sets[0]?.weightKg).toBe(50)
  })
})
