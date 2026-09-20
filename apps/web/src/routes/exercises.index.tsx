import { createFileRoute } from '@tanstack/react-router'
import { ExerciseManager } from '../components/ExerciseManager'

export const Route = createFileRoute('/exercises/')({
  component: ExerciseManager,
})
