import { Card, CardContent } from '@/components/ui/card'
import type { LastSetsResult } from '../api/hooks'

export function LastSets({
  data,
  isPending,
}: {
  data: LastSetsResult | undefined
  isPending: boolean
}) {
  return (
    <Card className="gap-2 py-3">
      <CardContent className="px-3">
        <h2 className="mb-2 font-medium text-muted-foreground text-xs">
          前回の記録
        </h2>

        {isPending && (
          <p className="text-muted-foreground text-sm">読み込み中...</p>
        )}

        {!isPending && !data && (
          <p className="text-muted-foreground text-sm">
            この種目の記録はまだありません
          </p>
        )}

        {data && (
          <>
            <p className="mb-1 text-muted-foreground text-xs">
              {data.performedOn}
            </p>
            <ul className="space-y-0.5">
              {data.sets.map((s) => (
                <li key={s.id} className="flex gap-2 text-sm tabular-nums">
                  <span className="w-5 text-muted-foreground">
                    {s.setOrder}.
                  </span>
                  <span className="font-medium">{s.weightKg}kg</span>
                  {s.isSuccessful ? (
                    <>
                      <span className="text-muted-foreground">×</span>
                      <span>{s.reps}回</span>
                    </>
                  ) : (
                    <span className="font-medium text-destructive">失敗</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
