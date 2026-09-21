import { Link } from '@tanstack/react-router'
import {
  type Category,
  categories,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
} from 'api/schema/exercise'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  type Exercise,
  useCreateExercise,
  useDeleteExercise,
  useExercises,
  useUpdateExercise,
} from '../api/hooks'
import { ExerciseForm } from './ExerciseForm'

type Editing = { mode: 'new' } | { mode: 'edit'; exercise: Exercise } | null

export function ExerciseManager() {
  const [editing, setEditing] = useState<Editing>(null)

  const exercises = useExercises()
  const create = useCreateExercise()
  const update = useUpdateExercise()
  const remove = useDeleteExercise()

  const byCategory = (c: Category) =>
    exercises.data?.filter((e) => e.category === c) ?? []

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-bold text-xl">種目</h1>
        {editing === null && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              create.reset()
              setEditing({ mode: 'new' })
            }}
          >
            追加
          </Button>
        )}
      </header>

      {editing?.mode === 'new' && (
        <ExerciseForm
          submitLabel="追加する"
          error={create.error}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            setEditing(null)
          }}
        />
      )}

      {editing?.mode === 'edit' && (
        <ExerciseForm
          initial={{
            name: editing.exercise.name,
            category: editing.exercise.category,
            muscleGroup: editing.exercise.muscleGroup as MuscleGroup,
          }}
          submitLabel="更新する"
          error={update.error}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: editing.exercise.id, ...values })
            setEditing(null)
          }}
        />
      )}

      {remove.error && (
        <p role="alert" className="text-destructive text-sm">
          {remove.error.message}
        </p>
      )}

      {exercises.isPending && <p>読み込み中...</p>}

      {categories.map((c) => {
        const rows = byCategory(c)
        if (rows.length === 0) return null
        return (
          <section key={c}>
            <h2 className="mb-1 font-medium text-muted-foreground text-xs">
              {categoryLabels[c]}
            </h2>
            <ul className="divide-y divide-border">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className="w-16 shrink-0 text-muted-foreground text-xs">
                    {muscleGroupLabels[e.muscleGroup as MuscleGroup]}
                  </span>
                  <Link
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: e.id }}
                    className="flex-1 underline-offset-2 hover:underline"
                  >
                    {e.name}
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      update.reset()
                      remove.reset()
                      setEditing({ mode: 'edit', exercise: e })
                    }}
                  >
                    編集
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    onClick={() => {
                      remove.reset()
                      // 使用中なら API が 409 を返し、その文言を上に表示する
                      remove.mutate(e.id)
                    }}
                  >
                    削除
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
