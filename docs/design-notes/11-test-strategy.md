# 11. テスト戦略 —— 【決定 2026-09-20】

### 方針: 1-a から入れる

当初「フェーズ1では入れない」としていたが **撤回**。
テストの目的は「コードの検証」だけでなく **「テスト基盤そのものが動くことの確認」** がある。

1-b で「D1 + Drizzle + マイグレーション + テスト基盤」を同時に入れると、
失敗したとき新しい要素が4つあって切り分けられない。
**1-a なら変数がテスト設定だけ**なので、ここで済ませるほうが順番として正しい。

### 3種類に分けて考える

| | ツール | 今回の扱い |
|---|---|---|
| ① 純粋ロジックのユニットテスト | Vitest (node) | 必要になったら書く（フェーズ1にはほぼ対象が無い） |
| ② **Worker の統合テスト** | `@cloudflare/vitest-pool-workers` | **主力**。1-a から |
| ③ フロントのコンポーネントテスト | Vitest + jsdom + testing-library + MSW | 1-a から基盤だけ、1-c で本格化 |
| ④ E2E | Playwright | フェーズ3で検討 |

### ② Worker 統合テストの仕組み

普通の Vitest は Node で動くため `c.env.DB`（Cloudflare が注入する D1 バインディング）が存在せず、
モックするしかない → **「Drizzle が正しい SQL を吐いているか」を検証できない**。
さらに workerd は Node と別ランタイムなので、Node で通っても本番で落ちうる。

`@cloudflare/vitest-pool-workers` は Vitest の **pool**（テストの実行場所）を差し替え、
**workerd の中でテストを走らせる**。内部は Miniflare = `wrangler dev` と同じ基盤。

2つの書き方:

```ts
// ① ユニット寄り —— 関数を直接呼び、バインディングだけ借りる
import { env } from 'cloudflare:test'
const db = drizzle(env.DB)          // 本物の D1（ローカル SQLite）
const result = await getLastSets(db, exerciseId)

// ② 統合寄り —— Worker 全体にリクエストを打つ
import { SELF } from 'cloudflare:test'
const res = await SELF.fetch('https://x/api/sets', { method: 'POST', body: ... })
// → /api 振り分け → Hono → zValidator → Drizzle → D1 の全経路が実際に走る。モックゼロ
```

**ストレージの分離**（⚠️ 2026-09-20 実測で訂正）:
当初「各テストの書き込みが終了時に自動ロールバックされる／`beforeEach` の後始末は不要」と
書いていたが、**v0.22 では誤り**。`isolatedStorage` オプションは型定義から消えており、
実測した分離の粒度は **テストファイル単位**だった。

```
[A-1] count = 0   ファイル先頭             → まっさら
[A-2] count = 1   同ファイル内の次のテスト  → A-1 の書き込みが残る
[B-1] count = 0   別ファイル               → まっさら
```

→ **同一ファイル内のテストは状態を共有する。**
   `beforeEach` での後始末、または「テストごとに一意なデータを使う」設計が必要。
   ファイルをまたいだ汚染は起きないので、機能ごとにファイルを分けるのは有効。

**D1 マイグレーションの適用**（1-b で追加。実測で動作確認済み）:

```ts
// vitest.config.ts  ← v0.22 の新 API（cloudflareTest プラグイン方式）
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations('./migrations')

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: '../../wrangler.jsonc' },   // 本番と同じ設定を読む
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
})

// test/setup.ts
import { applyD1Migrations, env } from 'cloudflare:test'
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

制約: workerd 内で走るので **Node 専用のテストユーティリティは使えない**（`fs` を触るもの等）。

### ③ フロントのテスト

**MSW** で fetch をネットワーク層で差し替える。コンポーネントからは本物の API に見えるので、
TanStack Query のキャッシュ・再取得の挙動をそのまま検証できる（Query 公式も推奨）。

⚠️ **MSW のモックは本物の API と型が一致している保証がない。**
API を変えてモックを直し忘れると、テストは通るのに本番が壊れる。
→ モック定義に `z.infer<typeof ...>` を付け、ズレたらコンパイルエラーにする。

### ② と ③ は同居できない → パッケージを分けてあるので問題ない

`vitest-pool-workers`（workerd）と jsdom（Node）は同じ Vitest 実行に同居できない。
今回は `apps/api` と `apps/web` が別パッケージなので、それぞれが自分の設定を持てば衝突しない。

```
apps/api/vitest.config.ts   → cloudflareTest プラグイン（workerd）
apps/web/vitest.config.ts   → environment: 'jsdom'
```

ルートから `pnpm -r test` で両方走る。**モノレポ構成がここで効く。**

### ローカル実行環境について（確認済み）

`wrangler dev` もテストも **完全にローカル。Cloudflare への通信ゼロ、課金ゼロ、Docker 不要。**

```
wrangler dev / vitest → workerd（npm 経由のネイティブバイナリ）
                      → Miniflare（バインディングを再現）
                      → SQLite（workerd 内蔵）
```

- データの置き場所: `.wrangler/state/v3/d1/*.sqlite`（`.gitignore` 済み）。消せば初期化
- **`wrangler dev` のデータは永続。テストは隔離領域 → テストを走らせても開発データは壊れない**
- 中身の確認: `wrangler d1 execute gym-memo --local --command "SELECT ..."`
- Testcontainers のような Docker 依存がないので起動が速く、CI も楽。**オフラインで開発できる**

⚠️ **ローカルで再現されないもの**: Cloudflare Access（認証）、
本番 D1 の制限（クエリタイムアウト・行数上限・DB サイズ）、読み取りレプリカの結果整合性、Time Travel。

⚠️ **`--local` の付け忘れに注意**（付けないと本番 D1 に流れる）。
`package.json` の scripts に `db:migrate:local` のような名前で固めて事故を防ぐ。
