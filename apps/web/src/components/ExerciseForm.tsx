import { useForm } from '@tanstack/react-form'
import {
  type Category,
  categories,
  categoryLabels,
  defaultCategoryFor,
  type MuscleGroup,
  muscleGroupLabels,
  muscleGroups,
  newExerciseSchema,
} from 'api/schema/exercise'

export type ExerciseFormValues = {
  name: string
  category: Category
  muscleGroup: MuscleGroup
}

export function ExerciseForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  error,
}: {
  initial?: ExerciseFormValues
  submitLabel: string
  onSubmit: (values: ExerciseFormValues) => Promise<unknown>
  onCancel: () => void
  error?: Error | null
}) {
  const form = useForm({
    defaultValues: initial ?? {
      name: '',
      category: 'push' as Category,
      muscleGroup: 'chest' as MuscleGroup,
    },
    validators: { onSubmit: newExerciseSchema },
    onSubmit: async ({ value }) => {
      await onSubmit(newExerciseSchema.parse(value))
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700"
    >
      <form.Field name="name">
        {(field) => {
          const message = field.state.meta.errors
            .map((e) => (e as { message?: string })?.message)
            .filter(Boolean)[0]
          return (
            <div className="flex flex-col">
              <label
                htmlFor={field.name}
                className="mb-1 text-slate-500 text-xs"
              >
                種目名
              </label>
              <input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={message != null}
                className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
              />
              {message && (
                <p role="alert" className="mt-1 text-red-600 text-xs">
                  {message}
                </p>
              )}
            </div>
          )
        }}
      </form.Field>

      <div className="flex gap-2">
        <form.Field name="muscleGroup">
          {(field) => (
            <div className="flex flex-1 flex-col">
              <label
                htmlFor={field.name}
                className="mb-1 text-slate-500 text-xs"
              >
                部位
              </label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => {
                  const next = e.target.value as MuscleGroup
                  field.handleChange(next)
                  // 部位を選んだら PPL の既定値を埋める（ユーザーは下で変更できる）
                  form.setFieldValue('category', defaultCategoryFor[next])
                }}
                className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
              >
                {muscleGroups.map((m) => (
                  <option key={m} value={m}>
                    {muscleGroupLabels[m]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>

        <form.Field name="category">
          {(field) => (
            <div className="flex flex-1 flex-col">
              <label
                htmlFor={field.name}
                className="mb-1 text-slate-500 text-xs"
              >
                分割
              </label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as Category)}
                className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
      </div>

      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error.message}
        </p>
      )}

      <div className="flex gap-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {submitLabel}
            </button>
          )}
        </form.Subscribe>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
