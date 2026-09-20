import { screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { BENCH_ID, historyFixture, WORKOUT_ID } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithRouter } from '../../test/utils'
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
})
