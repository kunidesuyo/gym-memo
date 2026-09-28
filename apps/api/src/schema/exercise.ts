import { z } from 'zod'

/**
 * 分割。PPL に「その他」を足した4分類。
 * 腹筋系は PPL のどこにも綺麗に入らないので other に置く。
 */
export const categories = ['push', 'pull', 'legs', 'other'] as const
export const categorySchema = z.enum(categories, '分割の指定が不正です')
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
  'other',
] as const
export const muscleGroupSchema = z.enum(muscleGroups, '部位の指定が不正です')
export type MuscleGroup = z.infer<typeof muscleGroupSchema>

export const categoryLabels: Record<Category, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  other: 'その他',
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
  calves: 'カーフ',
  other: 'その他',
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
  other: 'other',
}

export const newExerciseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '種目名を入力してください')
    .max(50, '長すぎます'),
  category: categorySchema,
  muscleGroup: muscleGroupSchema,
  /** 分割の中での表示順。小さいほど上。既定 999 = 未設定で、下に沈む。 */
  displayOrder: z
    .number('数値で入力してください')
    .int('整数で入力してください')
    .min(0, '0以上で入力してください')
    .max(9999, '大きすぎます')
    .default(999),
})

export type NewExercise = z.infer<typeof newExerciseSchema>

/** 一覧の絞り込み。 */
export const exerciseQuerySchema = z.object({
  category: categorySchema.optional(),
})

/** フォーム入力用。文字列で届くので数値に直す。空欄は未設定（999）。 */
export const exerciseFormSchema = newExerciseSchema.extend({
  displayOrder: z
    .string()
    .transform((v) => (v.trim() === '' ? 999 : Number(v)))
    .pipe(
      z
        .number('数値で入力してください')
        .int('整数で入力してください')
        .min(0, '0以上で入力してください')
        .max(9999, '大きすぎます'),
    ),
})
