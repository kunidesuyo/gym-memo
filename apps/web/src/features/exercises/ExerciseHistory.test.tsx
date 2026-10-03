import { BENCH_ID, historyFixture, WORKOUT_ID } from '@test/msw/handlers'
import { server } from '@test/msw/server'
import { renderWithRouter } from '@test/utils'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { ExerciseHistory } from './ExerciseHistory'

describe('ExerciseHistory', () => {
  it('種目名と部位を表示する', async () => {
    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

    expect(
      await screen.findByRole('heading', { name: 'ベンチプレス' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Push · 胸')).toBeInTheDocument()
  })

  it('セッション単位にまとめて新しい順に並べる', async () => {
    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

    const dates = (await screen.findAllByRole('link')).map((a) => a.textContent)
    expect(dates).toEqual(['2026-09-20', '2026-09-13'])
  })

  it('各セッションのセットをメモつきで表示する', async () => {
    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

    const heading = await screen.findByText('2026-09-13')
    const section = heading.closest('section')
    if (!section) throw new Error('セクションが見つかりません')

    const s = within(section)
    expect(s.getByText('60kg')).toBeInTheDocument()
    expect(s.getByText('シート3段目')).toBeInTheDocument()
    expect(s.getByText('65kg')).toBeInTheDocument()
  })

  // ⚠️ 薄くする規則は SetLine に集約してある。以前は画面ごとに書いていたため
  //    セッション詳細だけ薄く、この画面は本番と同じ濃さで出ていた。
  it('メインセットはそのまま、ウォームアップは薄く出す', async () => {
    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

    const heading = await screen.findByText('2026-09-13')
    const section = heading.closest('section')
    if (!section) throw new Error('セクションが見つかりません')

    const s = within(section)
    // フィクスチャは 60kg がウォームアップ / 65kg がメインセット
    expect(s.getByText('60kg').closest('li')).toHaveClass(
      'text-muted-foreground',
    )
    expect(s.getByText('65kg').closest('li')).not.toHaveClass(
      'text-muted-foreground',
    )
  })

  it('日付からセッション詳細へ移動できる', async () => {
    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

    const link = await screen.findByRole('link', { name: '2026-09-20' })
    expect(link).toHaveAttribute('href', `/workouts/${WORKOUT_ID}`)
  })

  it('記録がなければその旨を出す', async () => {
    server.use(
      http.get('/api/exercises/:id/history', () =>
        HttpResponse.json({ ...historyFixture, sessions: [] }),
      ),
    )

    renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)
    expect(await screen.findByText('まだ記録がありません')).toBeInTheDocument()
  })

  describe('この種目自体の編集・削除（一覧ではなくここに集約）', () => {
    it('編集モーダルに現在の値が入っている', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

      await user.click(await screen.findByRole('button', { name: '編集' }))

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText('種目名')).toHaveValue('ベンチプレス')
      expect(screen.getByLabelText('分割')).toHaveValue('push')
      expect(screen.getByLabelText('部位')).toHaveValue('chest')
    })

    it('更新に成功するとモーダルが閉じる', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

      await user.click(await screen.findByRole('button', { name: '編集' }))
      await screen.findByRole('dialog')

      const name = screen.getByLabelText('種目名')
      await user.clear(name)
      await user.type(name, 'ダンベルベンチプレス')
      await user.click(screen.getByRole('button', { name: '更新する' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('削除は確認してから実行する', async () => {
      let deleted = false
      server.use(
        http.delete('/api/exercises/:id', () => {
          deleted = true
          return new HttpResponse(null, { status: 204 })
        }),
      )

      const user = userEvent.setup()
      renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

      await user.click(await screen.findByRole('button', { name: '削除' }))
      expect(deleted).toBe(false)
      expect(screen.getByText('削除しますか？')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'いいえ' }))
      expect(deleted).toBe(false)

      await user.click(screen.getByRole('button', { name: '削除' }))
      await user.click(screen.getByRole('button', { name: 'はい' }))
      await waitFor(() => expect(deleted).toBe(true))
    })

    it('記録で使われている種目はサーバーの理由を表示する', async () => {
      server.use(
        http.delete('/api/exercises/:id', () =>
          HttpResponse.json(
            { error: 'この種目は3件の記録で使われています', usedBy: 3 },
            { status: 409 },
          ),
        ),
      )

      const user = userEvent.setup()
      renderWithRouter(<ExerciseHistory exerciseId={BENCH_ID} />)

      await user.click(await screen.findByRole('button', { name: '削除' }))
      await user.click(screen.getByRole('button', { name: 'はい' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'この種目は3件の記録で使われています',
      )
    })
  })
})
