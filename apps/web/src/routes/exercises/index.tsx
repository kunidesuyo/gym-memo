import { createFileRoute } from '@tanstack/react-router'
import { ExerciseManager } from '@/features/exercises/ExerciseManager'

export const Route = createFileRoute('/exercises/')({
  component: ExerciseManager,
})
