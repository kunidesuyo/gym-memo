import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { workoutQueryOptions } from '@/features/workouts/api'
import { WorkoutDetail } from '@/features/workouts/WorkoutDetail'

export const Route = createFileRoute('/workouts/$workoutId')({
  // staleTime を外すと遷移のたびにネットワークを待つ。鮮度は画面側に任せる（35章）
  loader: ({ context: { queryClient }, params: { workoutId } }) =>
    queryClient.query({
      ...workoutQueryOptions(workoutId),
      staleTime: 'static',
    }),

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
        <Button variant="outline" render={<Link to="/" />}>
          記録に戻る
        </Button>
      </div>
    </div>
  )
}
