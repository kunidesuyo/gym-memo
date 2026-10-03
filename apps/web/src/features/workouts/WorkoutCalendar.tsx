import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCreateWorkout, useWorkouts } from './api'

/**
 * ホーム。月カレンダーで「やった日」を示し、押すとその日の記録へ飛ぶ。
 *
 * 一覧（日付＋セット数の羅列）をやめてカレンダーにしたのは、
 * 週3〜4回の分割トレでは「今週どこをやったか」「何日空いたか」を
 * 並びではなく**配置**で見たいため。
 */

/** ローカル時刻の YYYY-MM-DD。toISOString は UTC なので日付がずれる。 */
function dateKey(year: number, month: number, day: number) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p(month + 1)}-${p(day)}`
}

function todayKey() {
  const d = new Date()
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate())
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/**
 * 月のマス目。先頭は 1日の曜日ぶんだけ空ける。
 * 月末日は「翌月0日」で取れる（2月やうるう年を自前で数えない）。
 */
function monthCells(year: number, month: number): (number | null)[] {
  const lead = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
}

export function WorkoutCalendar() {
  const navigate = useNavigate()
  const workouts = useWorkouts()
  const create = useCreateWorkout()

  const now = new Date()
  const [shown, setShown] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  })

  // 日付 → セッション ID。カレンダーの塗り分けと「今日」の判定の両方に使う。
  const byDate = useMemo(
    () => new Map((workouts.data ?? []).map((w) => [w.performedOn, w.id])),
    [workouts.data],
  )

  const today = todayKey()
  const cells = monthCells(shown.year, shown.month)

  const shift = (delta: number) =>
    setShown((s) => {
      const d = new Date(s.year, s.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const open = (workoutId: string) =>
    navigate({ to: '/workouts/$workoutId', params: { workoutId } })

  /**
   * 今日のセッションへ入る。無ければ作ってから入る。
   * 1日1セッションなので「始める」と「開く」は同じ入口でよい。
   */
  const startToday = async () => {
    const existing = byDate.get(today)
    if (existing) {
      open(existing)
      return
    }
    try {
      const created = await create.mutateAsync(today)
      open(created.id)
    } catch {
      // 失敗は create.error に出す。
      // ここで create.isError を見ないこと（レンダー時点の古い値を掴む）。
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-bold text-xl">gym-memo</h1>
        <Button
          type="button"
          size="sm"
          disabled={create.isPending}
          onClick={startToday}
        >
          今日のセッションを始める
        </Button>
      </header>

      {create.error && (
        <p role="alert" className="text-destructive text-sm">
          {create.error.message}
        </p>
      )}
      {workouts.error && (
        <p role="alert" className="text-destructive text-sm">
          {workouts.error.message}
        </p>
      )}

      <section className="rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="前の月"
            onClick={() => shift(-1)}
          >
            ‹
          </Button>
          <span className="font-medium tabular-nums">
            {shown.year}年{shown.month + 1}月
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="次の月"
            onClick={() => shift(1)}
          >
            ›
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="pb-1 text-center text-muted-foreground text-xs"
            >
              {w}
            </div>
          ))}

          {cells.map((day, i) => {
            if (day === null)
              // 空きマス。キーに使える中身が無いので添字で振る。
              // biome-ignore lint/suspicious/noArrayIndexKey: 並びが変わらない固定長の空きマス
              return <div key={`blank-${i}`} />

            const key = dateKey(shown.year, shown.month, day)
            const workoutId = byDate.get(key)
            const isToday = key === today
            const ring = isToday ? 'ring-2 ring-ring' : ''

            return workoutId ? (
              <Link
                key={key}
                to="/workouts/$workoutId"
                params={{ workoutId }}
                aria-label={`${key} の記録`}
                className={`flex aspect-square items-center justify-center rounded-md bg-primary font-medium text-primary-foreground text-sm tabular-nums ${ring}`}
              >
                {day}
              </Link>
            ) : (
              <div
                key={key}
                className={`flex aspect-square items-center justify-center rounded-md text-muted-foreground text-sm tabular-nums ${ring}`}
              >
                {day}
              </div>
            )
          })}
        </div>
      </section>

      {workouts.isPending && (
        <p className="text-muted-foreground text-sm">読み込み中...</p>
      )}
    </div>
  )
}
