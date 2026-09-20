import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  useAddSet,
  useDeleteSet,
  useDeleteWorkout,
  useExercises,
  useLastSets,
  useUpdateSet,
  useWorkout,
  type WorkoutSet,
} from '../api/hooks'
import { LastSets } from './LastSets'
import { SetForm } from './SetForm'
import { SetRow } from './SetRow'

type Group = { exerciseId: string; exerciseName: string; sets: WorkoutSet[] }

/** セットは exerciseId 順に届くので、隣り合う同一種目をまとめるだけでよい。 */
function groupByExercise(sets: WorkoutSet[]): Group[] {
  const groups: Group[] = []
  for (const s of sets) {
    const last = groups.at(-1)
    if (last && last.exerciseId === s.exerciseId) last.sets.push(s)
    else
      groups.push({
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        sets: [s],
      })
  }
  return groups
}

export function WorkoutDetail({ workoutId }: { workoutId: string }) {
  const [exerciseId, setExerciseId] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()

  const exercises = useExercises()
  const workout = useWorkout(workoutId)
  // 記録中のセッション自身を除外しないと、1セット入れた時点で「前回」が今日になる
  const lastSets = useLastSets(exerciseId, workoutId)
  const addSet = useAddSet(workoutId)
  const updateSet = useUpdateSet(workoutId)
  const deleteSet = useDeleteSet(workoutId)
  const deleteWorkout = useDeleteWorkout()

  if (workout.isPending) return <p>読み込み中...</p>
  if (workout.error)
    return (
      <p role="alert" className="text-red-600">
        {workout.error.message}
      </p>
    )

  const groups = groupByExercise(workout.data?.sets ?? [])
  const mutationError = addSet.error ?? updateSet.error ?? deleteSet.error

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-bold text-xl tabular-nums">
          {workout.data?.performedOn}
        </h1>
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-sm">
            削除しますか？
            <button
              type="button"
              onClick={async () => {
                await deleteWorkout.mutateAsync(workoutId).catch(() => {})
                if (!deleteWorkout.isError) navigate({ to: '/' })
              }}
              className="rounded-md bg-red-600 px-3 py-1 text-white"
            >
              はい
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-slate-300 px-3 py-1 dark:border-slate-700"
            >
              いいえ
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-red-600 text-sm underline underline-offset-2"
          >
            セッションを削除
          </button>
        )}
      </header>

      {deleteWorkout.error && (
        <p role="alert" className="text-red-600 text-sm">
          {deleteWorkout.error.message}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="exercise" className="text-slate-500 text-xs">
          種目
        </label>
        <select
          id="exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">選択してください</option>
          {exercises.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {exerciseId !== '' && (
        <>
          <LastSets data={lastSets.data} isPending={lastSets.isPending} />
          <SetForm
            resetAfterSubmit
            isPending={addSet.isPending}
            onSubmit={(input) =>
              addSet
                .mutateAsync({
                  ...input,
                  exerciseId,
                  note: input.note === '' ? null : input.note,
                })
                .catch(() => {
                  // 失敗は下の mutationError として表示する。
                  // ここで握らないと未処理の Promise 拒否になる。
                })
            }
          />
        </>
      )}

      {mutationError && (
        <p role="alert" className="text-red-600 text-sm">
          {mutationError.message}
        </p>
      )}

      <section>
        <h2 className="mb-2 font-medium text-slate-500 text-xs">今日の記録</h2>
        {groups.length === 0 ? (
          <p className="text-slate-400 text-sm">まだ記録がありません</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.exerciseId}>
                <h3 className="font-medium text-sm">
                  <Link
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: g.exerciseId }}
                    className="underline-offset-2 hover:underline"
                  >
                    {g.exerciseName}
                  </Link>
                </h3>
                <ul>
                  {g.sets.map((s) => (
                    <SetRow
                      key={s.id}
                      set={s}
                      isPending={updateSet.isPending}
                      onUpdate={(input) =>
                        updateSet
                          .mutateAsync({
                            id: s.id,
                            ...input,
                            note: input.note === '' ? null : input.note,
                          })
                          .catch(() => {})
                      }
                      onDelete={() => deleteSet.mutate(s.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
