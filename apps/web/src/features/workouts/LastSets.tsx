import { SetLine } from '@/components/SetLine'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { LastSetsResult } from './api'

export function LastSets({
  data,
  isPending,
  onCopy,
  isCopyPending,
  canCopy,
}: {
  data: LastSetsResult | undefined
  isPending: boolean
  /** 前回のセットをまとめて今日に登録する。 */
  onCopy: () => void
  isCopyPending: boolean
  /** 今日すでに記録があるときは false。サーバーも 409 で弾く。 */
  canCopy: boolean
}) {
  return (
    <Card className="gap-2 py-3">
      <CardContent className="px-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium text-muted-foreground text-xs">
            前回の記録
          </h2>
          {data && canCopy && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onCopy}
              disabled={isCopyPending}
            >
              {isCopyPending ? 'コピー中...' : 'まとめて記録'}
            </Button>
          )}
        </div>

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
