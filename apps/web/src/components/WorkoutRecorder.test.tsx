import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/msw/server'
import { renderWithQuery } from '../../test/utils'
import { WorkoutRecorder } from './WorkoutRecorder'

/** 「今日」セクションの中だけを見る（前回の記録と紛れないように） */
function todaySection() {
  const heading = screen.getByRole('heading', { name: '今日' })
  const section = heading.closest('section')
  if (!section) throw new Error('今日セクションが見つかりません')
  return within(section)
}

async function selectBenchPress() {
  const user = userEvent.setup()
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: '種目' })).toBeEnabled(),
  )
  await screen.findByRole('option', { name: 'ベンチプレス' })
  await user.selectOptions(screen.getByRole('combobox', { name: '種目' }), '1')
  return user
}

describe('WorkoutRecorder', () => {
  it('種目を選ぶまでフォームを出さない', async () => {
    renderWithQuery(<WorkoutRecorder workoutId={10} />)

    expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '記録する' })).toBeNull()
  })

  it('種目を選ぶと前回の記録を表示する', async () => {
    renderWithQuery(<WorkoutRecorder workoutId={10} />)
    await selectBenchPress()

    expect(await screen.findByText('2026-09-13')).toBeInTheDocument()
    expect(screen.getByText('60kg')).toBeInTheDocument()
    expect(screen.getByText('65kg')).toBeInTheDocument()
  })

  it('記録したセットが「今日」に出る', async () => {
    renderWithQuery(<WorkoutRecorder workoutId={10} />)
    const user = await selectBenchPress()

    expect(todaySection().getByText('まだ記録がありません')).toBeInTheDocument()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(await todaySection().findByText('70kg')).toBeInTheDocument()
  })

  it('サーバーの応答を待たずに画面へ反映する（楽観的更新）', async () => {
    renderWithQuery(<WorkoutRecorder workoutId={10} />)
    const user = await selectBenchPress()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    // ハンドラは 100ms 遅延させてある。それより早く画面に出ていれば楽観的更新が効いている
    const shownAt = Date.now()
    await todaySection().findByText('70kg')
    expect(Date.now() - shownAt).toBeLessThan(100)
  })

  it('失敗したら巻き戻す（ロールバック）', async () => {
    server.use(
      // 成功時と同じく遅延させる。即座に失敗すると
      // 楽観的に表示された瞬間を観測できない。
      http.post('/api/workouts/:id/sets', async () => {
        await delay(100)
        return HttpResponse.json({ error: 'boom' }, { status: 500 })
      }),
    )

    renderWithQuery(<WorkoutRecorder workoutId={10} />)
    const user = await selectBenchPress()

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    // 一度は楽観的に表示され……
    await todaySection().findByText('70kg')
    // ……失敗したので消える
    await waitFor(() => expect(todaySection().queryByText('70kg')).toBeNull())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'セットの記録に失敗しました',
    )
  })
})
