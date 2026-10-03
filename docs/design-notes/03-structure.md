# 3. 論点1: 構成 —— 【決定済み 2026-09-20】案C を採用

### 決定

**コード上はフロント/バックを分離し、本物の HTTP API を挟む。デプロイは Worker 1つ。**

### 決め手

「分離するか」は独立した2軸の問いだった。

| 軸 | 問い | 学習への影響 |
|---|---|---|
| コードの境界 | フロントとサーバーの間に HTTP があるか | **大きい** |
| デプロイ単位 | デプロイするものが1個か2個か | ほぼゼロ（苦労が増えるだけ） |

世間の「フロント/バック分離」の動機（チーム分割・独立スケール・別リリースサイクル）は
**ひとりのアプリには1つも存在しない**。一方コードの境界は TanStack Query の学習に直結する。
よって「境界は作る、デプロイ単位は1つ」を選ぶ。

加えて **Hono RPC を使ってみたかった** という動機が一致した。

### 構成

```
gym-memo/
├── apps/
│   ├── web/                 # Vite + React（SPA）
│   │   ├── src/routes/      # TanStack Router のファイルベースルート
│   │   ├── src/api/         # fetch クライアント + useQuery/useMutation
│   │   └── dist/            # ビルド成果物 → 静的アセットになる
│   └── api/
│       ├── src/index.ts     # Hono アプリ = Worker のエントリポイント
│       ├── src/db/schema.ts # Drizzle スキーマ
│       └── migrations/
├── infra/                   # Terraform
├── wrangler.jsonc
└── package.json             # pnpm workspaces
```

### 1つの Worker が両方をまかなう仕組み

`wrangler.jsonc`:

```jsonc
{
  "name": "gym-memo",
  "main": "apps/api/src/index.ts",
  "assets": {
    "directory": "./apps/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "gym-memo", "database_id": "..." }
  ]
}
```

Worker 本体:

```ts
// apps/api/src/index.ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env)
    return env.ASSETS.fetch(request)   // それ以外は React の SPA を返す
  },
}
```

リクエストの流れ:

```
/assets/index-abc123.js  → 静的ファイルあり → CDN が直接返す（Worker 起動せず・課金なし）
/api/workouts/42         → Worker 起動 → Hono → D1 → JSON
/workouts/42             → 静的ファイルなし → SPA フォールバックで index.html
```

⚠️ 静的アセットと Worker の評価順は `run_worker_first` 等で切り替わる。
SPA フォールバックとの正確な優先順位は**実装時に最新ドキュメントで確認する**
（Cloudflare が活発に更新している領域。古いブログ記事を信用しない）。

### 開発時は2プロセス（本番は1つ）

```
wrangler dev   → :8787   Hono + ローカル D1。本番と同じ workerd ランタイムが動く
vite dev       → :5173   React、HMR つき
```

```ts
// apps/web/vite.config.ts
server: { proxy: { '/api': 'http://localhost:8787' } }
```

Vite の proxy を通すので、**開発中も同一オリジン扱いで CORS が発生しない。**

### 型安全は Hono RPC で担保する

```ts
// apps/api/src/index.ts
const routes = app.get('/api/workouts/:id', ...).post('/api/workouts/:id/sets', ...)
export type AppType = typeof routes

// apps/web 側
import { hc } from 'hono/client'
import type { AppType } from '../../api/src/index'
export const api = hc<AppType>('/')   // ← コード生成なしで型がつく
```

Hono のルート定義から型を推論した fetch クライアントが手に入る。
**フルスタックFW のサーバー関数と同等の型安全を、HTTP を隠さないまま得られる。**

### 不採用にした案

**案A: TanStack Start（フルスタックFW）** — 型安全と手軽さは魅力だが **SSR がついてくる**。
自分しか開かないアプリに SSR の価値はゼロなのに、hydration ミスマッチや Workers 上の
ランタイム差異は普通に降ってくる。払うコストにリターンがない。Hono RPC で型安全が
埋まるので、案Aを選ぶ理由は「Start 自体を学びたい」場合のみ。→ それは別プロジェクトで。

**案B: 完全分離（Worker 2つ）** — 別オリジンになるため CORS・プリフライト・Cookie の
`SameSite` と開発中も本番も戦い続ける。その苦労が TanStack にも Terraform にも変換されない。
