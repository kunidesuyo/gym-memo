import { createFileRoute } from '@tanstack/react-router'
import { WorkoutDetail } from '../components/WorkoutDetail'

export const Route = createFileRoute('/workouts/$workoutId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { workoutId } = Route.useParams()
  return <WorkoutDetail workoutId={workoutId} />
}
