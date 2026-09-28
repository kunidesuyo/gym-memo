import { Hono } from 'hono'
import { createDb } from './db'
import {
  addSet,
  copyLastSets,
  countSetsForExercise,
  createExercise,
  createWorkout,
  deleteExercise,
  deleteSet,
  deleteWorkout,
  findWorkoutByDate,
  getExercise,
  getExerciseHistory,
  getLastSets,
  getWorkout,
  listExercises,
  listWorkouts,
  updateExercise,
  updateSet,
} from './db/queries'
import { idParamSchema } from './schema/common'
import { exerciseQuerySchema, newExerciseSchema } from './schema/exercise'
import {
  copyLastSetsSchema,
  lastSetsQuerySchema,
  newSetSchema,
  updateSetSchema,
} from './schema/set'
import { newWorkoutSchema } from './schema/workout'
import { zValidator } from './validator'

/**
 * ルート定義。ここが Hono RPC の型の源になる。
 *
 * web 側はこのファイルだけを型解決する（Worker エントリの index.ts は読まない）。
 * メソッドチェーンで書いているのも RPC のためで、
 * 途中で変数に代入して分けると型が積み上がらない。
 */
export const routes = new Hono<{ Bindings: Env }>()
  .get('/api/health', (c) =>
    c.json(
      {
        status: 'ok',
        runtime: 'workers',
        time: new Date().toISOString(),
      },
      200,
    ),
  )

  .get(
    '/api/exercises',
    zValidator('query', exerciseQuerySchema),
    async (c) => {
      const { category } = c.req.valid('query')
      const rows = await listExercises(createDb(c.env.DB), category)
      // 明示的に 200 を付ける。付けないと型が ContentfulStatusCode になり、
      // web 側で InferResponseType<..., 200> による絞り込みが効かない。
      return c.json(rows, 200)
    },
  )

  .post('/api/exercises', zValidator('json', newExerciseSchema), async (c) => {
    const db = createDb(c.env.DB)
    const input = c.req.valid('json')

    // name は UNIQUE。DB 例外を 500 で返さず、意味のある 409 にする。
    const rows = await listExercises(db)
    if (rows.some((r) => r.name === input.name)) {
      return c.json({ error: '同じ名前の種目があります' }, 409)
    }

    const row = await createExercise(db, input)
    return c.json(row, 201)
  })

  .patch(
    '/api/exercises/:id',
    zValidator('param', idParamSchema),
    zValidator('json', newExerciseSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const db = createDb(c.env.DB)

      const rows = await listExercises(db)
      if (rows.some((r) => r.name === input.name && r.id !== id)) {
        return c.json({ error: '同じ名前の種目があります' }, 409)
      }

      const row = await updateExercise(db, id, input)
      if (!row) return c.json({ error: 'exercise not found' }, 404)
      return c.json(row, 200)
    },
  )

  .delete(
    '/api/exercises/:id',
    zValidator('param', idParamSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const db = createDb(c.env.DB)

      const exercise = await getExercise(db, id)
      if (!exercise) return c.json({ error: 'exercise not found' }, 404)

      // 物理削除の方針なので、履歴が壊れる参照があれば拒否する
      const used = await countSetsForExercise(db, id)
      if (used > 0) {
        return c.json(
          { error: `この種目は${used}件の記録で使われています`, usedBy: used },
          409,
        )
      }

      await deleteExercise(db, id)
      return c.body(null, 204)
    },
  )

  .get('/api/workouts', async (c) => {
    const rows = await listWorkouts(createDb(c.env.DB))
    return c.json(rows, 200)
  })

  .post('/api/workouts', zValidator('json', newWorkoutSchema), async (c) => {
    const { performedOn } = c.req.valid('json')
    const db = createDb(c.env.DB)

    // 1日1セッション。DB の UNIQUE 索引で弾かれると 500 になるので、
    // ここで意味のある 409 に変える（既存の id を添えて画面が遷移できるようにする）。
    const existing = await findWorkoutByDate(db, performedOn)
    if (existing) {
      return c.json(
        { error: 'この日のセッションは既にあります', workoutId: existing.id },
        409,
      )
    }

    const workout = await createWorkout(db, performedOn)
    return c.json(workout, 201)
  })

  .get('/api/workouts/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const workout = await getWorkout(createDb(c.env.DB), id)
    if (!workout) return c.json({ error: 'workout not found' }, 404)
    return c.json(workout, 200)
  })

  .post(
    '/api/workouts/:id/sets',
    zValidator('param', idParamSchema),
    zValidator('json', newSetSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const db = createDb(c.env.DB)

      // 存在しないセッションにぶら下げない（FK 違反を 500 ではなく 404 で返す）
      const workout = await getWorkout(db, id)
      if (!workout) return c.json({ error: 'workout not found' }, 404)

      const row = await addSet(db, id, input)
      return c.json(row, 201)
    },
  )

  /**
   * 前回の記録を種目まるごと今日に複製する。
   * ⚠️ 1件ずつ POST を繰り返さないこと。ジムの電波で N 往復すると
   *    途中で切れて「半分だけ入った」状態になる。
   */
  .post(
    '/api/workouts/:id/sets/copy-last',
    zValidator('param', idParamSchema),
    zValidator('json', copyLastSetsSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const { exerciseId } = c.req.valid('json')
      const db = createDb(c.env.DB)

      const workout = await getWorkout(db, id)
      if (!workout) return c.json({ error: 'workout not found' }, 404)

      // 押し間違いで倍になる事故のほうが、押し直せない不便より高くつく
      if (workout.sets.some((s) => s.exerciseId === exerciseId)) {
        return c.json({ error: 'この種目は今日すでに記録があります' }, 409)
      }

      const rows = await copyLastSets(db, id, exerciseId)
      if (!rows)
        return c.json({ error: 'この種目の前回の記録がありません' }, 404)

      return c.json(rows, 201)
    },
  )

  .delete(
    '/api/workouts/:id',
    zValidator('param', idParamSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const db = createDb(c.env.DB)

      const workout = await getWorkout(db, id)
      if (!workout) return c.json({ error: 'workout not found' }, 404)

      // ぶら下がるセットは FK の ON DELETE CASCADE で消える（D1 で動作確認済み）
      await deleteWorkout(db, id)
      return c.body(null, 204)
    },
  )

  .patch(
    '/api/sets/:id',
    zValidator('param', idParamSchema),
    zValidator('json', updateSetSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const row = await updateSet(createDb(c.env.DB), id, c.req.valid('json'))
      if (!row) return c.json({ error: 'set not found' }, 404)
      return c.json(row, 200)
    },
  )

  .delete('/api/sets/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    // 削除後に同じワークアウト×種目の setOrder を詰め直す
    const removed = await deleteSet(createDb(c.env.DB), id)
    if (!removed) return c.json({ error: 'set not found' }, 404)
    return c.body(null, 204)
  })

  .get(
    '/api/exercises/:id/history',
    zValidator('param', idParamSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const db = createDb(c.env.DB)

      const exercise = await getExercise(db, id)
      if (!exercise) return c.json({ error: 'exercise not found' }, 404)

      const sessions = await getExerciseHistory(db, id)
      return c.json({ exercise, sessions }, 200)
    },
  )

  .get(
    '/api/exercises/:id/last-sets',
    zValidator('param', idParamSchema),
    zValidator('query', lastSetsQuerySchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const { excludeWorkoutId } = c.req.valid('query')
      const last = await getLastSets(createDb(c.env.DB), id, excludeWorkoutId)
      return c.json(last, 200)
    },
  )

/**
 * 例外の受け皿。
 *
 * ⚠️ チェーンの「外」で呼ぶこと。チェーンに繋ぐと RPC の型の積み上げに混ざる。
 * `typeof routes` は宣言時点で確定するので、後から呼んでも AppType は変わらない。
 *
 * Workers Logs は構造化ログでないと検索できないので JSON で出す。
 */
routes.onError((err, c) => {
  console.error(
    JSON.stringify({
      message: 'unhandled error',
      error: err instanceof Error ? err.message : String(err),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
    }),
  )
  return c.json({ error: 'サーバーでエラーが発生しました' }, 500)
})

routes.notFound((c) => c.json({ error: 'not found' }, 404))

export type AppType = typeof routes
