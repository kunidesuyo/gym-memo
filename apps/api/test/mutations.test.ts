import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { addSet, createWorkout, getWorkout } from '../src/db/queries'
import { sets } from '../src/db/schema'
import { resetDb, seedExercises, testDb } from './helpers'

const BASE = 'https://example.com'

/** 形式は正しいが存在しない UUID。404 の確認に使う。 */
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'

let benchId: string

beforeEach(async () => {
  await resetDb()
  benchId = (await seedExercises()).bench.id
})

function send(method: string, path: string, body?: unknown) {
  return exports.default.fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

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

describe('PATCH /api/sets/:id', () => {
  it('重量・回数・メモを修正できる', async () => {
    const { a } = await threeSets()

    const res = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: 62.5,
      reps: 9,
      note: '修正した',
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      weightKg: 62.5,
      reps: 9,
      note: '修正した',
      setOrder: 1, // 並び順は変わらない
    })
  })

  it('不正な値は 400', async () => {
    const { a } = await threeSets()
    const res = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: -1,
      reps: 9,
    })
    expect(res.status).toBe(400)
  })

  it('存在しない ID は 404', async () => {
    const res = await send('PATCH', `/api/sets/${MISSING_ID}`, {
      weightKg: 60,
      reps: 10,
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/sets/:id', () => {
  it('削除すると setOrder が詰め直される（歯抜けにしない）', async () => {
    const { workout, b } = await threeSets()

    const res = await send('DELETE', `/api/sets/${b.id}`)
    expect(res.status).toBe(204)

    const after = await getWorkout(testDb(), workout.id)
    expect(after?.sets.map((s) => [s.setOrder, s.weightKg])).toEqual([
      [1, 60],
      [2, 70], // 3 → 2 に詰まっている
    ])
  })

  it('存在しない ID は 404', async () => {
    const res = await send('DELETE', `/api/sets/${MISSING_ID}`)
    expect(res.status).toBe(404)
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

describe('onError（未捕捉の例外）', () => {
  it('DB の制約違反は 500 と { error: string } になる', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-21')

    // 形式は正しいが存在しない種目 ID → 外部キー制約違反で例外が飛ぶ。
    // onError が無いと Hono 既定のプレーンテキスト 500 になる。
    const res = await send('POST', `/api/workouts/${w.id}/sets`, {
      exerciseId: MISSING_ID,
      weightKg: 60,
      reps: 10,
    })

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
    // 内部のエラー文言をそのまま漏らさない
    expect(body.error).not.toMatch(/FOREIGN KEY|SQLITE|constraint/i)
  })
})
