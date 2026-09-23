import { describe, expect, it } from 'vitest'
import {
  expandGroups,
  isIncomplete,
  normalizeCell,
  parseSpec,
  splitToken,
} from '../scripts/parse-cell'

/**
 * スプレッドシート移行のセルパーサ。
 * 一度きりのスクリプトだが、誤読すると2年分の記録が静かに歪むので押さえる。
 */
describe('splitToken', () => {
  it('素の数値はそのまま仕様として拾う', () => {
    expect(splitToken('67.5')).toEqual({ text: '', spec: '67.5' })
    expect(splitToken('67.5❌')).toEqual({ text: '', spec: '67.5❌' })
  })

  it('`W×R` はテキストと仕様に割れる', () => {
    expect(splitToken('マシン32×10')).toEqual({ text: 'マシン', spec: '32×10' })
  })

  /**
   * ⚠️ ここが `デクライン3` を 3kg×1回 として取り込んでいた原因。
   * 数字はデクライン台の段数であって重量ではない。
   */
  it('テキストに続く素の数値は仕様として拾わない', () => {
    expect(splitToken('デクライン3')).toEqual({ text: 'デクライン3', spec: '' })
  })

  it('ただし `:` で終わるテキストの後ろは設定値として拾う', () => {
    expect(splitToken('デクライン4:10')).toEqual({
      text: 'デクライン4:',
      spec: '10',
    })
  })
})

describe('parseSpec', () => {
  it('`W×R×S` を S セットに展開する', () => {
    expect(parseSpec('67.5×5×2', 'ベンチプレス')).toEqual([
      { weightKg: 67.5, reps: 5, isSuccessful: true },
      { weightKg: 67.5, reps: 5, isSuccessful: true },
    ])
  })

  it('素の数値は「その重量で1回」（1RM 測定日）', () => {
    expect(parseSpec('130', 'スクワット')).toEqual([
      { weightKg: 130, reps: 1, isSuccessful: true },
    ])
  })

  it('❌ は失敗（回数0）', () => {
    expect(parseSpec('140❌', 'スクワット')).toEqual([
      { weightKg: 140, reps: 0, isSuccessful: false },
    ])
  })

  it('ドロップセットは `+` で分ける', () => {
    expect(parseSpec('70×3+60×3', 'ベンチプレス')).toEqual([
      { weightKg: 70, reps: 3, isSuccessful: true },
      { weightKg: 60, reps: 3, isSuccessful: true },
    ])
  })

  it('自重種目の `A×B` は「回数×セット数」', () => {
    expect(parseSpec('10×3', '腹筋')).toEqual([
      { weightKg: 0, reps: 10, isSuccessful: true },
      { weightKg: 0, reps: 10, isSuccessful: true },
      { weightKg: 0, reps: 10, isSuccessful: true },
    ])
  })

  /** 自重種目に重量は書かれない。`デクライン4:10` の 10 は回数。 */
  it('自重種目の素の数値は回数として読む', () => {
    expect(parseSpec('10', '腹筋')).toEqual([
      { weightKg: 0, reps: 10, isSuccessful: true },
    ])
  })

  it('負の重量（アシスト）を保つ', () => {
    expect(parseSpec('-18×10', '懸垂')).toEqual([
      { weightKg: -18, reps: 10, isSuccessful: true },
    ])
  })

  it('回数欠落は、末尾なら失敗・途中なら1回成功', () => {
    expect(parseSpec('135×', 'スクワット', true)).toEqual([
      { weightKg: 135, reps: 0, isSuccessful: false },
    ])
    expect(parseSpec('100×', 'スクワット', false)).toEqual([
      { weightKg: 100, reps: 1, isSuccessful: true },
    ])
  })
})

describe('normalizeCell / expandGroups / isIncomplete', () => {
  it('全角スペースと `x` `*` を正規化する', () => {
    expect(normalizeCell('20　x10 30*5')).toBe('20 ×10 30×5')
  })

  it('`(A B)×2` を展開する', () => {
    expect(expandGroups('(-9×5 -9×5)×2')).toBe('-9×5 -9×5 -9×5 -9×5')
  })

  it('回数が書かれていない仕様を見分ける', () => {
    expect(isIncomplete('77.5×')).toBe(true)
    expect(isIncomplete('77.5×5')).toBe(false)
  })
})
