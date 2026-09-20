import { useForm } from '@tanstack/react-form'
import { setFormSchema } from 'api/schema/set'

/**
 * セット入力フォーム。
 *
 * 検証には apps/api の Zod スキーマをそのまま渡している（Standard Schema 対応）。
 * サーバーと同じルールなので「クライアントは通るのにサーバーで 400」が起きない。
 */
export type SetFormValues = { weightKg: string; reps: string; note: string }

export function SetForm({
  onSubmit,
  isPending,
  initial,
  submitLabel = '記録する',
  onCancel,
  resetAfterSubmit = false,
}: {
  onSubmit: (input: {
    weightKg: number
    reps: number
    note: string
  }) => Promise<unknown>
  isPending: boolean
  /** 編集時の初期値。省略すると空のフォーム（新規追加）になる。 */
  initial?: SetFormValues
  submitLabel?: string
  onCancel?: () => void
  /** 新規追加時のみ true。送信後に回数とメモを消して連続入力しやすくする。 */
  resetAfterSubmit?: boolean
}) {
  const form = useForm({
    defaultValues: initial ?? { weightKg: '', reps: '', note: '' },
    validators: { onSubmit: setFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const parsed = setFormSchema.parse(value)
      await onSubmit(parsed)
      if (resetAfterSubmit) {
        // 同じ重量で複数セット組むので、重量は残して回数とメモだけ消す
        formApi.setFieldValue('reps', '')
        formApi.setFieldValue('note', '')
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <form.Field name="weightKg">
        {(field) => (
          <NumberField
            label="重量 (kg)"
            field={field}
            inputMode="decimal"
            placeholder="60"
          />
        )}
      </form.Field>

      <form.Field name="reps">
        {(field) => (
          <NumberField
            label="回数"
            field={field}
            inputMode="numeric"
            placeholder="10"
          />
        )}
      </form.Field>

      <form.Field name="note">
        {(field) => (
          <div className="flex min-w-40 flex-1 flex-col">
            <label htmlFor={field.name} className="mb-1 text-slate-500 text-xs">
              メモ（任意）
            </label>
            <input
              id={field.name}
              name={field.name}
              placeholder="シート3段目 / 最後きつい"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}
      </form.Field>

      <div className="mt-5 flex gap-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <button
              type="submit"
              disabled={isSubmitting || isPending}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {submitLabel}
            </button>
          )}
        </form.Subscribe>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * TanStack Form の FieldApi は型引数が非常に多い。
 * ここで必要なのは以下の形だけなので、構造的な型で受ける
 * （メソッド記法にすることで実際の FieldApi が代入可能になる）。
 */
type FieldLike = {
  name: string
  state: { value: string; meta: { errors: unknown[] } }
  handleBlur(): void
  handleChange(value: string): void
}

function NumberField({
  label,
  field,
  inputMode,
  placeholder,
}: {
  label: string
  field: FieldLike
  inputMode: 'decimal' | 'numeric'
  placeholder: string
}) {
  const errors: string[] = field.state.meta.errors
    .map((e) =>
      typeof e === 'string' ? e : ((e as { message?: string })?.message ?? ''),
    )
    .filter(Boolean)

  return (
    <div className="flex flex-col">
      <label htmlFor={field.name} className="mb-1 text-slate-500 text-xs">
        {label}
      </label>
      <input
        id={field.name}
        name={field.name}
        inputMode={inputMode}
        placeholder={placeholder}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={errors.length > 0}
        className="w-24 rounded-md border border-slate-300 px-2 py-2 text-base tabular-nums dark:border-slate-700 dark:bg-slate-900"
      />
      {errors.length > 0 && (
        <p role="alert" className="mt-1 max-w-24 text-red-600 text-xs">
          {errors[0]}
        </p>
      )}
    </div>
  )
}
