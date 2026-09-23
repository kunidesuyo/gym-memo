import { useForm } from '@tanstack/react-form'
import { setFormSchema } from 'api/schema/set'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export type SetFormValues = {
  weightKg: string
  reps: string
  note: string
  isSuccessful: boolean
  isMainSet: boolean
}

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
    isSuccessful: boolean
    isMainSet: boolean
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
    defaultValues: initial ?? {
      weightKg: '',
      reps: '',
      note: '',
      isSuccessful: true,
      isMainSet: false,
    },
    validators: { onSubmit: setFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const parsed = setFormSchema.parse(value)
      await onSubmit(parsed)
      if (resetAfterSubmit) {
        // 同じ重量で複数セット組むので、重量は残して回数とメモだけ消す
        formApi.setFieldValue('reps', '')
        formApi.setFieldValue('note', '')
        formApi.setFieldValue('isSuccessful', true)
        // isMainSet は残す。本番セットは続けて何本か組むので、
        // 毎回チェックし直させるほうが手数が増える。
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
          <div className="flex items-start gap-1">
            {/*
              ⚠️ iOS の数値キーパッド（inputMode="decimal" / "numeric"）には
                 マイナスキーが無く、負数を打てない。懸垂のアシスト量を負数で
                 持つ設計なので、符号はボタンで反転させる。
                 inputMode を外して通常キーボードにする案は、数字を打つのに
                 毎回レイヤ切り替えが要るので採らない。
              入力欄の**左**に置くのは、表示される順序（-18）と操作の順序を
              揃えるため。
            */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mt-5"
              aria-label="重量の符号を反転"
              onClick={() => field.handleChange(toggleSign(field.state.value))}
            >
              ±
            </Button>
            <TextField
              label="重量 (kg)"
              field={field}
              inputMode="decimal"
              placeholder="60"
              className="w-20"
              inputClassName="tabular-nums"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="reps">
        {(field) => (
          <TextField
            label="回数"
            field={field}
            inputMode="numeric"
            placeholder="10"
            className="w-20"
            inputClassName="tabular-nums"
          />
        )}
      </form.Field>

      <form.Field name="isSuccessful">
        {(field) => <CheckField field={field} label="成功" />}
      </form.Field>

      <form.Field name="isMainSet">
        {(field) => <CheckField field={field} label="メインセット" />}
      </form.Field>

      {/* 任意項目なので一番後ろ。flex-1 で余白を取るため、
          スマホ幅では折り返して1行を占める。 */}
      <form.Field name="note">
        {(field) => (
          <TextField
            label="メモ（任意）"
            field={field}
            placeholder="シート3段目 / 最後きつい"
            className="min-w-40 flex-1"
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
 * 符号を反転する。空のときは `-` を置いて、数字を後から打てるようにする
 * （「マイナスを押してから 18」という打ち方を許す）。
 */
function toggleSign(value: string) {
  if (value.startsWith('-')) return value.slice(1)
  return value === '' ? '-' : `-${value}`
}

/**
 * boolean 1つぶんのチェックボックス。
 *
 * ⚠️ ラベルは値と同じ向きにすること。以前ここは `isSuccessful` の値を
 * 「失敗」というラベルで出しており、成功しているのにチェックが入って見えていた。
 */
function CheckField({
  field,
  label,
}: {
  field: {
    name: string
    state: { value: boolean }
    handleChange(v: boolean): void
  }
  label: string
}) {
  const uid = useId()
  const id = `${uid}-${field.name}`
  return (
    <Field orientation="horizontal" className="mt-5 w-auto gap-1.5">
      <Checkbox
        id={id}
        checked={field.state.value}
        onCheckedChange={(checked) => field.handleChange(checked === true)}
      />
      <FieldLabel htmlFor={id} className="cursor-pointer font-normal text-sm">
        {label}
      </FieldLabel>
    </Field>
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
  inputClassName,
}: {
  label: string
  field: FieldLike
  inputMode?: 'decimal' | 'numeric'
  placeholder: string
  className?: string
  inputClassName?: string
}) {
  // id は field.name（"weightKg" 等の固定値）にしないこと。
  // 追加フォームと編集行の SetForm が同時に描画されると DOM 内で id が重複し、
  // htmlFor / aria-describedby が別フォームの入力欄に解決されてしまう。
  const uid = useId()
  const inputId = `${uid}-${field.name}`
  const errorId = `${inputId}-error`

  // FieldError は { message?: string }[] をそのまま受ける。
  // TanStack Form の errors がちょうどこの形。
  const errors = field.state.meta.errors as Array<
    { message?: string } | undefined
  >
  const hasError = errors.length > 0

  return (
    <Field data-invalid={hasError || undefined} className={className}>
      <FieldLabel htmlFor={inputId} className="text-muted-foreground text-xs">
        {label}
      </FieldLabel>
      <Input
        id={inputId}
        name={field.name}
        inputMode={inputMode}
        placeholder={placeholder}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={hasError}
        // FieldError は role="alert" を持つが、入力欄との紐付けまではしないので
        // aria-describedby は自分で張る
        aria-describedby={hasError ? errorId : undefined}
        className={inputClassName}
      />
      <FieldError id={errorId} errors={errors} className="text-xs" />
    </Field>
  )
}
