import { Link } from '@tanstack/react-router'
import {
  type Category,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
} from 'api/schema/exercise'
import { useExerciseHistory } from '../api/hooks'

export function ExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const history = useExerciseHistory(exerciseId)

  if (history.isPending) return <p>読み込み中...</p>
  if (history.error)
    return (
      <p role="alert" className="text-destructive">
        {history.error.message}
      </p>
    )

  const { exercise, sessions } = history.data

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-bold text-xl">{exercise.name}</h1>
        <p className="text-muted-foreground text-xs">
          {categoryLabels[exercise.category as Category]} ·{' '}
          {muscleGroupLabels[exercise.muscleGroup as MuscleGroup]}
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">まだ記録がありません</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((s) => (
            <section key={s.workoutId}>
              <h2 className="mb-1">
                <Link
                  to="/workouts/$workoutId"
                  params={{ workoutId: s.workoutId }}
                  className="font-medium text-sm tabular-nums underline-offset-2 hover:underline"
                >
                  {s.performedOn}
                </Link>
              </h2>
              <ul>
                {s.sets.map((set) => (
                  <li
                    key={set.id}
                    className="flex gap-2 py-0.5 text-sm tabular-nums"
                  >
                    <span className="w-5 text-muted-foreground">
                      {set.setOrder}.
                    </span>
                    <span className="font-medium">{set.weightKg}kg</span>
                    <span className="text-muted-foreground">×</span>
                    <span>{set.reps}回</span>
                    {set.note && (
                      <span className="truncate text-muted-foreground text-xs">
                        {set.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
