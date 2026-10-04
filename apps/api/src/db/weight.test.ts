import { describe, expect, it } from 'vitest'
import { toG, toKg } from './weight'

describe('重量の kg ↔ g 変換', () => {
  it('小数1桁が往復する', () => {
    for (const kg of [110.8, 62.5, 2.7, 53.6, 0, -18, -36]) {
      expect(toKg(toG(kg))).toBe(kg)
    }
  })

  it('小数2桁が往復する（浮動小数点で崩れやすい値を含む）', () => {
    // 1.005 * 1000 は 1004.9999999999999 になる。Math.round が吸収する。
    for (const kg of [1.005, 16.08, 262.1, -262.09, 0.01, 99.99]) {
      expect(toKg(toG(kg))).toBe(kg)
    }
  })

  it('小数3桁（g の限界）まで往復する', () => {
    for (const kg of [0.001, 1.234, -0.005, 153.999]) {
      expect(toKg(toG(kg))).toBe(kg)
    }
  })

  it('g は必ず整数になる', () => {
    for (const kg of [1.005, 16.08, 110.8, -262.09]) {
      expect(Number.isInteger(toG(kg))).toBe(true)
    }
  })

  it('g の整数演算は厳密（総ボリュームの想定規模で検証）', () => {
    // 4,194セット × 110.8kg × 10回 相当
    const perSet = toG(110.8) * 10
    let sum = 0
    for (let i = 0; i < 4194; i++) sum += perSet
    expect(sum).toBe(4194 * perSet)
    expect(sum).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })
})
