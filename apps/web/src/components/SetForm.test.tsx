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

  // ⚠️ iOS の数値キーパッドにはマイナスキーが無いので、負数はこのボタンでしか
  //    入力できない。懸垂のアシスト量を負数で持つ設計の生命線。
  describe('符号の反転ボタン', () => {
    const sign = () => screen.getByRole('button', { name: '重量の符号を反転' })

    it('入力済みの値を負数にして送信できる', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<SetForm onSubmit={onSubmit} isPending={false} />)

      await user.type(screen.getByLabelText('重量 (kg)'), '18')
      await user.click(sign())
      await user.type(screen.getByLabelText('回数'), '10')
      await user.click(screen.getByRole('button', { name: '記録する' }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ weightKg: -18 }),
      )
    })

    it('先に押してから数字を打てる', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<SetForm onSubmit={onSubmit} isPending={false} />)

      await user.click(sign())
      await user.type(screen.getByLabelText('重量 (kg)'), '36')
      await user.type(screen.getByLabelText('回数'), '10')
      await user.click(screen.getByRole('button', { name: '記録する' }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ weightKg: -36 }),
      )
    })

    it('もう一度押すと正に戻る', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<SetForm onSubmit={onSubmit} isPending={false} />)

      await user.type(screen.getByLabelText('重量 (kg)'), '18')
      await user.click(sign())
      await user.click(sign())
      await user.type(screen.getByLabelText('回数'), '10')
      await user.click(screen.getByRole('button', { name: '記録する' }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ weightKg: 18 }),
      )
    })
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
      isSuccessful: true,
      isMainSet: false,
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
      isSuccessful: true,
      isMainSet: false,
    })
  })

  it('resetAfterSubmit なら送信後に重量を残して回数とメモを空にする', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm resetAfterSubmit onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '60')
    await user.type(screen.getByLabelText('回数'), '10')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(await screen.findByLabelText('回数')).toHaveValue('')
    expect(screen.getByLabelText('メモ（任意）')).toHaveValue('')
    expect(screen.getByLabelText('重量 (kg)')).toHaveValue('60')
  })

  it('編集時は初期値を表示し、送信後も値を消さない', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <SetForm
        initial={{
          weightKg: '60',
          reps: '10',
          note: 'メモ',
          isSuccessful: true,
          isMainSet: false,
        }}
        submitLabel="更新する"
        onCancel={() => {}}
        onSubmit={onSubmit}
        isPending={false}
      />,
    )

    expect(screen.getByLabelText('重量 (kg)')).toHaveValue('60')
    expect(screen.getByLabelText('メモ（任意）')).toHaveValue('メモ')

    await user.click(screen.getByRole('button', { name: '更新する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: 60,
      reps: 10,
      note: 'メモ',
      isSuccessful: true,
      isMainSet: false,
    })
    // 編集フォームなので値は残る
    expect(screen.getByLabelText('回数')).toHaveValue('10')
  })

  it('「挙がった」を外すと回数0でも送信できる', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '85')
    await user.type(screen.getByLabelText('回数'), '0')
    await user.click(screen.getByRole('checkbox', { name: '挙がった' }))
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: 85,
      reps: 0,
      note: '',
      isSuccessful: false,
      isMainSet: false,
    })
  })

  it('「メインセット」にチェックすると isMainSet: true で渡る', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '70')
    await user.type(screen.getByLabelText('回数'), '5')
    await user.click(screen.getByRole('checkbox', { name: 'メインセット' }))
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: 70,
      reps: 5,
      note: '',
      isSuccessful: true,
      isMainSet: true,
    })
  })

  it('チェックボックスの初期状態はラベルと一致する', async () => {
    render(<SetForm onSubmit={vi.fn()} isPending={false} />)

    // 「挙がった」は既定オン（成功）、「メインセット」は既定オフ
    expect(screen.getByRole('checkbox', { name: '挙がった' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'メインセット' }),
    ).not.toBeChecked()
  })

  it('「挙がった」のままで回数0なら弾く', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '85')
    await user.type(screen.getByLabelText('回数'), '0')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(
      await screen.findByText('成功したセットは回数を1以上にしてください'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('負の重量（懸垂の補助）を入力できる', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SetForm onSubmit={onSubmit} isPending={false} />)

    await user.type(screen.getByLabelText('重量 (kg)'), '-18')
    await user.type(screen.getByLabelText('回数'), '10')
    await user.click(screen.getByRole('button', { name: '記録する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      weightKg: -18,
      reps: 10,
      note: '',
      isSuccessful: true,
      isMainSet: false,
    })
  })
})
