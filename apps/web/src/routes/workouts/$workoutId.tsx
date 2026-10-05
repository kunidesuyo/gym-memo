import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { workoutQueryOptions } from '@/features/workouts/api'
import { WorkoutDetail } from '@/features/workouts/WorkoutDetail'

export const Route = createFileRoute('/workouts/$workoutId')({
  /**
   * 遷移と同時に取得を始める。マウントを待たないので、コンポーネントが描かれる
   * 時点でキャッシュに入っている（= 画面側の `isPending` は通らない）。
   *
   * ⚠️ **`staleTime: 'static'` が要る。** これが「キャッシュにあれば取得しない」の
   *    意味で、付けないと毎回ネットワークに行く。
   *    `ensureQueryData` / `fetchQuery` は**どちらも deprecated**（次のメジャーで削除）。
   *    `query()` がその2つを置き換え、`staleTime: 'static'` の有無で使い分ける。
   * ⚠️ `query()` は既定で `retry: false`（コンポーネントが居ないので再描画で
   *    拾い直せない）。画面の `useQuery` 側の retry とは別物。
   * ⚠️ Router 自身も loader の結果をキャッシュするが、ここでは**使わない**。
   *    `useLoaderData` ではなく画面側の `useWorkout` から読むので、
   *    キャッシュの持ち主は Query だけ。二重管理にならない。
   */
  loader: ({ context: { queryClient }, params: { workoutId } }) =>
    queryClient.query({
      ...workoutQueryOptions(workoutId),
      staleTime: 'static',
    }),

  /**
   * loader と `useSuspenseQuery` の失敗はここに来る（画面側に分岐は無い）。
   *
   * ⚠️ 再試行は `router.invalidate()`。`reset()` は境界の UI を戻すだけで
   *    loader を再実行しないので、同じエラーのまま描き直される。
   */
  errorComponent: ({ error }) => (
    <WorkoutError
      message={error instanceof Error ? error.message : String(error)}
    />
  ),

  component: RouteComponent,
})

function RouteComponent() {
  const { workoutId } = Route.useParams()
  return <WorkoutDetail workoutId={workoutId} />
}

function WorkoutError({ message }: { message: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-destructive text-sm">
        {message}
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => router.invalidate()}>
          再試行
        </Button>
        {/* Base UI は asChild ではなく render（dialog.tsx と同じ形） */}
        <Button variant="outline" render={<Link to="/" />}>
          記録に戻る
        </Button>
      </div>
    </div>
  )
}
