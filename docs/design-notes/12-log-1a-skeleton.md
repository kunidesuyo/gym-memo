# 12. 実装ログ: 1-a（骨組みと疎通）—— 完了 2026-09-20

### 確定した実際のバージョン

| | |
|---|---|
| TypeScript | 7.0.2（Go 実装のネイティブ版） |
| Vite | 8.3.0 / Vitest 4.1.11 |
| React | 19.3.0 |
| Hono | 4.13.8 / Zod 4.6.5 |
| Tailwind CSS | 4.3.3 |
| Wrangler | 4.135.0 / workerd 1.20260918.1 |
| @cloudflare/vitest-pool-workers | 0.22.0 |

### 疎通検証の結果（全て実測で確認済み）

| # | 確認項目 | 結果 |
|---|---|---|
| ① | `wrangler dev` 直叩き `:8787/api/health` | JSON が返る |
| ② | Vite proxy 経由 `:5180/api/health` | 同じ JSON（= CORS なしで繋がる） |
| ③ | `:5180/` が SPA を返す | `<title>gym-memo</title>` |
| ④ | `wrangler` 単体で静的アセットも返す（本番と同じ形） | 返る |
| ⑤ | SPA フォールバック `/workouts/42` | 200 |
| ⑥ | 未定義 API `/api/unknown` | 404 |

**Hono RPC の型が通っていることも実証済み**: `data.statuss` と書くと
`Property 'statuss' does not exist on type '{ status: string; runtime: string; time: string; }'`、
MSW のモックに余分なキーを足すとこちらもコンパイルエラーになる。
→ **API のルート定義 → 画面 → テストのモック** まで1本の型が貫通している。

### ハマりどころ（実際に踏んだもの）

**1. `@cloudflare/vitest-pool-workers` v0.22 で設定 API が変わっていた**

Vitest 4 対応で `defineWorkersConfig` が廃止され、**Vite プラグイン方式**になった。
`/config` サブパス自体が exports から消えている。

```ts
// ❌ 旧（ネット上の記事はほぼこれ）
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
export default defineWorkersConfig({ test: { poolOptions: { workers: { ... } } } })

// ✅ 新
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
export default defineConfig({ plugins: [cloudflareTest({ wrangler: { configPath: '...' } })] })
```

パッケージに `dist/codemods/vitest-v3-to-v4.mjs` が同梱されており、**それを読んで移行方法を特定した**。
`readD1Migrations` もルート export に移っている（1-b で使う）。

**2. compatibility_date の上限がテストと本番で違う**

vitest-pool-workers が同梱する workerd（miniflare 5.20260815.0-alpha）は
`wrangler` 同梱の workerd より古く、当初指定した `2026-09-18` を拒否した。
→ **両方が受け付ける `2026-08-22` に合わせた。**
`This Worker requires compatibility date "X", but the newest date supported by this server binary is "Y"` が出たらこれ。

**3. `SELF` / `env` (`cloudflare:test`) は非推奨になっている**

型定義上は `import { env, exports } from "cloudflare:workers"` が推奨。
ただし `wrangler types` が `Cloudflare.Exports` を生成しないため、現状は `SELF` を使用。
→ **1-b 以降で新 API に移行できるか再確認する（積み残し）。**

**4. web が api のソースを型検査してしまう**

`apps/web` が `AppType` を import すると、tsc が api のソースまで辿り、
Worker グローバル（`Env` / `ExportedHandler`）が解決できず失敗した。

対処を2段構えにした:
- **ルート定義を Worker エントリから分離**（`src/routes.ts` と `src/index.ts`）。
  `apps/api/package.json` の `exports` に `"./routes"` を追加し、
  web は `import type { AppType } from 'api/routes'` として**エントリを読まない**
- それでも `Env` は要るので、`apps/web/tsconfig.json` の `include` に
  `../../worker-configuration.d.ts` を追加。**DOM 型との衝突は実測で無し**

⚠️ トレードオフ: web 側から Worker のグローバル型が見えてしまう。
`worker-configuration.d.ts` は生成物だが、**コミットする**（Cloudflare 推奨）。
そうしないと clone 直後の `pnpm typecheck` が落ちる。再生成は `pnpm types`。

**5. Vite の既定ポート 5173 が他プロジェクトと衝突していた**

別プロジェクトの Vite が 5173 を占有しており、こちらは黙って 5174 にずれていた。
proxy 先とのズレは原因が分かりにくいので、**専用ポート 5180 + `strictPort: true`** を明示。

**6. 細かいもの**
- pnpm 10 はビルドスクリプトをブロックする → `pnpm-workspace.yaml` の
  `onlyBuiltDependencies` に `esbuild` / `workerd` / `msw` を列挙
- CSS の副作用 import（`import './index.css'`）には `"types": ["vite/client"]` が要る
- Biome 2.x で `linter.rules.recommended` は非推奨 → `linter.rules.preset: "recommended"`

### `run_worker_first` の確認結果（論点1の積み残し）

同梱の `node_modules/wrangler/config-schema.json` を直接読んで確認した。
**文字列配列または boolean を受け付ける**（negative rules も可）。

```jsonc
"assets": {
  "directory": "./apps/web/dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

`/api/*` だけが Worker に回り、それ以外はアセット配信 + SPA フォールバック。
ただし Worker 側にも `env.ASSETS.fetch()` のフォールバックを残し、
**Worker 単体でも正しく振る舞えるように**してある。

### Cloudflare アカウント無しで 1-b を進められるか（検証済み）

**進められる。** 実測で確認した:

- `database_id` は**ローカル開発では実在しなくてよい**。プレースホルダ文字列のまま
  `wrangler d1 migrations apply --local` も `wrangler d1 execute --local` も通る
- `wrangler types` は D1 バインディングから `DB: D1Database` を正しく生成する
- vitest-pool-workers 側でも `env.DB` が使え、`readD1Migrations` / `applyD1Migrations` で
  テスト用 DB にスキーマを流せる

必要な設定:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "gym-memo",
    "database_id": "local-placeholder",   // アカウント作成後に本物へ差し替え
    "migrations_dir": "apps/api/migrations"
  }
]
```

⚠️ `migrations_dir` を指定しないと wrangler はリポジトリ直下の `./migrations` を見に行き、
`No migrations present at <repo>/migrations` で失敗する。

**アカウント作成はフェーズ2（デプロイ・ドメイン購入）の直前でよい。**

### コマンド

```bash
pnpm dev          # wrangler dev (:8787) と vite (:5180) を並列起動
pnpm test         # 両パッケージのテスト
pnpm typecheck    # 両パッケージの型検査
pnpm build        # web を dist へビルド
pnpm check        # Biome
pnpm types        # wrangler types の再生成（wrangler.jsonc を変えたら実行）
```
