import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BASE,
  MISSING_ID,
  post,
  resetDb,
  seedExercises,
  send,
  testDb,
} from '../test/helpers'
import { addSet } from './db/queries/set'
import { createWorkout, getWorkout } from './db/queries/workout'
import { sets } from './db/schema'

/** `/api/workouts` 以下のルート（ぶら下がる sets もここ）。 */
let benchId: string

beforeEach(async () => {
  await resetDb()
  benchId = (await seedExercises()).bench.id
})

async function threeSets() {
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
    exerciseId: benchId,
    weightKg: 70,
    reps: 5,
  })
  return { workout: w, a, b, c }
}

describe('POST /api/workouts', () => {
  it('セッションを作成して 201 を返す', async () => {
    const res = await post('/api/workouts', { performedOn: '2026-09-20' })
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      performedOn: '2026-09-20',
    })
  })

  it('同じ日に2つ目を作ろうとすると 409（1日1セッション）', async () => {
    const first = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await first.json()) as { id: string }

    const res = await post('/api/workouts', { performedOn: '2026-09-20' })
    expect(res.status).toBe(409)
    // 画面が既存のセッションへ遷移できるよう id を添えて返す
    await expect(res.json()).resolves.toEqual({
      error: 'この日のセッションは既にあります',
      workoutId: id,
    })
  })

  it('日付が違えば作れる', async () => {
    await post('/api/workouts', { performedOn: '2026-09-20' })
    const res = await post('/api/workouts', { performedOn: '2026-09-21' })
    expect(res.status).toBe(201)
  })

  it('日付の形式が不正なら 400（Zod が弾く）', async () => {
    const res = await post('/api/workouts', { performedOn: '2026/09/20' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'YYYY-MM-DD 形式で指定してください',
    })
  })

  it('UUID でないパスパラメータも { error: string } で返す', async () => {
    const res = await exports.default.fetch(`${BASE}/api/workouts/not-a-uuid`)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
  })
})

describe('GET /api/workouts', () => {
  it('新しい順に、日付と id だけを返す', async () => {
    await post('/api/workouts', { performedOn: '2026-09-13' })
    await post('/api/workouts', { performedOn: '2026-09-20' })

    const res = await exports.default.fetch(`${BASE}/api/workouts`)
    expect(res.status).toBe(200)

    const rows = (await res.json()) as Record<string, unknown>[]
    expect(rows.map((r) => r.performedOn)).toEqual(['2026-09-20', '2026-09-13'])
    // カレンダーは日付しか使わないので、セット数は返さない
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['id', 'performedOn'])
  })
})

describe('POST /api/workouts/:id/sets', () => {
  it('セットを記録して 201 を返す', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: string }

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
    const res = await post(`/api/workouts/${MISSING_ID}/sets`, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })
    expect(res.status).toBe(404)
  })

  it('負の重量は「補助」として受け付ける（懸垂のアシスト）', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: string }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: -18,
      reps: 10,
    })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ weightKg: -18 })
  })

  it('補助が大きすぎる場合は 400', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: string }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: -600,
      reps: 10,
    })
    expect(res.status).toBe(400)
  })

  it('失敗したセットは回数0で記録できる', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: string }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: 85,
      reps: 0,
      isSuccessful: false,
    })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      weightKg: 85,
      reps: 0,
      isSuccessful: false,
    })
  })

  it('成功のまま回数0は 400', async () => {
    const created = await post('/api/workouts', { performedOn: '2026-09-20' })
    const { id } = (await created.json()) as { id: string }

    const res = await post(`/api/workouts/${id}/sets`, {
      exerciseId: benchId,
      weightKg: 85,
      reps: 0,
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: '成功したセットは回数を1以上にしてください',
    })
  })
})

