import { Link, useNavigate } from '@tanstack/react-router'
import { categoryLabels } from 'api/schema/exercise'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
// 種目の選択肢が要るので exercises に依存する。向きは workouts → exercises の
// 一方向だけ（exercises 側から workouts を参照しないこと）。
import { useExercises } from '@/features/exercises/api'
import {
  useAddSet,
  useCopyLastSets,
  useDeleteSet,
  useDeleteWorkout,
  useLastSets,
  useUpdateSet,
  useWorkout,
  type WorkoutSet,
} from './api'
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

/** その他はどの分割でも出すので、選択肢には入れない。 */
type Split = 'all' | 'push' | 'pull' | 'legs'

const splitOptions: { value: Split; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'push', label: categoryLabels.push },
  { value: 'pull', label: categoryLabels.pull },
  { value: 'legs', label: categoryLabels.legs },
]

/** その他（腹筋系）はどの日にもやるので常に出す。 */
const inSplit = (e: { category: string }, split: Split) =>
  split === 'all' || e.category === split || e.category === 'other'

export function WorkoutDetail({ workoutId }: { workoutId: string }) {
  const [exerciseId, setExerciseId] = useState('')
  const [split, setSplit] = useState<Split>('all')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()

  const exercises = useExercises()
  const workout = useWorkout(workoutId)
  // 記録中のセッション自身を除外しないと、1セット入れた時点で「前回」が今日になる
  const lastSets = useLastSets(exerciseId, workoutId)
  const addSet = useAddSet(workoutId)
  const copyLastSets = useCopyLastSets(workoutId)
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
  // 並びはサーバーが分割順にしているので、絞るだけでその他が末尾に残る
  const visible = (exercises.data ?? []).filter((e) => inSplit(e, split))

  // 選択中の種目が絞り込みで消えたら選択も外す（option が無いと空欄に見える）
  const changeSplit = (next: Split) => {
    setSplit(next)
    const kept = exercises.data?.some(
      (e) => e.id === exerciseId && inSplit(e, next),
    )
    if (!kept) setExerciseId('')
  }
  const mutationError =
    addSet.error ?? copyLastSets.error ?? updateSet.error ?? deleteSet.error

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
                try {
                  await deleteWorkout.mutateAsync(workoutId)
                  navigate({ to: '/' })
                } catch {
                  // 理由は deleteWorkout.error として上に表示する。
                  // isError をここで見ないこと。クロージャが古い値を掴んでいて
                  // 失敗しても遷移してしまう。
                }
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

      <fieldset className="flex gap-1">
        <legend className="sr-only">分割</legend>
        {splitOptions.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={split === o.value ? 'default' : 'outline'}
            aria-pressed={split === o.value}
            onClick={() => changeSplit(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </fieldset>

      <Field>
        <FieldLabel
          htmlFor="exercise"
          className="text-muted-foreground text-xs"
        >
          種目
        </FieldLabel>
        <NativeSelect
          className="w-full"
          id="exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
        >
          <NativeSelectOption value="">選択してください</NativeSelectOption>
          {visible.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {e.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {exerciseId !== '' && (
        <>
          <LastSets
            data={lastSets.data}
            isPending={lastSets.isPending}
            isCopyPending={copyLastSets.isPending}
            // 今日すでに記録がある種目には足さない（サーバーも 409 で弾く）。
            // ボタンを出したまま失敗させるより、出さないほうが分かりやすい。
            canCopy={!groups.some((g) => g.exerciseId === exerciseId)}
            onCopy={() => {
              copyLastSets.mutateAsync(exerciseId).catch(() => {
                // 失敗は下の mutationError として表示する。
                // ここで握らないと未処理の Promise 拒否になる。
              })
            }}
          />
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
