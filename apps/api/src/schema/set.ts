import { z } from 'zod'

/**
 * 1セットの入力。
 * このスキーマは web 側からも import され、TanStack Form の検証に使われる（1-c）。
 * サーバーとクライアントでルールがズレないようにするのが目的。
 */
export const newSetSchema = z.object({
  exerciseId: z.uuid('種目の ID が不正です'),
  weightKg: z
    .number()
    .nonnegative('重量は0以上で指定してください')
    .max(1000, '重量が大きすぎます'),
  reps: z
    .number()
    .int('回数は整数で指定してください')
    .positive('回数は1以上で指定してください')
    .max(1000, '回数が大きすぎます'),
  note: z.string().trim().max(200, 'メモが長すぎます').nullish(),
})

export type NewSet = z.infer<typeof newSetSchema>

/** セット入力（種目は画面側の select が持つので除く）。 */
export const setInputSchema = newSetSchema.omit({ exerciseId: true })

/**
 * セットの修正。種目は変更できない。
 * 変えると setOrder（ワークアウト×種目ごとの連番）の意味が壊れるため。
 */
export const updateSetSchema = setInputSchema

export type SetInput = z.infer<typeof setInputSchema>

/**
 * フォーム入力用。<input> からは文字列で届くので、
 * 「空でないこと」を見てから数値に変換する。
 * TanStack Form の検証にそのまま渡せる（Standard Schema 対応）。
 */
export const setFormSchema = z.object({
  note: z.string().trim().max(200, 'メモが長すぎます'),
  weightKg: z
    .string()
    .min(1, '重量を入力してください')
    .transform(Number)
    .pipe(
      z
        .number('数値で入力してください')
        .nonnegative('0以上で入力してください')
        .max(1000, '重量が大きすぎます'),
    ),
  reps: z
    .string()
    .min(1, '回数を入力してください')
    .transform(Number)
    .pipe(
      z
        .number('数値で入力してください')
        .int('整数で入力してください')
        .positive('1以上で入力してください')
        .max(1000, '回数が大きすぎます'),
    ),
})

/** 「前回の記録」取得時、記録中のワークアウト自身を除外するためのクエリ。 */
export const lastSetsQuerySchema = z.object({
  excludeWorkoutId: z.uuid('セッションの ID が不正です').optional(),
})
