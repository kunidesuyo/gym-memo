import { createFileRoute } from '@tanstack/react-router'
import { WorkoutRecorder } from '../components/WorkoutRecorder'

export const Route = createFileRoute('/workouts/$workoutId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { workoutId } = Route.useParams()
  return <WorkoutRecorder workoutId={workoutId} />
}
