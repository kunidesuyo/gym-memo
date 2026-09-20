import { z } from 'zod'

export const newWorkoutSchema = z.object({
  /** 日付のみ。YYYY-MM-DD */
  performedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
})

export type NewWorkout = z.infer<typeof newWorkoutSchema>
