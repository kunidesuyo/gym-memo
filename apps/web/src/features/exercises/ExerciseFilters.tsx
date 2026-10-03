import {
  type Category,
  categories,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
  muscleGroups,
} from 'api/schema/exercise'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'

export type ExerciseFilter = {
  categories: Category[]
  muscleGroups: MuscleGroup[]
}

export const emptyFilter: ExerciseFilter = { categories: [], muscleGroups: [] }

/** 絞り込みは「何も選んでいなければ全件」。選んだものの OR、2軸の間は AND。 */
export function applyFilter<
  T extends { category: string; muscleGroup: string },
>(rows: T[], filter: ExerciseFilter) {
  return rows.filter(
    (r) =>
      (filter.categories.length === 0 ||
        filter.categories.includes(r.category as Category)) &&
      (filter.muscleGroups.length === 0 ||
        filter.muscleGroups.includes(r.muscleGroup as MuscleGroup)),
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

export function ExerciseFilters({
  value,
  onChange,
}: {
  value: ExerciseFilter
  onChange: (next: ExerciseFilter) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs">
          絞り込み
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange(emptyFilter)}
        >
          クリア
        </Button>
      </div>

      <Row label="分割">
        {categories.map((c) => (
          <CheckItem
            key={c}
            id={`filter-category-${c}`}
            label={categoryLabels[c]}
            checked={value.categories.includes(c)}
            onToggle={() =>
              onChange({ ...value, categories: toggle(value.categories, c) })
            }
          />
        ))}
      </Row>

      <Row label="部位">
        {muscleGroups.map((m) => (
          <CheckItem
            key={m}
            id={`filter-muscle-${m}`}
            label={muscleGroupLabels[m]}
            checked={value.muscleGroups.includes(m)}
            onToggle={() =>
              onChange({
                ...value,
                muscleGroups: toggle(value.muscleGroups, m),
              })
            }
          />
        ))}
      </Row>
    </div>
  )
}

/**
 * チェックボックス群は FieldSet + FieldLegend で包む。
 * div + span だと支援技術からグループ名と各項目の関連が見えない。
 * また ui/checkbox.tsx のフォーカス用クラス（group-has-[:focus-visible]/field-label:*）は
 * Field / FieldLabel の中に置かれて初めて効く。
 */
function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <FieldSet>
      <FieldLegend
        variant="label"
        className="mb-1 text-muted-foreground text-xs"
      >
        {label}
      </FieldLegend>
      <FieldGroup className="flex-row flex-wrap gap-x-3 gap-y-1.5">
        {children}
      </FieldGroup>
    </FieldSet>
  )
}

function CheckItem({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <Field orientation="horizontal" className="w-auto gap-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <FieldLabel htmlFor={id} className="cursor-pointer font-normal text-sm">
        {label}
      </FieldLabel>
    </Field>
  )
}
