/**
 * スプレッドシートのセル1つを、セットの配列に変換する。
 *
 * 元データの書式（2年分の実データから帰納したもの）:
 *   70kg×10×3            重量×回数×セット数
 *   39×10                重量×回数（1セット）
 *   10×3                 自重種目は「回数×セット数」
 *   20×10 40×10 50×10    スペース区切りで複数エントリ
 *   70×3+60×3            ドロップセット → 2セットに分割
 *   -36kg×10×3           負の重量 = アシストマシンの補助量
 *   (パ-9×5 -9×5)×2      入れ子 = サーキット → 展開
 *   マシンショルダープレス 23×10    先頭のテキストは種目名かマシン設定
 *
 * 1RM 測定日の書式（ユーザーと確定した解釈）:
 *   65                   素の数値 = その重量で1回挙げた（成功）
 *   67.5❌               ❌ = 挙がらなかった
 *   77.5×                回数欠落。**セル末尾に連続するものだけ失敗**。
 *                        途中に出てくるものは ×1 の書きかけとみなして成功扱い。
 *                        例: `100× 120 130 135×` → 100kg×1 成功 / 135kg 失敗
 */

export type SetSpec = {
  weightKg: number
  reps: number
  isSuccessful: boolean
}

/** 自重種目は `A×B` を「回数×セット数」と読む。重量は 0。 */
const BODYWEIGHT = new Set(['腹筋', 'アブローラー'])

const NUM = String.raw`-?\d+(?:\.\d+)?`
/** `W×R×S` / `W×R` / `W×`（回数欠落） */
const SPEC = new RegExp(
  `^(${NUM})\\s*(?:kg)?\\s*×\\s*(${NUM})?\\s*(?:×\\s*(${NUM}))?$`,
  'i',
)
/** `65` のような素の数値（1RM 測定日のシングル） */
const BARE = new RegExp(`^(${NUM})\\s*(?:kg)?$`, 'i')

export function normalizeCell(raw: string): string {
  return raw
    .replace(/　/g, ' ')
    .replace(/[*xX]/g, '×')
    .replace(/\n+/g, ' ')
    .trim()
}

/** `(A B)×2` を `A B A B` に展開する。 */
export function expandGroups(s: string): string {
  return s.replace(
    /\(([^()]*)\)\s*×\s*(\d+)/g,
    (_m, inner: string, times: string) =>
      Array.from({ length: Number(times) }, () => inner.trim()).join(' '),
  )
}

/** トークンを「先頭のテキスト」と「数値仕様」に割る。 */
export function splitToken(token: string): { text: string; spec: string } {
  const withNum = token.match(
    new RegExp(`^(.*?)(${NUM}\\s*(?:kg)?\\s*×.*)$`, 'i'),
  )
  if (withNum)
    return { text: (withNum[1] ?? '').trim(), spec: (withNum[2] ?? '').trim() }

  // 素の数値（`65` `67.5❌`）もここで拾う。
  // 前置テキストは **`4:` のように `:` で終わるものだけ**許す。
  // `デクライン3` の `3` は腹筋台の段数であって重量ではない。
  // 何でも許すと「テキスト＋数字」の設定メモが丸ごと1セットに化ける。
  const bare = token.match(new RegExp(`^(.*?)(${NUM}\\s*(?:kg)?❌?)$`, 'i'))
  const prefix = bare?.[1] ?? ''
  if (bare && (prefix === '' || prefix.endsWith(':')))
    return { text: prefix.trim(), spec: (bare[2] ?? '').trim() }

  return { text: token.trim(), spec: '' }
}

/** 回数が書かれていない（`77.5×`）トークンか。末尾判定に使う。 */
export function isIncomplete(spec: string): boolean {
  const m = spec.replace('❌', '').match(SPEC)
  return m !== null && m[2] === undefined
}

/**
 * 数値仕様を1つ以上のセットに変換する。
 *
 * @param isTrailingIncomplete セル末尾に連続する回数欠落トークンなら true（＝失敗扱い）
 */
export function parseSpec(
  spec: string,
  exercise: string,
  isTrailingIncomplete = false,
): SetSpec[] {
  const out: SetSpec[] = []
  const explicitFail = spec.includes('❌')
  const body = spec.replace(/❌/g, '').trim()

  for (const part of body.split('+')) {
    const token = part.trim()

    // 素の数値 = その重量で1回（1RM 測定日のシングル）
    const bare = token.match(BARE)
    if (bare) {
      const n = Number(bare[1])
      // 自重種目に「重量だけ」は書かれない。`デクライン4:10` の 10 は回数。
      if (BODYWEIGHT.has(exercise)) {
        out.push(
          explicitFail
            ? { weightKg: 0, reps: 0, isSuccessful: false }
            : { weightKg: 0, reps: n, isSuccessful: true },
        )
        continue
      }
      out.push(
        explicitFail
          ? { weightKg: n, reps: 0, isSuccessful: false }
          : { weightKg: n, reps: 1, isSuccessful: true },
      )
      continue
    }

    const m = token.match(SPEC)
    if (!m) continue

    const a = Number(m[1])
    const b = m[2] === undefined ? null : Number(m[2])
    const c = m[3] === undefined ? null : Number(m[3])

    if (b === null) {
      // 回数欠落。末尾の連続なら失敗、途中なら `×1` の書きかけとみなす。
      out.push(
        explicitFail || isTrailingIncomplete
          ? { weightKg: a, reps: 0, isSuccessful: false }
          : { weightKg: a, reps: 1, isSuccessful: true },
      )
      continue
    }

    if (explicitFail) {
      out.push({ weightKg: a, reps: 0, isSuccessful: false })
      continue
    }

    if (BODYWEIGHT.has(exercise)) {
      for (let i = 0; i < b; i++)
        out.push({ weightKg: 0, reps: a, isSuccessful: true })
      continue
    }

    for (let i = 0; i < (c ?? 1); i++) {
      out.push({ weightKg: a, reps: b, isSuccessful: true })
    }
  }

  return out
}
