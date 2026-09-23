import { describe, expect, it } from 'vitest'
import { MAIN_SET_OVERRIDES } from '../scripts/main-set-overrides'
import { type MainSetInput, markMainSets } from '../scripts/main-sets'

/**
 * 移行データのメインセット初期値。ユーザーと確定した規則（design-notes 28章）。
 * アプリの挙動ではなく「2年分の記録をどう読むか」の取り決めなので、
 * 規則そのものをここで固定する。
 */
function group(exercise: string, reps: number[]): MainSetInput[] {
  return reps.map((r) => ({
    date: '2026-09-20',
    exercise,
    reps: r,
    isMainSet: false,
  }))
}

const marked = (rows: MainSetInput[]) => rows.map((r) => r.isMainSet)

describe('markMainSets', () => {
  it('4セット以上ならラスト3だけが本番', () => {
    const rows = group('ベンチプレス', [10, 10, 8, 5, 5, 5])
    markMainSets(rows)
    expect(marked(rows)).toEqual([false, false, false, true, true, true])
  })

  it('3セット以下なら全部本番', () => {
    const rows = group('アームカール', [10, 10, 10])
    markMainSets(rows)
    expect(marked(rows)).toEqual([true, true, true])
  })

  /** 1RM 測定日。シングルはウォームアップの奥から始まるのでラスト3では拾えない。 */
  it('reps<=1 はラスト3の外でも本番', () => {
    const rows = group('デッドリフト', [10, 8, 1, 1, 1, 1, 1, 0, 0])
    markMainSets(rows)
    expect(marked(rows)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  /** 懸垂は10回でアシストを減らし、本番は5回。本番が6本続く日がある。 */
  it('懸垂の5回はラスト3の外でも本番', () => {
    const rows = group('懸垂', [10, 10, 5, 5, 5, 5, 5, 5])
    markMainSets(rows)
    expect(marked(rows)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  /** ⚠️ 逆向きは成り立たない。10回しかやらない日はその10回が本番。 */
  it('懸垂でも10回だけの日はラスト3が本番', () => {
    const rows = group('懸垂', [10, 10, 10, 10])
    markMainSets(rows)
    expect(marked(rows)).toEqual([false, true, true, true])
  })

  it('回数が少なくても懸垂以外には効かない', () => {
    const rows = group('ベンチプレス', [10, 10, 5, 5, 5, 5])
    markMainSets(rows)
    expect(marked(rows)).toEqual([false, false, false, true, true, true])
  })

  it('同じ日でも種目が違えば別グループ', () => {
    const rows: MainSetInput[] = [
      ...group('ベンチプレス', [10, 10, 8, 5]),
      ...group('スクワット', [10, 10]),
    ]
    markMainSets(rows)
    // ベンチはラスト3、スクワットは2セットなので全部
    expect(marked(rows)).toEqual([false, true, true, true, true, true])
  })

  it('同じ種目でも日付が違えば別グループ', () => {
    const rows = group('ベンチプレス', [10, 10, 8, 5])
    for (const r of rows.slice(2)) r.date = '2026-09-21'
    markMainSets(rows)
    // 各日2セットずつなので全部が本番になる
    expect(marked(rows)).toEqual([true, true, true, true])
  })

  /**
   * 手動指定は規則より強い。27グループを1つずつユーザーに確認して決めたもので、
   * 規則で上書きされては困る。
   */
  describe('手動指定', () => {
    it('規則の結果を丸ごと置き換える', () => {
      // 2025-12-24 ベンチ: 20×10 40×10 50×10 60×5 70×5 70×5 70×3 60×3
      // 規則ならラスト3（70×3 60×3 を含む）だが、70kg の3本だけが本番
      const rows = [10, 10, 10, 5, 5, 5, 3, 3].map((reps) => ({
        date: '2025-12-24',
        exercise: 'ベンチプレス',
        reps,
        isMainSet: false,
      }))
      markMainSets(rows)
      expect(marked(rows)).toEqual([
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        false,
      ])
    })

    it('空配列は「その日はメインなし」', () => {
      // 2025-06-28 ベンチ: 20×10 40×10 —— アップだけで終わった日
      const rows = [10, 10].map((reps) => ({
        date: '2025-06-28',
        exercise: 'ベンチプレス',
        reps,
        isMainSet: false,
      }))
      markMainSets(rows)
      expect(marked(rows)).toEqual([false, false])
    })

    it('セット番号は1始まりで、範囲内に収まっている', () => {
      for (const [key, picked] of Object.entries(MAIN_SET_OVERRIDES)) {
        expect(new Set(picked).size, key).toBe(picked.length)
        for (const n of picked) expect(n, key).toBeGreaterThanOrEqual(1)
      }
    })
  })
})
