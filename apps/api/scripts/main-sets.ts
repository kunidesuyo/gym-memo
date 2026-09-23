/**
 * メインセット（本番セット）の判定。ユーザーと確定した規則（design-notes 28章）。
 *
 * 移行データの**初期値を決めるためだけ**のもの。アプリは自動判定せず、
 * 記録時のチェックボックス（既定オフ）で立てる。
 */

import { MAIN_SET_OVERRIDES } from './main-set-overrides.ts'

export type MainSetInput = {
  date: string
  exercise: string
  reps: number
  isMainSet: boolean
}

/**
 * 懸垂は回数で本番が判る。10回でアシストを減らしていき、本番は5回。
 * 本番が6本続く日があり、ラスト3では前半を取りこぼす。
 *
 * ⚠️ 逆向き（10回は常にアップ）は成り立たない。130日のうち125日は10回しか
 * やっておらず、その日は10回が本番。**5回なら本番**という向きだけ。
 */
const isLowRepMain = (r: MainSetInput) => r.exercise === '懸垂' && r.reps <= 5

/**
 * メイン = (日付, 種目) ごとの**ラスト3セット**
 *        ∪ **reps<=1**（1RM 測定日のシングル。失敗も max 挑戦なので含む）
 *        ∪ **懸垂の5回以下**
 *
 * 引数の配列を直接書き換える。順序はスプレッドシートの並び＝実施順。
 */
export function markMainSets(rows: MainSetInput[]) {
  const byGroup = new Map<string, MainSetInput[]>()
  for (const r of rows) {
    const key = `${r.date} ${r.exercise}`
    const g = byGroup.get(key)
    if (g) g.push(r)
    else byGroup.set(key, [r])
  }

  for (const g of byGroup.values()) {
    for (const [i, r] of g.entries()) r.isMainSet = i >= g.length - 3
  }
  for (const r of rows) {
    if (r.reps <= 1 || isLowRepMain(r)) r.isMainSet = true
  }

  // 手動指定が最後。規則で決まった内容を丸ごと置き換える。
  for (const [key, g] of byGroup) {
    const picked = MAIN_SET_OVERRIDES[key]
    if (!picked) continue
    for (const [i, r] of g.entries()) r.isMainSet = picked.includes(i + 1)
  }
}
