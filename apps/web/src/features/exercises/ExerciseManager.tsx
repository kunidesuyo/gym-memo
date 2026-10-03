import { Link } from '@tanstack/react-router'
import {
  categories,
  categoryLabels,
  type MuscleGroup,
  muscleGroupLabels,
} from 'api/schema/exercise'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateExercise, useExercises } from './api'
import {
  applyFilter,
  type ExerciseFilter,
  ExerciseFilters,
  emptyFilter,
} from './ExerciseFilters'
import { ExerciseForm } from './ExerciseForm'

/**
 * 種目一覧。
 *
 * 編集・削除はここには置かず、詳細画面（/exercises/$id）に集約している。
 * 一覧は「探す」ための画面という役割分担。
 */
export function ExerciseManager() {
  const [filter, setFilter] = useState<ExerciseFilter>(emptyFilter)
  const [adding, setAdding] = useState(false)

  const exercises = useExercises()
  const create = useCreateExercise()

  // 種目は十数件なのでサーバーに問い合わせず手元で絞る。
  // チェックした瞬間に反映され、ローディングも走らない。
  const visible = applyFilter(exercises.data ?? [], filter)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-bold text-xl">種目</h1>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            create.reset()
            setAdding(true)
          }}
        >
          追加
        </Button>
      </header>

      <ExerciseFilters value={filter} onChange={setFilter} />

      {exercises.isPending && <p>読み込み中...</p>}
      {exercises.error && (
        <p role="alert" className="text-destructive">
          {exercises.error.message}
        </p>
      )}

      {!exercises.isPending && visible.length === 0 && (
        <p className="text-muted-foreground text-sm">
          条件に合う種目がありません
        </p>
      )}

      {categories.map((c) => {
        const rows = visible.filter((e) => e.category === c)
        if (rows.length === 0) return null
        return (
          <section key={c}>
            <h2 className="mb-1 font-medium text-muted-foreground text-xs">
              {categoryLabels[c]}
            </h2>
            <ul className="divide-y divide-border">
              {rows.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: e.id }}
                    className="flex items-center gap-2 py-2.5"
                  >
                    <span className="w-16 shrink-0 text-muted-foreground text-xs">
                      {muscleGroupLabels[e.muscleGroup as MuscleGroup]}
                    </span>
                    <span className="flex-1">{e.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>種目を追加</DialogTitle>
          </DialogHeader>
          <ExerciseForm
            submitLabel="追加する"
            error={create.error}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              setAdding(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
