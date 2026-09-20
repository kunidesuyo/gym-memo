import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from './db'
import {
  addSet,
  createWorkout,
  getLastSets,
  getWorkout,
  listExercises,
} from './db/queries'
import { idParamSchema } from './schema/common'
import { lastSetsQuerySchema, newSetSchema } from './schema/set'
import { newWorkoutSchema } from './schema/workout'

/**
 * ルート定義。ここが Hono RPC の型の源になる。
 *
 * web 側はこのファイルだけを型解決する（Worker エントリの index.ts は読まない）。
 * メソッドチェーンで書いているのも RPC のためで、
 * 途中で変数に代入して分けると型が積み上がらない。
 */
export const routes = new Hono<{ Bindings: Env }>()
  .get('/api/health', (c) =>
    c.json({
      status: 'ok',
      runtime: 'workers',
      time: new Date().toISOString(),
    }),
  )

  .get('/api/exercises', async (c) => {
    const rows = await listExercises(createDb(c.env.DB))
    return c.json(rows)
  })

  .post('/api/workouts', zValidator('json', newWorkoutSchema), async (c) => {
    const { performedOn } = c.req.valid('json')
    const workout = await createWorkout(createDb(c.env.DB), performedOn)
    return c.json(workout, 201)
  })

  .get('/api/workouts/:id', zValidator('param', idParamSchema), async (c) => {
    const { id } = c.req.valid('param')
    const workout = await getWorkout(createDb(c.env.DB), id)
    if (!workout) return c.json({ error: 'workout not found' }, 404)
    return c.json(workout)
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

  .get(
    '/api/exercises/:id/last-sets',
    zValidator('param', idParamSchema),
    zValidator('query', lastSetsQuerySchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const { excludeWorkoutId } = c.req.valid('query')
      const last = await getLastSets(createDb(c.env.DB), id, excludeWorkoutId)
      return c.json(last)
    },
  )

export type AppType = typeof routes
