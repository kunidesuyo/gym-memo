import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { addSet, createWorkout } from '../src/db/queries'
import { exercises } from '../src/db/schema'
import { resetDb, seedExercises, testDb } from './helpers'

/** 形式は正しいが存在しない UUID。404 の確認に使う。 */
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'

const BASE = 'https://example.com'

let benchId: string

beforeEach(async () => {
  await resetDb()
  const { bench } = await seedExercises()
  benchId = bench.id
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
  it('分割 → displayOrder → 名前 の順に並ぶ', async () => {
    const db = testDb()
    await db.insert(exercises).values([
      { name: 'ラットプルダウン', category: 'pull', muscleGroup: 'back' },
      { name: '腹筋', category: 'other', muscleGroup: 'other' },
      {
        name: 'ディップス',
        category: 'push',
        muscleGroup: 'chest',
        displayOrder: 10,
      },
    ])

    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await res.json()) as { name: string }[]

    // 既定は 999 なので、番号を振ったディップスだけが上に来る
    expect(rows.map((r) => r.name)).toEqual([
      'ディップス',
      'ベンチプレス',
      'ラットプルダウン',
      'スクワット',
      '腹筋',
    ])
  })

  it('displayOrder が同じなら名前順（未設定のまま放置できる）', async () => {
    const db = testDb()
    await db
      .insert(exercises)
      .values([
        { name: 'アブローラー', category: 'push', muscleGroup: 'chest' },
      ])

    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await res.json()) as { name: string; displayOrder: number }[]
    const push = rows.filter((r) => r.displayOrder === 999).map((r) => r.name)

    expect(push.slice(0, 2)).toEqual(['アブローラー', 'ベンチプレス'])
  })

  // かつては sets を leftJoin して数えており、1回の呼び出しで sets を全件読んでいた
  it('セット数は返さない', async () => {
    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    const rows = (await res.json()) as Record<string, unknown>[]
    expect(rows[0]).not.toHaveProperty('setCount')
  })
})
