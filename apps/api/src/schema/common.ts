import { z } from 'zod'

/**
 * URL パラメータの :id。
 *
 * 生成しているのは UUIDv7 のみだが、検索キーとしての検証はバージョンを問わない
 * `z.uuid()` にしてある。将来クライアント発行に変えたときに版を縛って困らないため。
 * 存在しない ID は 404 で返せばよい。
 */
export const idParamSchema = z.object({
  id: z.uuid('ID の形式が不正です'),
})
