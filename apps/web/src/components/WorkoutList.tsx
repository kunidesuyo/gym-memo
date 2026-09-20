import { Link } from '@tanstack/react-router'
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
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate(today())}
          className="rounded-md bg-slate-900 px-3 py-2 font-medium text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          今日のセッションを始める
        </button>
      </header>

      {workouts.isPending && <p>読み込み中...</p>}
      {workouts.error && (
        <p role="alert" className="text-red-600">
          {workouts.error.message}
        </p>
      )}

      {workouts.data?.length === 0 && (
        <p className="text-slate-400 text-sm">まだセッションがありません</p>
      )}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {workouts.data?.map((w) => (
          <li key={w.id}>
            <Link
              to="/workouts/$workoutId"
              params={{ workoutId: String(w.id) }}
              className="flex items-center justify-between py-3"
            >
              <span className="tabular-nums">{w.performedOn}</span>
              <span className="text-slate-400 text-sm">
                {w.setCount} セット
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
