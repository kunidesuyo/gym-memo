import { Link } from '@tanstack/react-router'
import {
  type Category,
  categories,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
} from 'api/schema/exercise'
import { useState } from 'react'
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
          <button
            type="button"
            onClick={() => {
              create.reset()
              setEditing({ mode: 'new' })
            }}
            className="rounded-md bg-slate-900 px-3 py-2 font-medium text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            追加
          </button>
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
        <p role="alert" className="text-red-600 text-sm">
          {remove.error.message}
        </p>
      )}

      {exercises.isPending && <p>読み込み中...</p>}

      {categories.map((c) => {
        const rows = byCategory(c)
        if (rows.length === 0) return null
        return (
          <section key={c}>
            <h2 className="mb-1 font-medium text-slate-500 text-xs">
              {categoryLabels[c]}
            </h2>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className="w-16 shrink-0 text-slate-400 text-xs">
                    {muscleGroupLabels[e.muscleGroup as MuscleGroup]}
                  </span>
                  <Link
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: String(e.id) }}
                    className="flex-1 underline-offset-2 hover:underline"
                  >
                    {e.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      update.reset()
                      remove.reset()
                      setEditing({ mode: 'edit', exercise: e })
                    }}
                    className="text-slate-500 text-sm underline underline-offset-2"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove.reset()
                      // 使用中なら API が 409 を返し、その文言を上に表示する
                      remove.mutate(e.id)
                    }}
                    className="text-red-600 text-sm underline underline-offset-2"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
