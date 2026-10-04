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
import { createWorkout } from './db/queries/workout'
import { exercises } from './db/schema'

/** `/api/exercises` 以下のルート。 */
let benchId: string
let squatId: string

beforeEach(async () => {
  await resetDb()
  const { bench, squat } = await seedExercises()
  benchId = bench.id
  squatId = squat.id
})

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

  it('種目一覧を返す', async () => {
    const res = await exports.default.fetch(`${BASE}/api/exercises`)
    expect(res.status).toBe(200)
    const rows = (await res.json()) as { name: string }[]
    expect(rows.map((r) => r.name)).toContain('ベンチプレス')
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
    const prevId = ((await prev.json()) as { id: string }).id
    await post(`/api/workouts/${prevId}/sets`, {
      exerciseId: benchId,
      weightKg: 50,
      reps: 10,
    })

    const today = await post('/api/workouts', { performedOn: '2026-09-20' })
    const todayId = ((await today.json()) as { id: string }).id
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
