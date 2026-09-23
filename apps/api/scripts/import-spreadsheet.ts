/**
 * スプレッドシート（CSV）から D1 に流す SQL を生成する。
 *
 *   node apps/api/scripts/import-spreadsheet.ts <csv> [出力先.sql]
 *
 * 一度きりの移行スクリプト。生成した SQL を目視確認してから
 *   wrangler d1 execute gym-memo --local --file=tmp/import.sql
 * で流す。
 *
 * ⚠️ 生成される SQL は **既存の記録を全部消してから** 入れ直す。
 *    途中まで手で入力した記録があるなら流さないこと。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { v7 as uuidv7 } from 'uuid'
import {
  CELL_FIXES,
  EXERCISE_ALIASES,
  GRIP_NOTES,
  NOTE_PATTERNS,
  normalizeMag,
  SKIP_PATTERNS,
} from './classify.ts'
import { markMainSets } from './main-sets.ts'
import {
  expandGroups,
  isIncomplete,
  normalizeCell,
  parseSpec,
  splitToken,
} from './parse-cell.ts'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

/** 引用符と埋め込み改行に対応した最小の CSV パーサ。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === LF) {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else if (ch !== CR) cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

function parseDate(s: string): string | null {
  const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
}

type Classified =
  | { kind: 'exercise'; name: string }
  | { kind: 'note'; text: string }
  | { kind: 'gripNote'; text: string }
  | { kind: 'skip' }
  | { kind: 'unknown' }

function classify(text: string): Classified {
  if (!text) return { kind: 'unknown' }

  const mag = normalizeMag(text)
  if (mag) return { kind: 'exercise', name: mag }

  if (SKIP_PATTERNS.some((p) => p.test(text))) return { kind: 'skip' }

  const grip = GRIP_NOTES[text]
  if (grip) return { kind: 'gripNote', text: grip }

  // 「デクライン4:」→「デクライン4」。末尾のコロンは区切りであって中身ではない。
  if (NOTE_PATTERNS.some((p) => p.test(text)))
    return { kind: 'note', text: text.replace(/:$/, '') }

  const alias = EXERCISE_ALIASES[text]
  if (alias) return { kind: 'exercise', name: alias }

  return { kind: 'unknown' }
}

type Row = {
  date: string
  exercise: string
  weightKg: number
  reps: number
  isSuccessful: boolean
  isMainSet: boolean
  note: string | null
}

/** 重量は DB にグラム整数で入れる（src/db/weight.ts と同じ変換）。 */
const toG = (kg: number) => Math.round(kg * 1000)

/**
 * 1文あたりの VALUES 行数。
 * 全4,000行超を1文にすると600KB を超え、D1（特に remote）の文サイズ上限に
 * 引っかかるおそれがあるため分割する。
 */
const CHUNK = 500

/** VALUES 行を CHUNK ごとの INSERT 文に分割する。 */
function insertStatements(head: string, values: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < values.length; i += CHUNK) {
    out.push(`${head}${LF}${values.slice(i, i + CHUNK).join(`,${LF}`)};`)
  }
  return out
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** 種目名から分割と部位を割り当てる。ユーザーと確定した規則。 */
function assignCategory(name: string): [string, string] {
  if (/サイドレイズ|ショルダープレス|ミリタリープレス/.test(name))
    return ['push', 'shoulders']
  if (/ディップス/.test(name)) return ['push', 'chest']
  if (
    /ベンチプレス|インクラインプレス|デクラインプレス|マシンフライ|マシンプレス/.test(
      name,
    )
  )
    return ['push', 'chest']
  if (/カール/.test(name)) return ['pull', 'biceps']
  if (/デッドリフト/.test(name)) return ['legs', 'hamstrings']
  if (/腹筋|アブローラー/.test(name)) return ['other', 'other']
  if (/レッグカール/.test(name)) return ['legs', 'hamstrings']
  if (/カーフレイズ/.test(name)) return ['legs', 'calves']
  if (/サイ$/.test(name)) return ['legs', 'glutes']
  if (/スクワット|レッグプレス|レッグエクステンション/.test(name))
    return ['legs', 'quads']
  return ['pull', 'back']
}

