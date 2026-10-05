import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type { SetInput } from 'api/schema/set'
import type { InferResponseType } from 'hono/client'
import { client } from '@/api/client'
import { errorFrom } from '@/api/error'
import { keys } from '@/api/keys'
// 楽観的更新で種目名を取得済みキャッシュから借りるため。向きは
// workouts → exercises の一方向だけ（逆向きの参照を作らないこと）。
import type { Exercise } from '@/features/exercises/api'

// zValidator を付けたルートは 400 も返すため、200 に絞らないとユニオンになる
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

/**
 * セッション1件。**loader とコンポーネントで同じ定義を共有する**ため
 * queryOptions に切り出してある。
 *
 * ルート側が loader で `query({ ...workoutQueryOptions(id), staleTime: 'static' })`
 * を呼ぶので、コンポーネントがマウントする時点でキャッシュに入っている。
 * 読み出しは Query のキャッシュだけから行う（`useLoaderData` は使わない）。
 */
export function workoutQueryOptions(id: string) {
  return queryOptions({
    queryKey: keys.workout(id),
    queryFn: async () => {
      const res = await client.api.workouts[':id'].$get({ param: { id } })
      if (!res.ok) throw await errorFrom(res, 'セッションの取得に失敗しました')
      return res.json()
    },
  })
}

/**
 * セッション1件を読む。**`data` は undefined にならない。**
 *
 * ルート側の loader が同じ queryOptions でキャッシュを温めているので、
 * 実際にはここで待つことはない（= サスペンドしない）。
 *
 * ⚠️ 失敗は throw される。受け止めるのはルートの `errorComponent`。
 *    画面側で `error` を見る分岐は不要（あっても到達しない）。
 * ⚠️ `useSuspenseQuery` は `enabled` / `throwOnError` / `placeholderData` を
 *    受け付けない（型定義で OmitKeyof されている）。条件付きで取得したいクエリは
 *    `useQuery` のまま残すこと（`useLastSets` がそれ）。
 * ⚠️ **`staleTime` は最低1秒に切り上げられる**（`suspense.js` の
 *    `MIN_SUSPENSE_TIME_MS`）。渡さなければ1秒。つまり
 *      1秒以内 → マウントしても取り直さない
 *      1秒以上 → マウント時に裏で取り直す
 *    loader が `staleTime: 'static'` で取り直さないぶんの鮮度はここが見ている。
 */
export function useWorkout(id: string) {
  return useSuspenseQuery(workoutQueryOptions(id))
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
      // 1日1セッションなので、その日が埋まっていれば 409。文言はサーバーのものを使う。
      if (!res.ok) throw await errorFrom(res, 'セッションの作成に失敗しました')
      return res.json()
    },
    // 409 のときこそ一覧が古い。失敗側でも取り直す。
    onSettled: () => {
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
          isSuccessful: input.isSuccessful,
          isMainSet: input.isMainSet,
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
      // セッション一覧（ホームのカレンダー）は日付だけなので、セットが増えても古くならない。
      // 「前回の記録」も excludeWorkoutId で今日を除外しているため影響を受けない。
      // ここを無闇に invalidate しないのが粒度設計のポイント。
    },
  })
}

/**
 * 前回の記録を種目まるごと今日に複製する。
 * 楽観的更新はしない。サーバーが何セット作るかを画面側が予測できないため。
 */
export function useCopyLastSets(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (exerciseId: string) => {
      const res = await client.api.workouts[':id'].sets['copy-last'].$post({
        param: { id: workoutId },
        json: { exerciseId },
      })
      // 前回が無ければ 404、今日すでに記録があれば 409。文言はサーバーのものを使う
      if (!res.ok)
        throw await errorFrom(res, '前回の記録のコピーに失敗しました')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
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
                      isSuccessful: input.isSuccessful,
                      isMainSet: input.isMainSet,
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
