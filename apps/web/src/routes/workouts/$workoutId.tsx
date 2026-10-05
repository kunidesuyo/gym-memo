import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { workoutQueryOptions } from '@/features/workouts/api'
import { WorkoutDetail } from '@/features/workouts/WorkoutDetail'

export const Route = createFileRoute('/workouts/$workoutId')({
  /**
   * 遷移と同時に取得を始める。マウントを待たないので、コンポーネントが描かれる
   * 時点でキャッシュに入っている（= 画面側の `isPending` は通らない）。
   *
   * ⚠️ **`staleTime: 'static'` が要る。** 「キャッシュにあれば取りに行かない」の
   *    意味で、付けないと毎回ネットワークを待つ（= 遷移が毎回遅くなる）。
   *    鮮度の面倒は画面側の `useSuspenseQuery` が見る（下記）。
   *    `ensureQueryData` / `fetchQuery` は**どちらも deprecated**（次のメジャーで削除）。
   *    `query()` がその2つを置き換え、`staleTime: 'static'` の有無で使い分ける。
   * ⚠️ `query()` は既定で `retry: false`（コンポーネントが居ないので再描画で
   *    拾い直せない）。画面側の retry とは別物。
   *
   * 役割分担:
   *   loader                「描く前にデータが在る」ことを保証する。取り直さない
   *   useSuspenseQuery      鮮度を見る。`staleTime` が最低1秒に切り上げられるので、
   *                         1秒以上経っていればマウント時に裏で取り直す（実測）
   *
   * ⚠️ Router も loader の戻り値を保存しているが、`useLoaderData` を使わないので
   *    **誰も読まない**。Router のキャッシュが効くのは「loader を走らせるか」の
   *    判断だけで、遷移時は Router の `staleTime` 既定 0 なので毎回走る。
   *    飛ばすのは **preload を30秒以内に繰り返したときだけ**（実測で確認）。
   *    先読み（`defaultPreload`）を入れるなら、公式が推奨する
   *    `defaultPreloadStaleTime: 0` も併せて検討する。
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
