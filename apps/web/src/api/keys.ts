/**
 * queryKey の一元管理。
 *
 * 文字列を直書きすると invalidate の粒度を後から変えられなくなるので、
 * 「階層 = 無効化の単位」になるよう設計する。
 *   ['workouts']        → 一覧
 *   ['workouts', id]    → 個別。['workouts'] を invalidate すると両方が対象になる
 */
export const keys = {
  exercises: (category?: string) => ['exercises', { category }] as const,
  workouts: () => ['workouts'] as const,
  workout: (id: string) => ['workouts', id] as const,
  exerciseHistory: (exerciseId: string) =>
    ['exercises', exerciseId, 'history'] as const,
  lastSets: (exerciseId: string, excludeWorkoutId?: string) =>
    ['exercises', exerciseId, 'last-sets', { excludeWorkoutId }] as const,
}
