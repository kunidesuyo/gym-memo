# 20. UI ライブラリ —— 【決定 2026-09-21】shadcn/ui（Base UI 版）

### 決定

- **shadcn/ui** を採用。基盤は **Base UI**（Radix ではない。理由は後述）
- **`form` コンポーネントは入れない**（react-hook-form と競合するため）
- **ネイティブ `<select>` は維持**（意図的。理由は後述）

### 検討した選択肢

| | 方式 | フォーム状態の競合 | Tailwind |
|---|---|---|---|
| **shadcn/ui** | コンポーネントのソースをリポジトリにコピー | `form` 以外は無し | そのまま |
| daisyUI | Tailwind プラグイン（クラスのみ、JS ゼロ） | 無し | そのまま |
| Base UI / React Aria 単体 | 未スタイルのプリミティブ | 無し | 自分で書く |
| Mantine / MUI | 独自スタイリング体系 | **あり** | 競合 |

当初は導入コストの低さから daisyUI を推したが、**学習目的（業界標準に触れる）** を優先して
shadcn を選択した。Mantine / MUI は独自の `useForm` を持ち TanStack Form と二重管理になるため除外。

### ⚠️ Radix を選んだはずが Base UI になった

CLI の `init` は現在こう聞いてくる:

```
? Select a component library ›
❯ Base UI (Recommended)      ← 既定
  Radix UI
  React Aria
```

**Base UI が推奨の座にある。** 「Radix の後継的な選択肢もある」と認識していたが、
既に既定に昇格していた。確認のうえ **Base UI のまま進めることにした**。

このアプリで使う範囲（ボタン・入力・ラベル・カード）では Radix との機能差は無い。

### shadcn 4.x で変わっていたこと

「コードを全部自分のリポジトリに持つ」という昔の性格から、少し変わっている。

- **プリセット**という概念がある（Nova / Vega / Maia …）。アイコンとフォントの組み合わせ。既定は Nova（Lucide / Geist）
- **`cn` が npm パッケージになった**。昔は `@/lib/utils` に自前で書いていた
- **`shadcn` パッケージ自体がランタイム依存に入る**。`index.css` が `shadcn/tailwind.css` を import する
- フォント（`@fontsource-variable/geist`）が同梱される

入った依存:

```
@base-ui/react  cn  shadcn  class-variance-authority
lucide-react  tw-animate-css  @fontsource-variable/geist
```

バンドルへの影響: CSS 5.9kB → 30.1kB、フォント woff2 が約76kB 追加。

### `form` を入れない理由（詳細）

shadcn の `form` コンポーネントは中身が **react-hook-form そのもの**。

```tsx
const Form = FormProvider                       // react-hook-form
const FormField = (props) => <Controller {...props} />   // react-hook-form
const useFormField = () => { useFormContext() }          // react-hook-form
```

`Form` / `FormField` / `FormControl` / `FormMessage` の全部が react-hook-form のコンテキストを読むので、
TanStack Form の状態を流し込めない。**フォーム状態管理そのものを握られる。**

→ `input` `label` `button` `card` には react-hook-form は**一切入らない**ので、
   `form` だけ入れなければ依存としても存在しない。

**失うのは `aria-describedby` の配線くらい**だったので、自前のラッパーに10行足して対応した。

```tsx
<Input aria-invalid={hasError} aria-describedby={hasError ? errorId : undefined} />
{hasError && <p id={errorId} role="alert">{errors[0]}</p>}
```

これが無いと、スクリーンリーダーが入力欄にフォーカスしたときエラー内容を読み上げない。

**今後の選択肢**: TanStack Form には `createFormHook` / `createFormHookContexts` があり
（v1.33.5 で確認）、shadcn の `FormField` と同じ「自作フィールドを束縛する」仕組みを公式に持っている。
フォームが増えて `SetForm` / `ExerciseForm` のラッパー重複が気になったら移行する。

### ネイティブ `<select>` を維持した理由

Base UI の `Select` は合成 API（`SelectTrigger` / `SelectContent` / `SelectItem`）で、
ネイティブ `<select>` からの置き換えになる。だが——

**スマホではネイティブ `<select>` のほうが UX が良い。** OS のホイールピッカーが開き、
タップ領域が大きく、操作も馴染みがある。ジムで片手で使うアプリではこれが効く。

→ `select.tsx` は削除した。種目が増えて**検索で絞りたくなったら** Combobox を検討する
   （それは別のトレードオフ）。

### ダークモードの扱いが変わった

Tailwind 既定の `dark:` は `prefers-color-scheme` を自動で見るが、
shadcn は **`.dark` クラス**で切り替える（`@custom-variant dark (&:is(.dark *))`）。

そのままだとライト固定になるので、`main.tsx` で OS 設定に同期させた。

```ts
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
const syncTheme = () =>
  document.documentElement.classList.toggle('dark', darkMedia.matches)
syncTheme()
darkMedia.addEventListener('change', syncTheme)
```

**副産物として `dark:` の重複が全コンポーネントから消えた。**
`text-slate-500 dark:text-slate-400` のような記述が `text-muted-foreground` 1つになる。

### ハマりどころ

**1. TypeScript 7 は `baseUrl` を廃止している**

`@/` エイリアスを張ろうとして遭遇。

```
error TS5102: Option 'baseUrl' has been removed. Please remove it from your configuration.
```

`paths` は tsconfig の位置からの相対で解決されるので、`baseUrl` 無しで `"@/*": ["./src/*"]` と書く。
Vite と Vitest の `resolve.alias` にも同じものを設定する。

**2. `init` は対話的で `-y` では素通りできない**

「既存コンポーネントを再インストールするか」「コンポーネントライブラリの選択」
「プリセットの選択」と複数のプロンプトがある。
`yes y |` で流すと**既定が選ばれる**（それで Base UI になった）。
非対話で特定の選択をしたいなら `-b <base> -p <preset>` を明示する。

**3. `components.json` を手書きするなら schema に厳密に従う**

`base` というキーを書いたら `Unrecognized key(s) in object: 'base'` で弾かれた
（`.strict()` なので未知のキーはエラー）。CLI の `dist/schema/index.js` を
直接 import して `rawConfigSchema.safeParse()` すると具体的なエラーが読める。

**4. Biome の除外を追加した**

- `**/components/ui/**` — shadcn が生成する vendored コード。自分では書かない
- `**/src/index.css` — Tailwind v4 の `@custom-variant` / `@theme inline` を
  Biome の CSS パーサが解釈できず「parsing errors」で落ちる

### 移行した範囲

| ファイル | 変更 |
|---|---|
| `SetForm` | Input / Label / Button。`aria-describedby` を追加 |
| `ExerciseForm` | Input / Label / Button。select はクラスのみ |
| `WorkoutDetail` | Button / Label。確認ボタンを variant="destructive" に |
| `WorkoutList` / `ExerciseManager` / `SetRow` | Button（ghost / xs など） |
| `LastSets` | Card |
| `__root` / `ExerciseHistory` | 色をセマンティックトークンへ |

**生の色指定（`slate-*` / `red-600` / `text-white`）はアプリコードから全て消えた。**

テストは69本すべて通ったまま（`getByRole('button')` / `getByLabelText` はマークアップが
変わっても効くため、移行の検証に役立った）。
