import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MISSING_ID,
  resetDb,
  seedExercises,
  send,
  testDb,
} from '../test/helpers'
import { createWorkout } from './db/queries/workout'

/**
 * routes.ts のうち**ドメインに属さない部分**。
 * 各リソースのテストは routes.<リソース>.test.ts にある（パスの先頭で決まる）。
 */
beforeEach(async () => {
  await resetDb()
  await seedExercises()
})

describe('GET /api/health', () => {
  it('200 と疎通情報を返す', async () => {
    const res = await exports.default.fetch('https://example.com/api/health')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ok',
      runtime: 'workers',
    })
  })

  it('未定義の API パスは 404 を返す（body も { error: string }）', async () => {
    const res = await exports.default.fetch('https://example.com/api/unknown')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'not found' })
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
