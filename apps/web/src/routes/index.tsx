import { createFileRoute } from '@tanstack/react-router'
import { WorkoutList } from '../components/WorkoutList'

export const Route = createFileRoute('/')({
  component: WorkoutList,
})
