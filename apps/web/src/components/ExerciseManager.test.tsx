import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/msw/server'
import { renderWithRouter } from '../../test/utils'
import { ExerciseManager } from './ExerciseManager'

describe('ExerciseManager', () => {
  it('PPL ごとに種目をまとめて表示する', async () => {
    renderWithRouter(<ExerciseManager />)

    const push = (await screen.findByRole('heading', { name: 'Push' }))
      .parentElement
    const legs = screen.getByRole('heading', { name: 'Legs' }).parentElement
    if (!push || !legs) throw new Error('セクションが見つかりません')

    expect(within(push).getByText('ベンチプレス')).toBeInTheDocument()
    expect(within(legs).getByText('スクワット')).toBeInTheDocument()
  })

  it('部位を選ぶと分割(PPL)が自動で埋まる', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ExerciseManager />)

    await user.click(await screen.findByRole('button', { name: '追加' }))

    // 既定は 胸 / Push
    expect(screen.getByLabelText('分割')).toHaveValue('push')

    await user.selectOptions(screen.getByLabelText('部位'), 'back')
    expect(screen.getByLabelText('分割')).toHaveValue('pull')

    await user.selectOptions(screen.getByLabelText('部位'), 'quads')
    expect(screen.getByLabelText('分割')).toHaveValue('legs')
  })

  it('自動で入った分割は手で変更できる', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ExerciseManager />)

    await user.click(await screen.findByRole('button', { name: '追加' }))
    await user.selectOptions(screen.getByLabelText('部位'), 'abs')
    expect(screen.getByLabelText('分割')).toHaveValue('legs')

    await user.selectOptions(screen.getByLabelText('分割'), 'push')
    expect(screen.getByLabelText('分割')).toHaveValue('push')
  })

  it('種目名が空なら追加できない', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ExerciseManager />)

    await user.click(await screen.findByRole('button', { name: '追加' }))
    await user.click(screen.getByRole('button', { name: '追加する' }))

    expect(
      await screen.findByText('種目名を入力してください'),
    ).toBeInTheDocument()
  })

  it('追加に成功するとフォームが閉じる', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ExerciseManager />)

    await user.click(await screen.findByRole('button', { name: '追加' }))
    await user.type(screen.getByLabelText('種目名'), 'サイドレイズ')
    await user.click(screen.getByRole('button', { name: '追加する' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '追加する' })).toBeNull(),
    )
  })

  it('使用中の種目を削除するとサーバーの理由を表示する', async () => {
    server.use(
      http.delete('/api/exercises/:id', () =>
        HttpResponse.json(
          { error: 'この種目は3件の記録で使われています', usedBy: 3 },
          { status: 409 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderWithRouter(<ExerciseManager />)

    const row = (await screen.findByText('ベンチプレス')).closest('li')
    if (!row) throw new Error('行が見つかりません')
    await user.click(within(row).getByRole('button', { name: '削除' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この種目は3件の記録で使われています',
    )
  })
})
