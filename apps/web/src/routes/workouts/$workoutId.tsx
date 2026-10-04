import { createFileRoute } from '@tanstack/react-router'
import { workoutQueryOptions } from '@/features/workouts/api'
import { WorkoutDetail } from '@/features/workouts/WorkoutDetail'

export const Route = createFileRoute('/workouts/$workoutId')({
  /**
   * 遷移と同時に取得を始める。マウントを待たないので、コンポーネントが描かれる
   * 時点でキャッシュに入っている（= 画面側の `isPending` は通らない）。
   *
   * ⚠️ `ensureQueryData` を使う。キャッシュにあればそれを返し、無ければ取得する。
   *    `fetchQuery` だと毎回ネットワークに行く。
   * ⚠️ Router 自身も loader の結果をキャッシュするが、ここでは**使わない**。
   *    `useLoaderData` ではなく画面側の `useWorkout` から読むので、
   *    キャッシュの持ち主は Query だけ。二重管理にならない。
   */
  loader: ({ context: { queryClient }, params: { workoutId } }) =>
    queryClient.ensureQueryData(workoutQueryOptions(workoutId)),

  component: RouteComponent,
})

function RouteComponent() {
  const { workoutId } = Route.useParams()
  return <WorkoutDetail workoutId={workoutId} />
}
