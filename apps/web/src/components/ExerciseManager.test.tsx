import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../../test/utils'
import { ExerciseManager } from './ExerciseManager'

/**
 * 一覧に見えている種目名。
 * リンクは <span>部位</span><span>名前</span> の形。
 * 絞り込み後は0件もありうるので、特定の名前を待たない作りにしてある。
 */
function visibleNames() {
  return screen
    .queryAllByRole('link')
    .map((a) => a.querySelector('span:nth-child(2)')?.textContent ?? '')
}

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

  it('一覧にセット数は出さない（並び順にだけ使う）', async () => {
    renderWithRouter(<ExerciseManager />)
    await screen.findByText('ベンチプレス')

    expect(screen.queryByText(/セット$/)).toBeNull()
  })

  it('編集・削除ボタンを一覧には置かない（詳細画面に集約）', async () => {
    renderWithRouter(<ExerciseManager />)
    await screen.findByText('ベンチプレス')

    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
  })

  describe('絞り込み', () => {
    it('分割は PPL +「その他」の4つ', async () => {
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      // 「その他」は分割にも部位にもあるので、fieldset で絞ってから探す
      const group = screen.getByRole('group', { name: '分割' })
      for (const label of ['Push', 'Pull', 'Legs', 'その他']) {
        expect(
          within(group).getByRole('checkbox', { name: label }),
        ).toBeInTheDocument()
      }
    })

    it('部位に「腹」は無く、ふくらはぎは「カーフ」', async () => {
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      const group = screen.getByRole('group', { name: '部位' })
      expect(
        within(group).getByRole('checkbox', { name: 'カーフ' }),
      ).toBeInTheDocument()
      expect(
        within(group).getByRole('checkbox', { name: 'その他' }),
      ).toBeInTheDocument()
      expect(within(group).queryByRole('checkbox', { name: '腹' })).toBeNull()
      expect(
        within(group).queryByRole('checkbox', { name: 'ふくらはぎ' }),
      ).toBeNull()
    })

    it('分割のチェックで即座に絞り込む', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      await user.click(screen.getByRole('checkbox', { name: 'Pull' }))

      expect(visibleNames()).toEqual(['ラットプルダウン'])
    })

    it('部位のチェックで絞り込む', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      await user.click(screen.getByRole('checkbox', { name: '肩' }))

      expect(visibleNames()).toEqual(['サイドレイズ'])
    })

    it('同じ軸の複数チェックは OR', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      await user.click(screen.getByRole('checkbox', { name: '胸' }))
      await user.click(screen.getByRole('checkbox', { name: '肩' }))

      const names = visibleNames()
      expect(names).toHaveLength(2)
      expect(names).toContain('ベンチプレス')
      expect(names).toContain('サイドレイズ')
    })

    it('軸をまたぐと AND（Push かつ 背中 は0件）', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      await user.click(screen.getByRole('checkbox', { name: 'Push' }))
      await user.click(screen.getByRole('checkbox', { name: '背中' }))

      expect(
        await screen.findByText('条件に合う種目がありません'),
      ).toBeInTheDocument()
    })

    it('クリアボタンで全件に戻る（常に表示されている）', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      // 何も選んでいない状態でも表示されている
      expect(screen.getByRole('button', { name: 'クリア' })).toBeInTheDocument()

      await user.click(screen.getByRole('checkbox', { name: 'Pull' }))
      expect(visibleNames()).toEqual(['ラットプルダウン'])

      await user.click(screen.getByRole('button', { name: 'クリア' }))
      expect(visibleNames()).toHaveLength(5)
    })
  })

  describe('追加（モーダル）', () => {
    it('「追加」を押すまでフォームは出ない', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')

      expect(screen.queryByLabelText('種目名')).toBeNull()

      await user.click(screen.getByRole('button', { name: '追加' }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText('種目名')).toBeInTheDocument()
    })

    it('部位を選ぶと分割(PPL)が自動で埋まり、手で変更もできる', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')
      await user.click(screen.getByRole('button', { name: '追加' }))
      await screen.findByRole('dialog')

      expect(screen.getByLabelText('分割')).toHaveValue('push')

      await user.selectOptions(screen.getByLabelText('部位'), 'back')
      expect(screen.getByLabelText('分割')).toHaveValue('pull')

      await user.selectOptions(screen.getByLabelText('分割'), 'legs')
      expect(screen.getByLabelText('分割')).toHaveValue('legs')
    })

    it('種目名が空なら追加できない', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')
      await user.click(screen.getByRole('button', { name: '追加' }))
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: '追加する' }))
      expect(
        await screen.findByText('種目名を入力してください'),
      ).toBeInTheDocument()
    })

    it('追加に成功するとモーダルが閉じる', async () => {
      const user = userEvent.setup()
      renderWithRouter(<ExerciseManager />)
      await screen.findByText('ベンチプレス')
      await user.click(screen.getByRole('button', { name: '追加' }))
      await screen.findByRole('dialog')

      await user.type(screen.getByLabelText('種目名'), 'ディップス')
      await user.click(screen.getByRole('button', { name: '追加する' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })
})
