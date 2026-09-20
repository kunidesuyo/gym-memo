import { useState } from 'react'
import type { WorkoutSet } from '../api/hooks'
import { SetForm } from './SetForm'

export function SetRow({
  set,
  onUpdate,
  onDelete,
  isPending,
}: {
  set: WorkoutSet
  onUpdate: (input: {
    weightKg: number
    reps: number
    note: string
  }) => Promise<unknown>
  onDelete: () => void
  isPending: boolean
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className="py-2">
        <SetForm
          initial={{
            weightKg: String(set.weightKg),
            reps: String(set.reps),
            note: set.note ?? '',
          }}
          submitLabel="更新する"
          isPending={isPending}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onUpdate(input)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className="w-5 shrink-0 text-slate-400 tabular-nums">
        {set.setOrder}.
      </span>
      <span className="font-medium tabular-nums">{set.weightKg}kg</span>
      <span className="text-slate-400">×</span>
      <span className="tabular-nums">{set.reps}回</span>
      {set.note && (
        <span className="truncate text-slate-500 text-xs">{set.note}</span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-slate-500 text-xs underline underline-offset-2"
      >
        編集
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-red-600 text-xs underline underline-offset-2"
      >
        削除
      </button>
    </li>
  )
}
