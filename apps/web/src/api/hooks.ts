import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SetInput } from 'api/schema/set'
import type { InferResponseType } from 'hono/client'
import { client } from './client'
import { keys } from './keys'

export type Exercise = InferResponseType<
  typeof client.api.exercises.$get
>[number]
export type Workout = InferResponseType<
  (typeof client.api.workouts)[':id']['$get'],
  200
>
export type WorkoutSet = Workout['sets'][number]
export type WorkoutSummary = InferResponseType<
  typeof client.api.workouts.$get
>[number]
/** ステータスを 200 に絞らないと zValidator の 400 レスポンス型が混ざる。 */
export type LastSetsResult = InferResponseType<
  (typeof client.api.exercises)[':id']['last-sets']['$get'],
  200
>

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises(),
    queryFn: async () => {
      const res = await client.api.exercises.$get()
      if (!res.ok) throw new Error('種目の取得に失敗しました')
      return res.json()
    },
    // 種目マスタはフェーズ1では固定シード。取り直す理由がないので古くならない扱いにする。
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useWorkouts() {
  return useQuery({
    queryKey: keys.workouts(),
    queryFn: async () => {
      const res = await client.api.workouts.$get()
      if (!res.ok) throw new Error('セッション一覧の取得に失敗しました')
      return res.json()
    },
  })
}

export function useWorkout(id: number) {
  return useQuery({
    queryKey: keys.workout(id),
    queryFn: async () => {
      const res = await client.api.workouts[':id'].$get({
        param: { id: String(id) },
      })
      if (!res.ok) throw new Error('セッションの取得に失敗しました')
      return res.json()
    },
  })
}

export function useLastSets(exerciseId: number, excludeWorkoutId: number) {
  return useQuery({
    queryKey: keys.lastSets(exerciseId, excludeWorkoutId),
    queryFn: async () => {
      const res = await client.api.exercises[':id']['last-sets'].$get({
        param: { id: String(exerciseId) },
        query: { excludeWorkoutId: String(excludeWorkoutId) },
      })
      if (!res.ok) throw new Error('前回の記録の取得に失敗しました')
      return res.json()
    },
    enabled: exerciseId > 0,
  })
}

export function useCreateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (performedOn: string) => {
      const res = await client.api.workouts.$post({ json: { performedOn } })
      if (!res.ok) throw new Error('セッションの作成に失敗しました')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workouts() })
    },
  })
}

/**
 * セット記録。ジムでは応答を待って画面が固まるのが最悪なので楽観的更新を行う。
 *
 * onMutate で先に画面を進め、失敗したら onError で巻き戻す。
 * onSettled でサーバーの真実に合わせ直す（採番された id と setOrder を取り込む）。
 */
export function useAddSet(workoutId: number) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: SetInput & { exerciseId: number }) => {
      const res = await client.api.workouts[':id'].sets.$post({
        param: { id: String(workoutId) },
        json: input,
      })
      if (!res.ok) throw new Error('セットの記録に失敗しました')
      return res.json()
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const previous = qc.getQueryData<Workout>(keys.workout(workoutId))

      // 種目名は取得済みの種目一覧キャッシュから借りる（再取得しない）
      const exercises = qc.getQueryData<Exercise[]>(keys.exercises())
      const exerciseName =
        exercises?.find((e) => e.id === input.exerciseId)?.name ?? ''

      qc.setQueryData<Workout>(keys.workout(workoutId), (old) => {
        if (!old) return old
        const sameExercise = old.sets.filter(
          (s) => s.exerciseId === input.exerciseId,
        )
        const optimistic: WorkoutSet = {
          id: -Date.now(), // サーバー採番前の仮 id（負数で本物と衝突させない）
          exerciseId: input.exerciseId,
          exerciseName,
          setOrder: sameExercise.length + 1,
          weightKg: input.weightKg,
          reps: input.reps,
        }
        return { ...old, sets: [...old.sets, optimistic] }
      })

      return { previous }
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(keys.workout(workoutId), context.previous)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
      // セット数が変わるので一覧も古くなる
      qc.invalidateQueries({ queryKey: keys.workouts() })
      // 「前回の記録」は excludeWorkoutId で今日を除外しているため影響を受けない。
      // ここを無闇に invalidate しないのが粒度設計のポイント。
    },
  })
}
