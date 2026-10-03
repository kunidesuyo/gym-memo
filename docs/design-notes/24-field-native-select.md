# 24. `field` / `native-select` の導入 —— 2026-09-21

23章のレビューで最も価値のあった指摘への対応。

### `@shadcn/field` は `form` とは別物

20章で「shadcn の `form` は react-hook-form 依存なので入れない」と決めたが、
**`field` は別のレジストリ項目で react-hook-form に一切依存しない**
（依存は `cn` のみ、状態管理を持たない純粋なレイアウト/スタイル部品）。
この区別ができておらず、自前でラッパーを書いていた。

決め手は **`FieldError` の型**:

```ts
errors?: Array<{ message?: string } | undefined>
```

**TanStack Form の `field.state.meta.errors` がちょうどこの形**。
重複除去・単数/複数の出し分け・`role="alert"`・`text-destructive` まで面倒を見るので、
`SetForm` / `ExerciseForm` にあった手書きの map / filter がまるごと消えた。

⚠️ ただし `FieldError` は `id` を持たないので **`aria-describedby` の紐付けはしない**。
`role="alert"` は出現時に読み上げるだけで入力欄との関連は張らないため、
`id` を明示的に渡して `aria-describedby` を自分で張る形にした（既存の配線を維持）。

### `@shadcn/native-select`

「スマホでは OS のピッカーが開くネイティブ `<select>` のほうが良い」（20章）は正しい判断だったが、
**shadcn はまさにその用途の `native-select` をレジストリに持っていた**。
中身は普通の `<select>` のままなので UX 判断は完全に維持される。

導入前は `input.tsx` の長大なクラス文字列を **3箇所にコピペ**していて、
`dark:bg-input/30` という手書きの `dark:` 上書きまで持ち込まれていた
（`rules/styling.md`「No manual `dark:` color overrides」違反）。

### ⚠️ 生成物を1箇所だけ手で直した: iOS のズーム

`native-select.tsx` は `text-sm` 固定だった。**iOS は 16px 未満の入力にフォーカスすると
ページごとズームする**ため、スマホ前提のこのアプリでは実害が出る。

`input.tsx` は `text-base ... md:text-sm` でこれを回避しているので、揃えた。

```diff
- text-sm transition-colors
+ text-base transition-colors md:text-sm
```

shadcn はコードを所有する方式なので、こうした調整は想定内（`customization.md`）。
**再生成すると戻る**点だけ注意。

### チェックボックス群を FieldSet + FieldLegend に

`div` + `<span>` だと支援技術からグループ名と各項目の関連が見えない。
加えて `ui/checkbox.tsx` のフォーカス用クラス
（`group-has-[:focus-visible]/field-label:*`）は **`Field` / `FieldLabel` の中に
置かれて初めて効く**ので、それまでフォーカス時のスタイルが死んでいた。

### 結果

- アプリコードから**手書きの `dark:` 上書きが消滅**
- `select` のクラスコピペ3箇所が消滅
- エラー表示の手書き map/filter が消滅
- テスト82本は**1本も書き換えずに通過**（アクセシブルネームを保ったため）

CSS は 30.1kB → 47.4kB（gzip 6.26 → 8.91kB）。`field` / `native-select` / `separator` の分。

### 副産物

`field` の依存として `separator.tsx` も入った（`FieldSeparator` が使う）。
直接は未使用だが、`field.tsx` が import しているので削除不可。