describe('POST /api/workouts/:id/sets/copy-last', () => {
  /** 前回のセッションを作り、ベンチのセットを3本入れる。 */
  async function seedPrevious() {
    const prev = await post('/api/workouts', { performedOn: '2026-09-13' })
    const prevId = ((await prev.json()) as { id: string }).id
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
      isMainSet: false,
      note: 'シート3段目',
    })
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: 65,
      reps: 8,
      isMainSet: true,
    })
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: 65,
      reps: 6,
      isSuccessful: false,
      isMainSet: true,
    })
    return prevId
  }

  async function newToday() {
    const today = await post('/api/workouts', { performedOn: '2026-09-20' })
    return ((await today.json()) as { id: string }).id
  }

  it('前回のセットをそのまま複製して 201 を返す', async () => {
    await seedPrevious()
    const todayId = await newToday()

    const res = await post(`/api/workouts/${todayId}/sets/copy-last`, {
      exerciseId: benchId,
    })
    expect(res.status).toBe(201)

    const rows = (await res.json()) as {
      setOrder: number
      weightKg: number
      reps: number
      isSuccessful: boolean
      isMainSet: boolean
      note: string | null
    }[]

    // 失敗したセットもメモもそのまま写す。setOrder は 1 から振り直す。
    expect(rows).toMatchObject([
      {
        setOrder: 1,
        weightKg: 60,
        reps: 10,
        isSuccessful: true,
        isMainSet: false,
        note: 'シート3段目',
      },
      {
        setOrder: 2,
        weightKg: 65,
        reps: 8,
        isSuccessful: true,
        isMainSet: true,
      },
      {
        setOrder: 3,
        weightKg: 65,
        reps: 6,
        isSuccessful: false,
        isMainSet: true,
      },
    ])
  })

  it('負数の重量が丸めで壊れない（懸垂のアシスト量）', async () => {
    const prev = await post('/api/workouts', { performedOn: '2026-09-13' })
    const prevId = ((await prev.json()) as { id: string }).id
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: -18.5,
      reps: 10,
    })

    const todayId = await newToday()
    const res = await post(`/api/workouts/${todayId}/sets/copy-last`, {
      exerciseId: benchId,
    })

    const rows = (await res.json()) as { weightKg: number }[]
    expect(rows[0]?.weightKg).toBe(-18.5)
  })

  it('今日すでにその種目の記録があれば 409（押し間違いで倍にしない）', async () => {
    await seedPrevious()
    const todayId = await newToday()
    await post(`/api/workouts/${todayId}/sets`, {
      exerciseId: benchId,
      weightKg: 60,
      reps: 10,
    })

    const res = await post(`/api/workouts/${todayId}/sets/copy-last`, {
      exerciseId: benchId,
    })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      error: 'この種目は今日すでに記録があります',
    })
  })

  it('前回の記録が無ければ 404', async () => {
    const todayId = await newToday()
    const res = await post(`/api/workouts/${todayId}/sets/copy-last`, {
      exerciseId: benchId,
    })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      error: 'この種目の前回の記録がありません',
    })
  })

  it('存在しないセッションには 404', async () => {
    await seedPrevious()
    const res = await post(`/api/workouts/${MISSING_ID}/sets/copy-last`, {
      exerciseId: benchId,
    })
    expect(res.status).toBe(404)
  })

  it('種目の ID が不正なら 400', async () => {
    const todayId = await newToday()
    const res = await post(`/api/workouts/${todayId}/sets/copy-last`, {
      exerciseId: 'not-a-uuid',
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/workouts/:id', () => {
  it('セッションを消すとぶら下がるセットも消える（FK の CASCADE）', async () => {
    const { workout } = await threeSets()

    const res = await send('DELETE', `/api/workouts/${workout.id}`)
    expect(res.status).toBe(204)

    expect(await getWorkout(testDb(), workout.id)).toBeNull()
    expect(await testDb().select().from(sets)).toHaveLength(0)
  })

  it('存在しない ID は 404', async () => {
    const res = await send('DELETE', `/api/workouts/${MISSING_ID}`)
    expect(res.status).toBe(404)
  })
})
