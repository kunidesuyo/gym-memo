import { z } from 'zod'

/** URL パラメータの :id。文字列で届くので数値に変換する。 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})
