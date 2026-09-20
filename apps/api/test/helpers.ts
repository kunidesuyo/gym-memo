import { env } from 'cloudflare:workers'
import { createDb } from '../src/db'
import { exercises, sets, workouts } from '../src/db/schema'

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
      { name: 'ベンチプレス', muscleGroup: 'chest' },
      { name: 'スクワット', muscleGroup: 'legs' },
    ])
    .returning()

  if (!bench || !squat) throw new Error('種目のシードに失敗しました')
  return { bench, squat }
}
