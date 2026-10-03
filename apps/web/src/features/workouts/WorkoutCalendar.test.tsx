import { WORKOUT_ID, workoutsFixture } from '@test/msw/handlers'
import { server } from '@test/msw/server'
import { renderWithRouter } from '@test/utils'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkoutCalendar } from './WorkoutCalendar'

/** POST /api/workouts のモックが返す id。 */
const CREATED_ID = '01a0bf21-0000-7000-8000-000000000011'
const TODAY_ID = '01a0bf24-0000-7000-8000-000000000024'

describe('WorkoutCalendar', () => {
  beforeEach(() => {
    // 「今日」に依存する画面なので日付を固定する。
    // Date だけを差し替える（setTimeout まで止めると userEvent と msw の遅延が動かない）。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 23, 9, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('記録のある日だけがリンクになる', async () => {
    renderWithRouter(<WorkoutCalendar />)

    expect(
      await screen.findByRole('link', { name: '2026-09-20 の記録' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '2026-09-13 の記録' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '2026-09-21 の記録' })).toBeNull()
  })

  it('日付とセット数の羅列は出さない', async () => {
    renderWithRouter(<WorkoutCalendar />)
    await screen.findByRole('link', { name: '2026-09-20 の記録' })

    expect(screen.queryByText('2026-09-20')).toBeNull()
    expect(screen.queryByText(/セット$/)).toBeNull()
  })

  it('記録のある日を押すとその日の詳細へ遷移する', async () => {
    const user = userEvent.setup()
    const { router } = renderWithRouter(<WorkoutCalendar />)

    await user.click(
      await screen.findByRole('link', { name: '2026-09-20 の記録' }),
    )

    expect(await screen.findByText('ワークアウト画面')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/workouts/${WORKOUT_ID}`)
  })

  it('前後の月に移動できる', async () => {
    const user = userEvent.setup()
    renderWithRouter(<WorkoutCalendar />)
    expect(await screen.findByText('2026年9月')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '前の月' }))
    expect(screen.getByText('2026年8月')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '2026-09-20 の記録' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '次の月' }))
    expect(screen.getByText('2026年9月')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '2026-09-20 の記録' }),
    ).toBeInTheDocument()
  })

  it('今日の記録が無ければ作成してその画面へ進む', async () => {
    const user = userEvent.setup()
    const { router } = renderWithRouter(<WorkoutCalendar />)
    await screen.findByRole('link', { name: '2026-09-20 の記録' })

    await user.click(
      screen.getByRole('button', { name: '今日のセッションを始める' }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/workouts/${CREATED_ID}`),
    )
  })

  it('今日の記録が既にあれば作成せず既存の画面へ進む', async () => {
    let posted = false
    server.use(
      http.get('/api/workouts', () =>
        HttpResponse.json([
          { id: TODAY_ID, performedOn: '2026-09-23' },
          ...workoutsFixture,
        ]),
      ),
      http.post('/api/workouts', () => {
        posted = true
        return new HttpResponse(null, { status: 500 })
      }),
    )

    const user = userEvent.setup()
    const { router } = renderWithRouter(<WorkoutCalendar />)
    await screen.findByRole('link', { name: '2026-09-23 の記録' })

    await user.click(
      screen.getByRole('button', { name: '今日のセッションを始める' }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/workouts/${TODAY_ID}`),
    )
    expect(posted).toBe(false)
  })

  /**
   * 失敗系。mutateAsync の後に create.isError を見ると古い値を掴むので、
   * 「失敗したのに遷移した」というバグが出る。ここで塞ぐ。
   */
  it('作成に失敗したらサーバーの文言を出し、遷移しない', async () => {
    server.use(
      http.post('/api/workouts', () =>
        HttpResponse.json(
          { error: 'この日のセッションは既にあります' },
          { status: 409 },
        ),
      ),
    )

    const user = userEvent.setup()
    const { router } = renderWithRouter(<WorkoutCalendar />)
    await screen.findByRole('link', { name: '2026-09-20 の記録' })

    await user.click(
      screen.getByRole('button', { name: '今日のセッションを始める' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この日のセッションは既にあります',
    )
    expect(router.state.location.pathname).toBe('/')
  })
})
