import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { addSet, createWorkout } from '../src/db/queries'
import { resetDb, seedExercises, testDb } from './helpers'

/** 形式は正しいが存在しない UUID。404 の確認に使う。 */
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'

const BASE = 'https://example.com'

let benchId: string
let squatId: string

beforeEach(async () => {
  await resetDb()
  const { bench, squat } = await seedExercises()
  benchId = bench.id
  squatId = squat.id
})

function send(method: string, path: string, body?: unknown) {
  return exports.default.fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('GET /api/exercises', () => {
  it('category で絞り込める', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/exercises?category=legs`,
    )
    const rows = (await res.json()) as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['スクワット'])
  })

  it('不正な category は 400', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/exercises?category=chest`,
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/exercises', () => {
  it('種目を追加できる', async () => {
    const res = await send('POST', '/api/exercises', {
      name: 'サイドレイズ',
      category: 'push',
      muscleGroup: 'shoulders',
    })
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      name: 'サイドレイズ',
      category: 'push',
    })
  })

  it('名前が重複したら 409（500 にしない）', async () => {
    const res = await send('POST', '/api/exercises', {
      name: 'ベンチプレス',
      category: 'push',
      muscleGroup: 'chest',
    })
    expect(res.status).toBe(409)
  })

  it('名前が空なら 400', async () => {
    const res = await send('POST', '/api/exercises', {
      name: '   ',
      category: 'push',
      muscleGroup: 'chest',
    })
    expect(res.status).toBe(400)
  })

  it('400 の body は { error: string } で、Zod のメッセージがそのまま入る', async () => {
    const res = await send('POST', '/api/exercises', {
      name: '   ',
      category: 'push',
      muscleGroup: 'chest',
    })

    // 素の zValidator は { success:false, error:<ZodErrorオブジェクト> } を返す。
    // それだとクライアントが body.error を文字列として扱えず "[object Object]" になる。
    await expect(res.json()).resolves.toEqual({
      error: '種目名を入力してください',
    })
  })

  it('enum にない部位は 400', async () => {
    const res = await send('POST', '/api/exercises', {
      name: '謎の種目',
      category: 'push',
      muscleGroup: 'tail',
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/exercises/:id', () => {
  it('種目を編集できる', async () => {
    const res = await send('PATCH', `/api/exercises/${benchId}`, {
      name: 'ダンベルベンチプレス',
      category: 'push',
      muscleGroup: 'chest',
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      name: 'ダンベルベンチプレス',
    })
  })

  it('他の種目と名前が衝突したら 409', async () => {
    const res = await send('PATCH', `/api/exercises/${benchId}`, {
      name: 'スクワット',
      category: 'push',
      muscleGroup: 'chest',
    })
    expect(res.status).toBe(409)
  })

  it('存在しない ID は 404', async () => {
    const res = await send('PATCH', `/api/exercises/${MISSING_ID}`, {
      name: '何か',
      category: 'push',
      muscleGroup: 'chest',
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/exercises/:id', () => {
  it('未使用なら削除できる', async () => {
    const res = await send('DELETE', `/api/exercises/${benchId}`)
    expect(res.status).toBe(204)

    const after = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await after.json()) as { id: string }[]
    expect(rows.some((r) => r.id === benchId)).toBe(false)
  })

  it('記録で使われていたら 409 で拒否する（履歴を壊さない）', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-20')
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })

    const res = await send('DELETE', `/api/exercises/${benchId}`)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ usedBy: 1 })
  })

  it('存在しない ID は 404', async () => {
    const res = await send('DELETE', `/api/exercises/${MISSING_ID}`)
    expect(res.status).toBe(404)
  })
})

describe('種目一覧の並び順', () => {
  it('セット数の多い順に並ぶ（記録画面の select がそのまま使える）', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-21')

    // スクワットを3セット、ベンチを1セット
    for (const weight of [100, 105, 110]) {
      await addSet(db, w.id, { exerciseId: squatId, weightKg: weight, reps: 5 })
    }
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })

    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await res.json()) as { name: string; setCount: number }[]

    expect(rows.map((r) => [r.name, r.setCount])).toEqual([
      ['スクワット', 3],
      ['ベンチプレス', 1],
    ])
  })

  it('記録が無い種目は setCount 0 で末尾に来る', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-21')
    await addSet(db, w.id, { exerciseId: benchId, weightKg: 60, reps: 10 })

    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await res.json()) as { name: string; setCount: number }[]

    expect(rows[0]).toMatchObject({ name: 'ベンチプレス', setCount: 1 })
    expect(rows[rows.length - 1]).toMatchObject({ setCount: 0 })
  })
})
