import type { LastSetsResult } from '../api/hooks'

export function LastSets({
  data,
  isPending,
}: {
  data: LastSetsResult | undefined
  isPending: boolean
}) {
  return (
    <section className="rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-2 font-medium text-slate-500 text-xs">前回の記録</h2>

      {isPending && <p className="text-slate-400 text-sm">読み込み中...</p>}

      {!isPending && !data && (
        <p className="text-slate-400 text-sm">この種目の記録はまだありません</p>
      )}

      {data && (
        <>
          <p className="mb-1 text-slate-500 text-xs">{data.performedOn}</p>
          <ul className="space-y-0.5">
            {data.sets.map((s) => (
              <li key={s.id} className="flex gap-2 text-sm tabular-nums">
                <span className="w-5 text-slate-400">{s.setOrder}.</span>
                <span className="font-medium">{s.weightKg}kg</span>
                <span className="text-slate-400">×</span>
                <span>{s.reps}回</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
