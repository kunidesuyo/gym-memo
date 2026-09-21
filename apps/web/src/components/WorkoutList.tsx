import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useCreateWorkout, useWorkouts } from '../api/hooks'

function today() {
  // ローカル時刻での YYYY-MM-DD（toISOString は UTC なので日付がずれる）
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function WorkoutList() {
  const workouts = useWorkouts()
  const create = useCreateWorkout()

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-bold text-xl">gym-memo</h1>
        <Button
          type="button"
          size="sm"
          disabled={create.isPending}
          onClick={() => create.mutate(today())}
        >
          今日のセッションを始める
        </Button>
      </header>

      {workouts.isPending && <p>読み込み中...</p>}
      {workouts.error && (
        <p role="alert" className="text-destructive">
          {workouts.error.message}
        </p>
      )}

      {workouts.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          まだセッションがありません
        </p>
      )}

      <ul className="divide-y divide-border">
        {workouts.data?.map((w) => (
          <li key={w.id}>
            <Link
              to="/workouts/$workoutId"
              params={{ workoutId: w.id }}
              className="flex items-center justify-between py-3"
            >
              <span className="tabular-nums">{w.performedOn}</span>
              <span className="text-muted-foreground text-sm">
                {w.setCount} セット
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
