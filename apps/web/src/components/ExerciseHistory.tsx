import { Link, useNavigate } from '@tanstack/react-router'
import {
  type Category,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
} from 'api/schema/exercise'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useDeleteExercise,
  useExerciseHistory,
  useUpdateExercise,
} from '../api/hooks'
import { ExerciseForm } from './ExerciseForm'
import { SetLine } from './SetLine'

/** 種目の詳細。記録の一覧と、この種目自体の編集・削除を担う。 */
export function ExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()

  const history = useExerciseHistory(exerciseId)
  const update = useUpdateExercise()
  const remove = useDeleteExercise()

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
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-bold text-xl">{exercise.name}</h1>
          <p className="text-muted-foreground text-xs">
            {categoryLabels[exercise.category as Category]} ·{' '}
            {muscleGroupLabels[exercise.muscleGroup as MuscleGroup]}
          </p>
        </div>

        {confirmingDelete ? (
          <span className="flex shrink-0 items-center gap-2 text-sm">
            削除しますか？
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                try {
                  // 記録で使われていれば API が 409 を返す
                  await remove.mutateAsync(exerciseId)
                  navigate({ to: '/exercises' })
                } catch {
                  // 理由は remove.error として下に表示する。
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
          <span className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                update.reset()
                remove.reset()
                setEditing(true)
              }}
            >
              編集
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                remove.reset()
                setConfirmingDelete(true)
              }}
            >
              削除
            </Button>
          </span>
        )}
      </header>

      {remove.error && (
        <p role="alert" className="text-destructive text-sm">
          {remove.error.message}
        </p>
      )}

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
                  <SetLine key={set.id} set={set} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>種目を編集</DialogTitle>
          </DialogHeader>
          <ExerciseForm
            initial={{
              name: exercise.name,
              category: exercise.category as Category,
              muscleGroup: exercise.muscleGroup as MuscleGroup,
            }}
            submitLabel="更新する"
            error={update.error}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: exerciseId, ...values })
              setEditing(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
