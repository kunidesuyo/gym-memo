import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Category, NewExercise } from 'api/schema/exercise'
import type { InferResponseType } from 'hono/client'
import { client } from '@/api/client'
import { errorFrom } from '@/api/error'
import { keys } from '@/api/keys'

// zValidator を付けたルートは 400 も返すため、200 に絞らないとユニオンになる
export type Exercise = InferResponseType<
  typeof client.api.exercises.$get,
  200
>[number]
export type ExerciseHistory = InferResponseType<
  (typeof client.api.exercises)[':id']['history']['$get'],
  200
>
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
