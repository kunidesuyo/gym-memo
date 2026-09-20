import { useState } from 'react'
import { useAddSet, useExercises, useLastSets, useWorkout } from '../api/hooks'
import { LastSets } from './LastSets'
import { SetForm } from './SetForm'

export function WorkoutRecorder({ workoutId }: { workoutId: number }) {
  const [exerciseId, setExerciseId] = useState(0)

  const exercises = useExercises()
  const workout = useWorkout(workoutId)
  // 記録中のセッション自身を除外しないと、1セット入れた時点で「前回」が今日になる
  const lastSets = useLastSets(exerciseId, workoutId)
  const addSet = useAddSet(workoutId)

  if (workout.isPending) return <p className="p-4">読み込み中...</p>
  if (workout.error)
    return (
      <p role="alert" className="p-4 text-red-600">
        {workout.error.message}
      </p>
    )

  const todaysSets =
    workout.data?.sets.filter((s) => s.exerciseId === exerciseId) ?? []

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-bold text-xl tabular-nums">
          {workout.data?.performedOn}
        </h1>
      </header>

      <div className="flex flex-col gap-1">
        <label htmlFor="exercise" className="text-slate-500 text-xs">
          種目
        </label>
        <select
          id="exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
        >
          <option value={0}>選択してください</option>
          {exercises.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {exerciseId > 0 && (
        <>
          <LastSets data={lastSets.data} isPending={lastSets.isPending} />

          <SetForm
            onSubmit={(input) =>
              addSet
                .mutateAsync({
                  ...input,
                  exerciseId,
                  note: input.note === '' ? null : input.note,
                })
                .catch(() => {
                  // 失敗は addSet.error として下に表示する。
                  // ここで握らないと未処理の Promise 拒否になる。
                })
            }
            isPending={addSet.isPending}
          />

          {addSet.error && (
            <p role="alert" className="text-red-600 text-sm">
              {addSet.error.message}
            </p>
          )}

          <section>
            <h2 className="mb-2 font-medium text-slate-500 text-xs">今日</h2>
            {todaysSets.length === 0 ? (
              <p className="text-slate-400 text-sm">まだ記録がありません</p>
            ) : (
              <ul className="space-y-0.5">
                {todaysSets.map((s) => (
                  <li key={s.id} className="flex gap-2 text-sm tabular-nums">
                    <span className="w-5 text-slate-400">{s.setOrder}.</span>
                    <span className="font-medium">{s.weightKg}kg</span>
                    <span className="text-slate-400">×</span>
                    <span>{s.reps}回</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
