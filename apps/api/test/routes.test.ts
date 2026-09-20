import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, seedExercises } from './helpers'

const BASE = 'https://example.com'

let benchId: number

beforeEach(async () => {
  await resetDb()
  const { bench } = await seedExercises()
  benchId = bench.id
})

function post(path: string, body: unknown) {
  return exports.default.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/exercises', () => {
  it('種目一覧を返す', async () => {
    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    expect(res.status).toBe(200)
    const rows = (await res.json()) as { name: string }[]
    expect(rows.map((r) => r.name)).toContain('ベンチプレス')
  })
})

describe('POST /api/workouts', () => {
  it('セッションを作成して 201 を返す', async () => {
    const res = await post('/api/workouts', { performedOn: '2026-09-20' })
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      performedOn: '2026-09-20',
    })
  })

  it('日付の形式が不正なら 400（Zod が弾く）', async () => {
    const res = await post('/api/workouts', { performedOn: '2026/09/20' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/workouts/:id/sets', () => {
  it('セットを記録して 201 を返す', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: number }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      setOrder: 1,
      weightKg: 60,
    })
  })

  it('存在しないセッションには 404（FK 違反の 500 にしない）', async () => {
    const res = await post('/api/workouts/9999/sets', {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })
    expect(res.status).toBe(404)
  })

  it('負の重量は 400', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: number }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: -5,
      reps: 10,
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/exercises/:id/last-sets', () => {
  it('記録がなければ null', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${benchId}/last-sets`,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toBeNull()
  })

  it('excludeWorkoutId で記録中のセッションを除外できる', async () => {
    const prev = await post('/api/workouts', { performedOn: '2026-09-10' })
    const prevId = ((await prev.json()) as { id: number }).id
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: 50,
      reps: 10,
    })

    const today = await post('/api/workouts', { performedOn: '2026-09-20' })
    const todayId = ((await today.json()) as { id: number }).id
    await post(`/api/workouts/${todayId}/sets`, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })

    const res = await exports.default.fetch(
      `${BASE}/api/exercises/${benchId}/last-sets?excludeWorkoutId=${todayId}`,
    )
    await expect(res.json()).resolves.toMatchObject({
      performedOn: '2026-09-10',
    })
  })
})
