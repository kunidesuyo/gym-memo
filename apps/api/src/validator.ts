import { zValidator as zv } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'

/**
 * `@hono/zod-validator` のラッパー。
 *
 * 素の zValidator は 400 で `{ success: false, error: <ZodError オブジェクト> }` を返す。
 * これをクライアントが `body.error` として読むとオブジェクトになり、
 * `new Error(obj).message` が "[object Object]" になって画面に出てしまう。
 * さらに Zod スキーマに書いた日本語メッセージがネストの奥で潰れて届かない。
 *
 * ここで hook を挟み、アプリ共通の `{ error: string }` に揃える。
 */
export const zValidator = <
  T extends z.ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues[0]?.message ?? '入力が不正です' },
        400,
      )
    }
  })
