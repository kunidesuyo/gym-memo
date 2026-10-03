import { createFileRoute } from '@tanstack/react-router'
import { ExerciseHistory } from '@/features/exercises/ExerciseHistory'

export const Route = createFileRoute('/exercises/$exerciseId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { exerciseId } = Route.useParams()
  return <ExerciseHistory exerciseId={exerciseId} />
}