function main() {
  const csvPath = process.argv[2]
  const outPath = process.argv[3] ?? 'tmp/import.sql'
  if (!csvPath) {
    console.error('usage: node import-spreadsheet.ts <csv> [out.sql]')
    process.exit(1)
  }

  const table = parseCsv(readFileSync(csvPath, 'utf8'))
  const header = table[0] ?? []
  const out: Row[] = []
  const unknown = new Map<string, number>()
  const skipped = new Map<string, number>()

  for (const line of table.slice(1)) {
    const date = parseDate(line[0] ?? '')
    if (!date) continue

    for (let col = 1; col < header.length; col++) {
      const raw = (line[col] ?? '').trim()
      if (!raw) continue

      // セル内の改行は「別ブロック」。種目の乗り換えは行をまたがない。
      // （`パラレルmag ...\n-18×10 -14×10` を潰すと、後半の懸垂まで
      //   ラットプルダウン扱いになる）
      for (const line of raw.split(/\n+/)) {
        // 列ヘッダは「枠」。行内に別の種目名が出てきたら乗り換える。
        let exercise = header[col] ?? ''
        // 設定メモ（デクラインの段数、マシン番号など）は、書き直されるまで効き続ける。
        // 積み上げずに**上書き**する。`デクライン4:10 デクライン3:10×2` のように
        // 同じ設定の別の値が続くことがあり、繋ぐと「デクライン4 / デクライン3」になる。
        let stickyNote: string | null = null

        const normalized = normalizeCell(line)
        if (!normalized) continue
        const fixed = CELL_FIXES[normalized] ?? normalized
        const tokens = expandGroups(fixed).split(/\s+/).filter(Boolean)

        // 回数欠落トークン（`77.5×`）は**行末に連続するものだけ**失敗扱い。
        // 途中に出てくるものは `×1` の書きかけとみなす。
        let trailingFailFrom = tokens.length
        for (let i = tokens.length - 1; i >= 0; i--) {
          const { spec } = splitToken(tokens[i] ?? '')
          if (spec && isIncomplete(spec)) trailingFailFrom = i
          else break
        }

        for (const [index, token] of tokens.entries()) {
          const { text, spec } = splitToken(token)
          let tokenNote: string | null = null
          let skipThis = false

          if (text) {
            const c = classify(text)
            if (c.kind === 'exercise') exercise = c.name
            else if (c.kind === 'note') stickyNote = c.text
            // グリップ指定は**そのトークンだけ**。`パ-18×10 -18×10` の2本目は
            // パラレルグリップではない（書いてある所にだけ効く）。
            else if (c.kind === 'gripNote') tokenNote = c.text
            else if (c.kind === 'skip') {
              skipThis = true
              skipped.set(text, (skipped.get(text) ?? 0) + 1)
            } else unknown.set(text, (unknown.get(text) ?? 0) + 1)
          }

          if (skipThis || !spec) continue

          const note =
            [stickyNote, tokenNote].filter(Boolean).join(' / ') || null

          for (const s of parseSpec(
            spec,
            exercise,
            index >= trailingFailFrom,
          )) {
            out.push({ date, exercise, ...s, isMainSet: false, note })
          }
        }
      }
    }
  }

  markMainSets(out)

  const names = [...new Set(out.map((r) => r.exercise))].sort()
  const exerciseIds = new Map(names.map((n) => [n, uuidv7()]))
  const dates = [...new Set(out.map((r) => r.date))].sort()
  const workoutIds = new Map(dates.map((d) => [d, uuidv7()]))
  const orderCounter = new Map<string, number>()

  const lines: string[] = [
    '-- スプレッドシートからの移行（自動生成）',
    `-- 生成元: ${csvPath}`,
    `-- 種目 ${names.length} / セッション ${dates.length} / セット ${out.length}`,
    '--',
    '-- 既存の記録を全部消してから入れ直す。手入力した記録があるなら流さないこと。',
    '',
    'DELETE FROM sets;',
    'DELETE FROM workouts;',
    'DELETE FROM exercises;',
    '',
    ...insertStatements(
      'INSERT INTO exercises (id, name, category, muscle_group) VALUES',
      names.map((n) => {
        const [cat, mus] = assignCategory(n)
        return `  (${q(exerciseIds.get(n) ?? '')}, ${q(n)}, ${q(cat)}, ${q(mus)})`
      }),
    ),
    '',
    ...insertStatements(
      'INSERT INTO workouts (id, performed_on) VALUES',
      dates.map((d) => `  (${q(workoutIds.get(d) ?? '')}, ${q(d)})`),
    ),
    '',
    ...insertStatements(
      'INSERT INTO sets (id, workout_id, exercise_id, set_order, weight_g, reps, is_successful, is_main_set, note) VALUES',
      out.map((r) => {
        const key = `${r.date} ${r.exercise}`
        const order = (orderCounter.get(key) ?? 0) + 1
        orderCounter.set(key, order)
        const note = r.note === null ? 'NULL' : q(r.note)
        return `  (${q(uuidv7())}, ${q(workoutIds.get(r.date) ?? '')}, ${q(
          exerciseIds.get(r.exercise) ?? '',
        )}, ${order}, ${toG(r.weightKg)}, ${r.reps}, ${r.isSuccessful ? 1 : 0}, ${
          r.isMainSet ? 1 : 0
        }, ${note})`
      }),
    ),
  ]

  writeFileSync(outPath, lines.join(LF) + LF)

  console.log(`出力: ${outPath}`)
  console.log(`  種目       ${names.length}`)
  console.log(`  セッション ${dates.length}  (${dates[0]} 〜 ${dates.at(-1)})`)
  console.log(`  セット     ${out.length}`)
  console.log(`  うち失敗   ${out.filter((r) => !r.isSuccessful).length}`)
  console.log(`  うち補助   ${out.filter((r) => r.weightKg < 0).length}`)
  console.log(`  メイン     ${out.filter((r) => r.isMainSet).length}`)
  console.log(`  note 付き  ${out.filter((r) => r.note).length}`)

  if (skipped.size) {
    console.log('')
    console.log('無視した表記:')
    for (const [t, n] of [...skipped].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(n).padStart(4)}  ${t}`)
  }
  if (unknown.size) {
    console.log('')
    console.log('未分類（確認が必要）:')
    for (const [t, n] of [...unknown].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(t)}`)
  }
}

main()
