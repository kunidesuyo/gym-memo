import { z } from 'zod'

/** PPL 分割。種目選択の絞り込みに使う。 */
export const categories = ['push', 'pull', 'legs'] as const
export const categorySchema = z.enum(categories)
export type Category = z.infer<typeof categorySchema>

/** 細かい部位。情報として持つ。 */
export const muscleGroups = [
  'chest',
  'shoulders',
  'triceps',
  'back',
  'biceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
] as const
export const muscleGroupSchema = z.enum(muscleGroups)
export type MuscleGroup = z.infer<typeof muscleGroupSchema>

export const categoryLabels: Record<Category, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
}

export const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: '胸',
  shoulders: '肩',
  triceps: '三頭',
  back: '背中',
  biceps: '二頭',
  quads: '大腿四頭',
  hamstrings: 'ハム',
  glutes: '臀部',
  calves: 'ふくらはぎ',
  abs: '腹',
}

/**
 * 部位を選んだときに category を自動で埋めるための対応表。
 * category と muscleGroup は独立したカラムなので「胸なのに pull」を作れてしまう。
 * DB 制約ではなく、この既定値で矛盾を作りにくくする（ユーザーは変更できる）。
 */
export const defaultCategoryFor: Record<MuscleGroup, Category> = {
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  back: 'pull',
  biceps: 'pull',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  abs: 'legs', // PPL に素直に収まらないので便宜的。ユーザーが変更できる
}

export const newExerciseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '種目名を入力してください')
    .max(50, '長すぎます'),
  category: categorySchema,
  muscleGroup: muscleGroupSchema,
})

export type NewExercise = z.infer<typeof newExerciseSchema>

/** 一覧の絞り込み。 */
export const exerciseQuerySchema = z.object({
  category: categorySchema.optional(),
})
