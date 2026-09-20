import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetForm } from './SetForm'

describe('SetForm', () => {
  it('入力が空なら送信せずエラーを出す', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(
      await screen.findByText('重量を入力してください'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('回数が小数ならサーバーと同じルールで弾く', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '60')
    await user.type(screen.getByLabelText('回数'), '1.5')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(
      await screen.findByText('整数で入力してください'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('正しい入力は数値に変換して渡す', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '62.5')
    await user.type(screen.getByLabelText('回数'), '8')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: 62.5,
      reps: 8,
      note: '',
    })
  })

  it('メモは任意で、入力すればそのまま渡る', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '60')
    await user.type(screen.getByLabelText('回数'), '10')
    await user.type(screen.getByLabelText('メモ（任意）'), 'シート3段目')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: 60,
      reps: 10,
      note: 'シート3段目',
    })
  })

  it('送信後は重量を残して回数だけ空にする（連続入力のため）', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '60')
    await user.type(screen.getByLabelText('回数'), '10')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(await screen.findByLabelText('回数')).toHaveValue('')
    expect(screen.getByLabelText('メモ（任意）')).toHaveValue('')
    expect(screen.getByLabelText('重量 (kg)')).toHaveValue('60')
  })
})
