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
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  // 同じ理由で id はフォームインスタンスごとに一意にする（SetForm のコメント参照）
  const uid = useId()

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
      className="flex flex-col gap-3"
    >
      <form.Field name="name">
        {(field) => {
          const message = field.state.meta.errors
            .map((e) => (e as { message?: string })?.message)
            .filter(Boolean)[0]
          return (
            <div className="flex flex-col">
              <Label
                htmlFor={`${uid}-${field.name}`}
                className="mb-1 text-muted-foreground text-xs"
              >
                種目名
              </Label>
              <Input
                id={`${uid}-${field.name}`}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={message != null}
                aria-describedby={
                  message ? `${uid}-${field.name}-error` : undefined
                }
              />
              {message && (
                <p
                  id={`${uid}-${field.name}-error`}
                  role="alert"
                  className="mt-1 text-destructive text-xs"
                >
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
              <Label
                htmlFor={`${uid}-${field.name}`}
                className="mb-1 text-muted-foreground text-xs"
              >
                部位
              </Label>
              <select
                id={`${uid}-${field.name}`}
                name={field.name}
                value={field.state.value}
                onChange={(e) => {
                  const next = e.target.value as MuscleGroup
                  field.handleChange(next)
                  // 部位を選んだら PPL の既定値を埋める（ユーザーは下で変更できる）
                  form.setFieldValue('category', defaultCategoryFor[next])
                }}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
              <Label
                htmlFor={`${uid}-${field.name}`}
                className="mb-1 text-muted-foreground text-xs"
              >
                分割
              </Label>
              <select
                id={`${uid}-${field.name}`}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as Category)}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}

      <div className="flex gap-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}
