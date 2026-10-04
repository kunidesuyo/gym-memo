import { beforeEach, describe, expect, it } from 'vitest'
import {
  MISSING_ID,
  resetDb,
  seedExercises,
  send,
  testDb,
} from '../test/helpers'
import { addSet } from './db/queries/set'
import { createWorkout, getWorkout } from './db/queries/workout'

/** `/api/sets` 以下のルート。作成は `/api/workouts/:id/sets` なので workouts 側。 */
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

  it('範囲外の値は 400', async () => {
    const { a } = await threeSets()
    const res = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: 2000,
      reps: 9,
    })
    expect(res.status).toBe(400)
  })

  it('成功→失敗に修正できる', async () => {
    const { a } = await threeSets()
    const res = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: 85,
      reps: 0,
      isSuccessful: false,
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      reps: 0,
      isSuccessful: false,
    })
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

describe('メインセット', () => {
  it('記録時の既定は false', async () => {
    const { a } = await threeSets()
    expect(a.isMainSet).toBe(false)
  })

  it('記録時に true で立てられる', async () => {
    const db = testDb()
    const w = await createWorkout(db, '2026-09-21')
    const row = await addSet(db, w.id, {
      exerciseId: benchId,
      weightKg: 70,
      reps: 5,
      isMainSet: true,
    })
    expect(row.isMainSet).toBe(true)
  })

  it('PATCH で立てたり外したりできる', async () => {
    const { a } = await threeSets()

    const on = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: 60,
      reps: 10,
      isMainSet: true,
    })
    await expect(on.json()).resolves.toMatchObject({ isMainSet: true })

    // isMainSet を省いたら false に戻る（Zod の default が効く）
    const off = await send('PATCH', `/api/sets/${a.id}`, {
      weightKg: 60,
      reps: 10,
    })
    await expect(off.json()).resolves.toMatchObject({ isMainSet: false })
  })

  it('セッション詳細の各セットに isMainSet が乗る', async () => {
    const { workout, b } = await threeSets()
    await send('PATCH', `/api/sets/${b.id}`, {
      weightKg: 65,
      reps: 8,
      isMainSet: true,
    })

    const detail = await getWorkout(testDb(), workout.id)
    expect(detail?.sets.map((s) => s.isMainSet)).toEqual([false, true, false])
  })
})
