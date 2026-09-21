import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Category, NewExercise } from 'api/schema/exercise'
import type { SetInput } from 'api/schema/set'
import type { InferResponseType } from 'hono/client'
import { client } from './client'
import { keys } from './keys'

// zValidator を付けたルートは 400 も返すため、200 に絞らないとユニオンになる
export type Exercise = InferResponseType<
  typeof client.api.exercises.$get,
  200
>[number]
export type Workout = InferResponseType<
  (typeof client.api.workouts)[':id']['$get'],
  200
>
export type WorkoutSet = Workout['sets'][number]
export type WorkoutSummary = InferResponseType<
  typeof client.api.workouts.$get,
  200
>[number]
/** ステータスを 200 に絞らないと zValidator の 400 レスポンス型が混ざる。 */
export type LastSetsResult = InferResponseType<
  (typeof client.api.exercises)[':id']['last-sets']['$get'],
  200
>

/**
 * サーバーが返すエラーメッセージを拾う。落ちたら既定文言にフォールバックする。
 *
 * 引数を `Response` にしないのは、web の tsconfig が worker-configuration.d.ts を
 * 読んでいるため `Response` が Worker 版（webSocket / cf を持つ）になり、
 * Hono の ClientResponse を受け取れないから。必要な形だけを構造的に受ける。
 */
async function errorFrom(res: { json(): Promise<unknown> }, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string }
    return new Error(body.error ?? fallback)
  } catch {
    return new Error(fallback)
  }
}

export function useExercises(category?: Category) {
  return useQuery({
    queryKey: keys.exercises(category),
    queryFn: async () => {
      const res = await client.api.exercises.$get({
        query: category ? { category } : {},
      })
      if (!res.ok) throw new Error('種目の取得に失敗しました')
      return res.json()
    },
  })
}

export function useCreateExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewExercise) => {
      const res = await client.api.exercises.$post({ json: input })
      if (!res.ok) throw await errorFrom(res, '種目の追加に失敗しました')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}

export function useUpdateExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: NewExercise & { id: string }) => {
      const res = await client.api.exercises[':id'].$patch({
        param: { id },
        json: input,
      })
      if (!res.ok) throw await errorFrom(res, '種目の更新に失敗しました')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}

export function useDeleteExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.exercises[':id'].$delete({ param: { id } })
      // 使用中の種目は 409。サーバーの文言をそのまま見せる
      if (!res.ok) throw await errorFrom(res, '種目の削除に失敗しました')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
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

export function useWorkout(id: string) {
  return useQuery({
    queryKey: keys.workout(id),
    queryFn: async () => {
      const res = await client.api.workouts[':id'].$get({ param: { id } })
      if (!res.ok) throw new Error('セッションの取得に失敗しました')
      return res.json()
    },
  })
}

export type ExerciseHistory = InferResponseType<
  (typeof client.api.exercises)[':id']['history']['$get'],
  200
>

export function useExerciseHistory(exerciseId: string) {
  return useQuery({
    queryKey: keys.exerciseHistory(exerciseId),
    queryFn: async () => {
      const res = await client.api.exercises[':id'].history.$get({
        param: { id: exerciseId },
      })
      if (!res.ok) throw await errorFrom(res, '記録の取得に失敗しました')
      return res.json()
    },
  })
}

export function useLastSets(exerciseId: string, excludeWorkoutId: string) {
  return useQuery({
    queryKey: keys.lastSets(exerciseId, excludeWorkoutId),
    queryFn: async () => {
      const res = await client.api.exercises[':id']['last-sets'].$get({
        param: { id: exerciseId },
        query: { excludeWorkoutId },
      })
      if (!res.ok) throw new Error('前回の記録の取得に失敗しました')
      return res.json()
    },
    enabled: exerciseId !== '',
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
export function useAddSet(workoutId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: SetInput & { exerciseId: string }) => {
      const res = await client.api.workouts[':id'].sets.$post({
        param: { id: workoutId },
        json: input,
      })
      if (!res.ok) throw new Error('セットの記録に失敗しました')
      return res.json()
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const previous = qc.getQueryData<Workout>(keys.workout(workoutId))

      // 種目名は取得済みの種目一覧キャッシュから借りる（再取得しない）
      const exercises = qc.getQueryData<Exercise[]>(keys.exercises(undefined))
      const exerciseName =
        exercises?.find((e) => e.id === input.exerciseId)?.name ?? ''

      qc.setQueryData<Workout>(keys.workout(workoutId), (old) => {
        if (!old) return old
        const sameExercise = old.sets.filter(
          (s) => s.exerciseId === input.exerciseId,
        )
        const optimistic: WorkoutSet = {
          // サーバー採番前の仮 id。UUID とは明らかに違う形にして本物と区別できるようにする。
          // 発行をクライアント側に移せば、この仮 id 自体が不要になる。
          id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          exerciseId: input.exerciseId,
          exerciseName,
          setOrder: sameExercise.length + 1,
          weightKg: input.weightKg,
          reps: input.reps,
          failed: input.failed,
          note: input.note ?? null,
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

export function useUpdateSet(workoutId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: SetInput & { id: string }) => {
      const res = await client.api.sets[':id'].$patch({
        param: { id },
        json: input,
      })
      if (!res.ok) throw await errorFrom(res, 'セットの修正に失敗しました')
      return res.json()
    },

    onMutate: async ({ id, ...input }) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const previous = qc.getQueryData<Workout>(keys.workout(workoutId))

      qc.setQueryData<Workout>(keys.workout(workoutId), (old) =>
        old
          ? {
              ...old,
              sets: old.sets.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      weightKg: input.weightKg,
                      reps: input.reps,
                      failed: input.failed,
                      note: input.note ?? null,
                    }
                  : s,
              ),
            }
          : old,
      )

      return { previous }
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(keys.workout(workoutId), context.previous)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
    },
  })
}

export function useDeleteSet(workoutId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.sets[':id'].$delete({ param: { id } })
      if (!res.ok) throw await errorFrom(res, 'セットの削除に失敗しました')
    },

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) })
      const previous = qc.getQueryData<Workout>(keys.workout(workoutId))

      // 画面上でも setOrder を詰め直す。サーバー側も同じことをするので、
      // onSettled の再取得で最終的に一致する。
      qc.setQueryData<Workout>(keys.workout(workoutId), (old) => {
        if (!old) return old
        const removed = old.sets.find((s) => s.id === id)
        const rest = old.sets.filter((s) => s.id !== id)
        if (!removed) return { ...old, sets: rest }

        let order = 0
        return {
          ...old,
          sets: rest.map((s) =>
            s.exerciseId === removed.exerciseId
              ? { ...s, setOrder: ++order }
              : s,
          ),
        }
      })

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(keys.workout(workoutId), context.previous)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
      qc.invalidateQueries({ queryKey: keys.workouts() })
    },
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.workouts[':id'].$delete({ param: { id } })
      if (!res.ok) throw await errorFrom(res, 'セッションの削除に失敗しました')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workouts() }),
  })
}
