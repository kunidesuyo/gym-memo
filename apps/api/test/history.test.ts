import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { addSet, createWorkout } from '../src/db/queries'
import { resetDb, seedExercises, testDb } from './helpers'

const BASE = 'https://example.com'

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

describe('GET /api/exercises/:id/history', () => {
  it('記録がなければ空配列', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${benchId}/history`,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      exercise: { name: 'ベンチプレス' },
      sessions: [],
    })
  })

  it('セッション単位にまとめて新しい順に返す', async () => {
    const db = testDb()

    const old = await createWorkout(db, '2026-09-06')
    await addSet(db, old.id, { exerciseId: benchId, weightKg: 55, reps: 10 })

    const mid = await createWorkout(db, '2026-09-13')
    await addSet(db, mid.id, { exerciseId: benchId, weightKg: 60, reps: 10 })
    await addSet(db, mid.id, { exerciseId: benchId, weightKg: 65, reps: 8 })

    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${benchId}/history`,
    )
    const body = (await res.json()) as {
      sessions: { performedOn: string; sets: { weightKg: number }[] }[]
    }

    expect(body.sessions.map((s) => s.performedOn)).toEqual([
      '2026-09-13',
      '2026-09-06',
    ])
    expect(body.sessions[0]?.sets.map((s) => s.weightKg)).toEqual([60, 65])
  })

  it('他の種目のセットを混ぜない', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-13')
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })
    await addSet(db, w.id, { exerciseId: squatId, weightKg: 100, reps: 5 })

    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${benchId}/history`,
    )
    const body = (await res.json()) as {
      sessions: { sets: { weightKg: number }[] }[]
    }

    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0]?.sets.map((s) => s.weightKg)).toEqual([60])
  })

  it('存在しない種目は 404', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${MISSING_ID}/history`,
    )
    expect(res.status).toBe(404)
  })
})
