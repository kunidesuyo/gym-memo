import { toKg } from '../weight'

/** DB の行（g）を API が返す形（kg）に直す。保存形式を外に漏らさないための境界。 */
export const withKg = <T extends { weightG: number }>({
  weightG,
  ...rest
}: T) => ({
  ...rest,
  weightKg: toKg(weightG),
})
