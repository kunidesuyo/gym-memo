import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
    failed: boolean
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
            failed: set.failed,
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
      <span className="w-5 shrink-0 text-muted-foreground tabular-nums">
        {set.setOrder}.
      </span>
      <span className="font-medium tabular-nums">{set.weightKg}kg</span>
      {set.failed ? (
        <span className="font-medium text-destructive">失敗</span>
      ) : (
        <>
          <span className="text-muted-foreground">×</span>
          <span className="tabular-nums">{set.reps}回</span>
        </>
      )}
      {set.note && (
        <span className="truncate text-muted-foreground text-xs">
          {set.note}
        </span>
      )}
      <span className="flex-1" />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setEditing(true)}
      >
        編集
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onDelete}
        className="text-destructive"
      >
        削除
      </Button>
    </li>
  )
}
