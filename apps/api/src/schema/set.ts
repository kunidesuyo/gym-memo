import { z } from 'zod'

/**
 * 1セットの入力。
 * このスキーマは web 側からも import され、TanStack Form の検証に使われる（1-c）。
 * サーバーとクライアントでルールがズレないようにするのが目的。
 */
export const newSetSchema = z.object({
  exerciseId: z.number().int().positive(),
  weightKg: z.number().nonnegative().max(1000, '重量が大きすぎます'),
  reps: z.number().int().positive().max(1000, '回数が大きすぎます'),
})

export type NewSet = z.infer<typeof newSetSchema>

/** 「前回の記録」取得時、記録中のワークアウト自身を除外するためのクエリ。 */
export const lastSetsQuerySchema = z.object({
  excludeWorkoutId: z.coerce.number().int().positive().optional(),
})
