import { beforeEach, describe, expect, it } from 'vitest'
import {
  MISSING_ID,
  resetDb,
  seedExercises,
  testDb,
} from '../../../test/helpers'
import { addSet } from './set'
import { createWorkout, getWorkout } from './workout'

let benchId: string

beforeEach(async () => {
  await resetDb()
  benchId = (await seedExercises()).bench.id
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
