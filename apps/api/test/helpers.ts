import { env, exports } from 'cloudflare:workers'
import { createDb } from '../src/db'
import { exercises, sets, workouts } from '../src/db/schema'

/** 形式は正しいが存在しない UUID。404 の確認に使う。 */
export const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'

export const BASE = 'https://example.com'

/** Worker を直接 fetch する。HTTP 層を通すテストはこれを使う。 */
export function send(method: string, path: string, body?: unknown) {
  return exports.default.fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const get = (path: string) => send('GET', path)
export const post = (path: string, body: unknown) => send('POST', path, body)

export function testDb() {
  return createDb(env.DB)
}

/**
 * vitest-pool-workers v0.22 のストレージ分離は「テストファイル単位」であり、
 * 同一ファイル内のテストは状態を共有する。よって beforeEach で明示的に消す。
 * 外部キーがあるので削除順序に注意。
 */
export async function resetDb() {
  const db = testDb()
  await db.delete(sets)
  await db.delete(workouts)
  await db.delete(exercises)
}

/** テストは本番の seed.sql に依存せず、自分でフィクスチャを用意する。 */
export async function seedExercises() {
  const [bench, squat] = await testDb()
    .insert(exercises)
    .values([
      { name: 'ベンチプレス', category: 'push', muscleGroup: 'chest' },
      { name: 'スクワット', category: 'legs', muscleGroup: 'quads' },
    ])
    .returning()

  if (!bench || !squat) throw new Error('種目のシードに失敗しました')
  return { bench, squat }
}
