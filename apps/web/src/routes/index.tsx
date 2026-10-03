import { createFileRoute } from '@tanstack/react-router'
import { WorkoutCalendar } from '@/components/WorkoutCalendar'

export const Route = createFileRoute('/')({
  component: WorkoutCalendar,
})
