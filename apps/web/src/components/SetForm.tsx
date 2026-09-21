import { useForm } from '@tanstack/react-form'
import { setFormSchema } from 'api/schema/set'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type SetFormValues = { weightKg: string; reps: string; note: string }

/**
 * セット入力フォーム。
 *
 * 検証には apps/api の Zod スキーマをそのまま渡している（Standard Schema 対応）。
 * サーバーと同じルールなので「クライアントは通るのにサーバーで 400」が起きない。
 */
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
          <TextField
            label="重量 (kg)"
            field={field}
            inputMode="decimal"
            placeholder="60"
            className="w-24 tabular-nums"
          />
        )}
      </form.Field>

      <form.Field name="reps">
        {(field) => (
          <TextField
            label="回数"
            field={field}
            inputMode="numeric"
            placeholder="10"
            className="w-20 tabular-nums"
          />
        )}
      </form.Field>

      <form.Field name="note">
        {(field) => (
          <TextField
            label="メモ（任意）"
            field={field}
            placeholder="シート3段目 / 最後きつい"
            className="min-w-40 flex-1"
            wrapperClassName="min-w-40 flex-1"
          />
        )}
      </form.Field>

      <div className="mt-5 flex gap-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting || isPending}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
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

function TextField({
  label,
  field,
  inputMode,
  placeholder,
  className,
  wrapperClassName,
}: {
  label: string
  field: FieldLike
  inputMode?: 'decimal' | 'numeric'
  placeholder: string
  className?: string
  wrapperClassName?: string
}) {
  // id は field.name（"weightKg" 等の固定値）にしないこと。
  // 追加フォームと編集行の SetForm が同時に描画されると DOM 内で id が重複し、
  // htmlFor / aria-describedby が別フォームの入力欄に解決されてしまう。
  const uid = useId()
  const inputId = `${uid}-${field.name}`
  const errorId = `${inputId}-error`

  const errors: string[] = field.state.meta.errors
    .map((e) =>
      typeof e === 'string' ? e : ((e as { message?: string })?.message ?? ''),
    )
    .filter(Boolean)

  const hasError = errors.length > 0

  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName ?? ''}`}>
      <Label htmlFor={inputId} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Input
        id={inputId}
        name={field.name}
        inputMode={inputMode}
        placeholder={placeholder}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={hasError}
        // エラー文言を入力欄に紐付ける。これが無いとスクリーンリーダーが
        // 入力欄にフォーカスしたときエラー内容を読み上げない。
        aria-describedby={hasError ? errorId : undefined}
        className={className}
      />
      {hasError && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {errors[0]}
        </p>
      )}
    </div>
  )
}
