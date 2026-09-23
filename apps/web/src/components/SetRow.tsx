import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { WorkoutSet } from '../api/hooks'
import { SetForm } from './SetForm'
import { SetLine } from './SetLine'

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
    isSuccessful: boolean
    isMainSet: boolean
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
            isSuccessful: set.isSuccessful,
            isMainSet: set.isMainSet,
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
    <SetLine
      set={set}
      trailing={
        <>
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
        </>
      }
    />
  )
}
