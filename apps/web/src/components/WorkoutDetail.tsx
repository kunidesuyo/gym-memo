import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
      <p role="alert" className="text-destructive">
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
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                await deleteWorkout.mutateAsync(workoutId).catch(() => {})
                if (!deleteWorkout.isError) navigate({ to: '/' })
              }}
            >
              はい
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              いいえ
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmingDelete(true)}
          >
            セッションを削除
          </Button>
        )}
      </header>

      {deleteWorkout.error && (
        <p role="alert" className="text-destructive text-sm">
          {deleteWorkout.error.message}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="exercise" className="text-muted-foreground text-xs">
          種目
        </Label>
        <select
          id="exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        <p role="alert" className="text-destructive text-sm">
          {mutationError.message}
        </p>
      )}

      <section>
        <h2 className="mb-2 font-medium text-muted-foreground text-xs">
          今日の記録
        </h2>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">まだ記録がありません</p>
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
