import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  BENCH_ID,
  WORKOUT_ID,
  workoutWithSetsFixture,
} from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithRouter } from '../../test/utils'
import { WorkoutDetail } from './WorkoutDetail'

/**
 * 「今日の記録」セクションの中だけを見る（前回の記録と紛れないように）。
 * 描画完了を待つ必要があるので findByRole を使う。
 */
async function todaySection() {
  const heading = await screen.findByRole('heading', { name: '今日の記録' })
  const section = heading.closest('section')
  if (!section) throw new Error('今日の記録セクションが見つかりません')
  return within(section)
}

function withExistingSets() {
  server.use(
    http.get('/api/workouts/:id', () =>
      HttpResponse.json(workoutWithSetsFixture),
    ),
  )
}

async function selectBenchPress() {
  const user = userEvent.setup()
  await screen.findByRole('option', { name: 'ベンチプレス' })
  await user.selectOptions(
    screen.getByRole('combobox', { name: '種目' }),
    BENCH_ID,
  )
  return user
}

describe('WorkoutDetail', () => {
  it('種目を選ぶまで記録フォームを出さない', async () => {
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '記録する' })).toBeNull()
  })

  it('種目の選択肢はセット数の多い順に並ぶ', async () => {
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    await screen.findByRole('option', { name: 'ベンチプレス' })

    const options = screen
      .getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t !== '選択してください')

    // フィクスチャのセット数: ベンチ12 / スクワット8 / ラットプル3 / サイドレイズ0
    expect(options).toEqual([
      'ベンチプレス',
      'スクワット',
      'ラットプルダウン',
      'サイドレイズ',
    ])
  })

  it('種目を選ぶと前回の記録を表示する', async () => {
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    await selectBenchPress()

    expect(await screen.findByText('2026-09-13')).toBeInTheDocument()
    expect(screen.getByText('60kg')).toBeInTheDocument()
  })

  it('記録したセットが「今日の記録」に種目ごとに並ぶ', async () => {
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    const user = await selectBenchPress()

    expect(
      (await todaySection()).getByText('まだ記録がありません'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    const today = await todaySection()
    expect(await today.findByText('70kg')).toBeInTheDocument()
    expect(
      today.getByRole('heading', { name: 'ベンチプレス' }),
    ).toBeInTheDocument()
  })

  it('サーバーの応答を待たずに画面へ反映する（楽観的更新）', async () => {
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    const user = await selectBenchPress()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    // ハンドラは 100ms 遅延させてある。それより早く出ていれば楽観的更新が効いている
    const today = await todaySection()
    const shownAt = Date.now()
    await today.findByText('70kg')
    expect(Date.now() - shownAt).toBeLessThan(100)
  })

  it('記録に失敗したら巻き戻す（ロールバック）', async () => {
    server.use(
      http.post('/api/workouts/:id/sets', async () => {
        await delay(100)
        return HttpResponse.json({ error: 'boom' }, { status: 500 })
      }),
    )

    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    const user = await selectBenchPress()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    await (await todaySection()).findByText('70kg')
    await waitFor(async () =>
      expect((await todaySection()).queryByText('70kg')).toBeNull(),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'セットの記録に失敗しました',
    )
  })

  it('セットを編集できる', async () => {
    withExistingSets()
    const user = userEvent.setup()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    const row = (await (await todaySection()).findByText('60kg')).closest('li')
    if (!row) throw new Error('行が見つかりません')
    await user.click(within(row).getByRole('button', { name: '編集' }))

    const weight = screen.getByLabelText('重量 (kg)')
    expect(weight).toHaveValue('60')

    await user.clear(weight)
    await user.type(weight, '62.5')
    await user.click(screen.getByRole('button', { name: '更新する' }))

    expect(
      await (await todaySection()).findByText('62.5kg'),
    ).toBeInTheDocument()
  })

  it('編集はキャンセルできる', async () => {
    withExistingSets()
    const user = userEvent.setup()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    const row = (await (await todaySection()).findByText('60kg')).closest('li')
    if (!row) throw new Error('行が見つかりません')
    await user.click(within(row).getByRole('button', { name: '編集' }))
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(await (await todaySection()).findByText('60kg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '更新する' })).toBeNull()
  })

  it('セットを削除すると画面から消え、setOrder が詰まる', async () => {
    withExistingSets()
    const user = userEvent.setup()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    const row = (await (await todaySection()).findByText('60kg')).closest('li')
    if (!row) throw new Error('行が見つかりません')
    await user.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(async () =>
      expect((await todaySection()).queryByText('60kg')).toBeNull(),
    )
    // 2番目だった 65kg が 1. に詰まる
    const remaining = (await todaySection()).getByText('65kg').closest('li')
    expect(within(remaining as HTMLElement).getByText('1.')).toBeInTheDocument()
  })

  it('セッション削除は確認してから実行する', async () => {
    let deleted = false
    server.use(
      http.delete('/api/workouts/:id', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const user = userEvent.setup()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    await user.click(
      await screen.findByRole('button', { name: 'セッションを削除' }),
    )
    expect(deleted).toBe(false)
    expect(screen.getByText('削除しますか？')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'いいえ' }))
    expect(deleted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'セッションを削除' }))
    await user.click(screen.getByRole('button', { name: 'はい' }))
    await waitFor(() => expect(deleted).toBe(true))
  })

  it('セッション削除に失敗したら遷移せず理由を出す', async () => {
    server.use(
      http.delete('/api/workouts/:id', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )

    const user = userEvent.setup()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    await user.click(
      await screen.findByRole('button', { name: 'セッションを削除' }),
    )
    await user.click(screen.getByRole('button', { name: 'はい' }))

    // サーバーが理由を返していればそれを優先して見せる
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    // 画面に留まっている
    expect(
      screen.getByRole('heading', { name: '今日の記録' }),
    ).toBeInTheDocument()
  })

  it('追加フォームと編集フォームが同時に出ても label が別々の入力欄を指す', async () => {
    withExistingSets()
    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)
    const user = await selectBenchPress()

    // 種目を選んだので追加フォームが出ている。さらに1行を編集モードにする
    const row = (await (await todaySection()).findByText('60kg')).closest('li')
    if (!row) throw new Error('行が見つかりません')
    await user.click(within(row).getByRole('button', { name: '編集' }))

    const weightInputs = screen.getAllByLabelText('重量 (kg)')
    expect(weightInputs).toHaveLength(2)

    // id が固定値だと両方の label が先頭の input に解決され、同一要素が2つ返る。
    // useId で一意化されていれば別々の要素になる。
    expect(weightInputs[0]).not.toBe(weightInputs[1])
    expect(weightInputs[0]?.id).not.toBe(weightInputs[1]?.id)

    // 編集側には初期値が入っており、追加側は空のまま
    expect(
      weightInputs.map((i) => (i as HTMLInputElement).value).sort(),
    ).toEqual(['', '60'])
  })

  it('失敗したセットは回数ではなく「失敗」と表示する', async () => {
    server.use(
      http.get('/api/workouts/:id', () =>
        HttpResponse.json({
          ...workoutWithSetsFixture,
          sets: [
            {
              ...workoutWithSetsFixture.sets[0],
              id: 'failed-set',
              weightKg: 85,
              reps: 0,
              isSuccessful: false,
            },
          ],
        }),
      ),
    )

    renderWithRouter(<WorkoutDetail workoutId={WORKOUT_ID} />)

    const today = await todaySection()
    expect(await today.findByText('85kg')).toBeInTheDocument()
    expect(today.getByText('失敗')).toBeInTheDocument()
    expect(today.queryByText('0回')).toBeNull()
  })
})
