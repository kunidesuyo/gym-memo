import { Card, CardContent } from '@/components/ui/card'
import type { LastSetsResult } from '../api/hooks'
import { SetLine } from './SetLine'

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
            <ul>
              {/* カードが狭いのでメモは出さない。薄さの規則は SetLine に集約。 */}
              {data.sets.map((s) => (
                <SetLine key={s.id} set={s} showNote={false} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
