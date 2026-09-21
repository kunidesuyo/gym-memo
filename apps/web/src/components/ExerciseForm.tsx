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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

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
      <FieldGroup>
        <form.Field name="name">
          {(field) => {
            const errors = field.state.meta.errors as Array<
              { message?: string } | undefined
            >
            const hasError = errors.length > 0
            const id = `${uid}-name`
            return (
              <Field data-invalid={hasError || undefined}>
                <FieldLabel
                  htmlFor={id}
                  className="text-muted-foreground text-xs"
                >
                  種目名
                </FieldLabel>
                <Input
                  id={id}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? `${id}-error` : undefined}
                />
                <FieldError
                  id={`${id}-error`}
                  errors={errors}
                  className="text-xs"
                />
              </Field>
            )
          }}
        </form.Field>

        <div className="flex gap-2">
          <form.Field name="muscleGroup">
            {(field) => (
              <Field className="flex-1">
                <FieldLabel
                  htmlFor={`${uid}-muscleGroup`}
                  className="text-muted-foreground text-xs"
                >
                  部位
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  id={`${uid}-muscleGroup`}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => {
                    const next = e.target.value as MuscleGroup
                    field.handleChange(next)
                    // 部位を選んだら PPL の既定値を埋める（ユーザーは下で変更できる）
                    form.setFieldValue('category', defaultCategoryFor[next])
                  }}
                >
                  {muscleGroups.map((m) => (
                    <NativeSelectOption key={m} value={m}>
                      {muscleGroupLabels[m]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>

          <form.Field name="category">
            {(field) => (
              <Field className="flex-1">
                <FieldLabel
                  htmlFor={`${uid}-category`}
                  className="text-muted-foreground text-xs"
                >
                  分割
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  id={`${uid}-category`}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value as Category)
                  }
                >
                  {categories.map((c) => (
                    <NativeSelectOption key={c} value={c}>
                      {categoryLabels[c]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
        </div>
      </FieldGroup>

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
