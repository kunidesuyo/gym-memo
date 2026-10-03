import { createFileRoute } from '@tanstack/react-router'
import { WorkoutCalendar } from '@/features/workouts/WorkoutCalendar'

export const Route = createFileRoute('/')({
  component: WorkoutCalendar,
})
