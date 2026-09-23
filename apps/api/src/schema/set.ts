import { z } from 'zod'

/**
 * 1セットの入力。
 * このスキーマは web 側からも import され、TanStack Form の検証に使われる。
 * サーバーとクライアントでルールがズレないようにするのが目的。
 */
const setFields = {
  /**
   * 重量。**負数を許す**。
   * 懸垂のアシストマシンの補助量をマイナスで表すため
   * （-36kg → -18kg という減少がそのまま上達の記録になる）。
   */
  weightKg: z
    .number('数値で入力してください')
    .min(-500, '補助が大きすぎます')
    .max(1000, '重量が大きすぎます'),
  /** 失敗（isSuccessful=false）のときだけ 0 を許す。保証は下の refine で。 */
  reps: z
    .number('数値で入力してください')
    .int('回数は整数で指定してください')
    .nonnegative('回数は0以上で指定してください')
    .max(1000, '回数が大きすぎます'),
  /**
   * 挙がったかどうか。false = 重量に挑戦して0回だった記録。
   * 否定形（failed）だと二重否定が生まれて読みにくいので肯定形で持つ。
   */
  isSuccessful: z.boolean().default(true),
  note: z.string().trim().max(200, 'メモが長すぎます').nullish(),
}

/** 成功したセットは必ず1回以上挙がっているはず。 */
const repsOk = (v: { isSuccessful: boolean; reps: number }) =>
  v.isSuccessful ? v.reps >= 1 : true
const repsError = {
  message: '成功したセットは回数を1以上にしてください',
  path: ['reps'],
}

export const newSetSchema = z
  .object({ exerciseId: z.uuid('種目の ID が不正です'), ...setFields })
  .refine(repsOk, repsError)

export type NewSet = z.infer<typeof newSetSchema>

/** セット入力（種目は画面側の select が持つので除く）。 */
export const setInputSchema = z.object(setFields).refine(repsOk, repsError)

export type SetInput = z.infer<typeof setInputSchema>

/**
 * セットの修正。種目は変更できない。
 * 変えると setOrder（ワークアウト×種目ごとの連番）の意味が壊れるため。
 */
export const updateSetSchema = setInputSchema

/**
 * フォーム入力用。<input> からは文字列で届くので、
 * 「空でないこと」を見てから数値に変換する。
 * TanStack Form の検証にそのまま渡せる（Standard Schema 対応）。
 */
export const setFormSchema = z
  .object({
    note: z.string().trim().max(200, 'メモが長すぎます'),
    isSuccessful: z.boolean(),
    weightKg: z
      .string()
      .min(1, '重量を入力してください')
      .transform(Number)
      .pipe(
        z
          .number('数値で入力してください')
          .min(-500, '補助が大きすぎます')
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
          .nonnegative('0以上で入力してください')
          .max(1000, '回数が大きすぎます'),
      ),
  })
  .refine(repsOk, repsError)

/** 「前回の記録」取得時、記録中のワークアウト自身を除外するためのクエリ。 */
export const lastSetsQuerySchema = z.object({
  excludeWorkoutId: z.uuid('セッションの ID が不正です').optional(),
})
