import type { ReactNode } from 'react'

/** セット表示のある3画面の API 戻り値が、どれもこの形を満たす。 */
export type DisplayableSet = {
  setOrder: number
  weightKg: number
  reps: number
  isSuccessful: boolean
  isMainSet: boolean
  note: string | null
}

/**
 * 1セットの行。セット表示のある画面はすべてこれを使う。
 * ⚠️ アップを薄くする規則はここ1箇所に置くこと。画面ごとに書いていたときは
 *    揃っておらず、セッション詳細だけ薄くなっていた。
 */
export function SetLine({
  set,
  showNote = true,
  trailing,
}: {
  set: DisplayableSet
  /** 前回の記録カードは幅が狭いのでメモを出さない。 */
  showNote?: boolean
  /** 行の右端に出すもの（編集・削除ボタンなど）。 */
  trailing?: ReactNode
}) {
  return (
    <li
      className={`flex items-center gap-2 py-1 text-sm ${
        set.isMainSet ? '' : 'text-muted-foreground'
      }`}
    >
      <span className="w-5 shrink-0 text-muted-foreground tabular-nums">
        {set.setOrder}.
      </span>
      <span className="font-medium tabular-nums">{set.weightKg}kg</span>
      {set.isSuccessful ? (
        <>
          <span className="text-muted-foreground">×</span>
          <span className="tabular-nums">{set.reps}回</span>
        </>
      ) : (
        <span className="font-medium text-destructive">失敗</span>
      )}
      {showNote && set.note && (
        <span className="truncate text-muted-foreground text-xs">
          {set.note}
        </span>
      )}
      {trailing && (
        <>
          <span className="flex-1" />
          {trailing}
        </>
      )}
    </li>
  )
}
