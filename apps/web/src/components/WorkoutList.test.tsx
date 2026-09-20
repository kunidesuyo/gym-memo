import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WORKOUT_ID } from '../../test/msw/handlers'
import { renderWithRouter } from '../../test/utils'
import { WorkoutList } from './WorkoutList'

describe('WorkoutList', () => {
  it('セッション一覧をセット数つきで表示する', async () => {
    renderWithRouter(<WorkoutList />)

    expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
    expect(screen.getByText('3 セット')).toBeInTheDocument()
    expect(screen.getByText('2026-09-13')).toBeInTheDocument()
  })

  it('各セッションが詳細画面へのリンクになっている', async () => {
    renderWithRouter(<WorkoutList />)

    const link = await screen.findByRole('link', { name: /2026-09-20/ })
    expect(link).toHaveAttribute('href', `/workouts/${WORKOUT_ID}`)
  })

  it('今日のセッションを作成できる', async () => {
    const user = userEvent.setup()
    renderWithRouter(<WorkoutList />)

    await screen.findByText('2026-09-20')
    await user.click(
      screen.getByRole('button', { name: '今日のセッションを始める' }),
    )

    // 作成後に一覧が再取得される（invalidateQueries）
    expect(
      await screen.findByRole('button', { name: '今日のセッションを始める' }),
    ).toBeEnabled()
  })
})
