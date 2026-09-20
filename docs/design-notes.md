# gym-memo 設計メモ

自分専用の筋トレ記録アプリ。技術学習が主目的。
最終更新: 2026-09-20

---

## 1. 目的（優先順位つき）

1. **TanStack 系フロントエンドライブラリを身につける**（Query / Form / Router）
2. **Terraform で Cloudflare にデプロイする**（Terraform は書籍で学習中）
3. 自分が実際にジムで使える記録アプリになる

3 は「動機」であって目的ではない。迷ったら 1・2 の学習効果が高いほうを選ぶ。
ただし 3 を捨てると続かないので、**「前回この種目を何kgで何回やったか」が見える**ところまでは必ず作る。

---

## 2. 決まっていること

- ユーザーは自分ひとり
- デプロイ先は Cloudflare
- 最初はローカルで最小限動くところまで → そのあと Terraform でデプロイ
- 技術選定の軸は「学習になるか」

---

## 3. 論点1: 構成 —— 【決定済み 2026-09-20】案C を採用

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

## 4. 技術スタック —— 【確定 2026-09-20】

```
┌─ apps/web ─────────────────────────────────────┐
│  React 19                                       │
│  TanStack Router    ルーティング（学習目標）       │
│  TanStack Query     サーバー状態（学習目標・主役） │
│  TanStack Form      フォーム（学習目標）          │
│  Zod                バリデーション                │
│  Tailwind CSS v4    スタイル                     │
│  Vite               ビルド / 開発サーバー          │
└────────────────────┬───────────────────────────┘
                     │  hc<AppType> で型付き fetch
┌────────────────────▼───────────────────────────┐
│  apps/api                                       │
│  Hono               ルーティング                  │
│  @hono/zod-validator 入力検証 + RPC の型に反映    │
│  Drizzle ORM        クエリ / スキーマ定義         │
└────────────────────┬───────────────────────────┘
                     │  D1 binding
┌────────────────────▼───────────────────────────┐
│  Cloudflare D1 (SQLite)                         │
└─────────────────────────────────────────────────┘

共通基盤:  TypeScript / pnpm workspaces / Wrangler / Biome
```

### 選定理由

| 選択 | 理由 |
|---|---|
| **pnpm workspaces のみ**（Turborepo なし） | パッケージ2個にタスクオーケストレータは過剰。遅くなってから足す |
| **`packages/shared` を作らない** | Hono RPC の `AppType` と Drizzle の推論型で型は足りる |
| **Zod** | 1つのスキーマが Hono 検証 / TanStack Form 検証 / TS 型の3か所で働く |
| **Drizzle ORM** | D1 公式サポート。マイグレーションが SQL 出力なので Wrangler の流れに乗る |
| **Tailwind CSS v4** | ジムでスマホから使う = モバイル UI を速く回す必要。v4 は Vite プラグインのみで動く |
| **shadcn/ui を入れない** | Radix 依存とコンポーネント管理が乗る。学習目標から外れる。後から足せる |
| **Biome** | ESLint+Prettier+flat config の設定コストを回避。lint 設定は学習目標ではない |
| **テストは 1-a から入れる** | 11章参照。テスト基盤自体の検証を最初に済ませる |

### ⚠️ Zod スキーマ配置の規律

`apps/web` が `apps/api` からスキーマを import するため、
**スキーマを置くファイルには Drizzle / D1 を import しないこと。**
混ざるとサーバー専用コードがフロントのバンドルに入る。

→ `apps/api/src/schema/` を「純粋な Zod だけ」の領域として分離する。

```ts
// apps/api/src/schema/set.ts —— サーバー・クライアント両方から import
export const newSetSchema = z.object({
  exerciseId: z.number(),
  weightKg:   z.number().positive(),
  reps:       z.number().int().positive(),
})

// ① Hono の入力検証    app.post('/api/sets', zValidator('json', newSetSchema), ...)
// ② TanStack Form      useForm({ validators: { onChange: newSetSchema } })
// ③ TypeScript の型    type NewSet = z.infer<typeof newSetSchema>
```

### インストールする依存関係

```
[root]      wrangler, typescript, @biomejs/biome, vitest
[apps/api]  hono, @hono/zod-validator, zod, drizzle-orm
            (dev) drizzle-kit, @cloudflare/vitest-pool-workers
[apps/web]  react, react-dom
            @tanstack/react-router, @tanstack/react-router-devtools, @tanstack/router-plugin
            @tanstack/react-query, @tanstack/react-query-devtools
            @tanstack/react-form
            zod
            (dev) vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite
            (dev) jsdom, msw, @testing-library/react,
                  @testing-library/jest-dom, @testing-library/user-event
```

バージョンは手書きせず `pnpm add` で解決させる。
TanStack Router / Form と Tailwind v4 は **API が新しく変化もあった領域**なので、
導入時に公式ドキュメントの現行版を確認する。

### 検討して却下した選択肢

| 選択肢 | 却下理由 |
|---|---|
| Next.js | Cloudflare では OpenNext アダプタ経由。層が増える |
| TanStack Start | 論点1で決着。SSR が不要 |
| Turborepo | パッケージ2個には過剰 |
| Prisma | D1 対応の層が厚い。バンドルも重い |
| **Kysely** | 下記 |
| shadcn/ui | 学習目標から外れる |
| ESLint + Prettier | 設定コストが学習の邪魔 |
| Neon / Turso | D1 で足りる。外部サービスが増える |

### Drizzle vs Kysely（検討記録）

根本の違いは **「何がスキーマの正か」**。

| | Drizzle | Kysely |
|---|---|---|
| 分類 | ORM | 型安全な SQL クエリビルダ |
| スキーマの正 | **TS のスキーマ定義** | **DB そのもの**（TS はそれを写した宣言） |
| DB を作れるか | ✅ マイグレーション生成 | ❌ 既にある前提 |
| マイグレーション | 差分から SQL を自動生成 | **実行の仕組みはある。生成がない**（手書き、Rails/Django 流儀） |
| D1 | 公式サポート | `kysely-d1`（コミュニティ製） |
| クエリ | `with` でネスト結果。簡潔 | `jsonArrayFrom` 等で明示的。SQL が読める |

**手書きマイグレーションは劣っているわけではない。** 自動生成の弱点は例えばカラムのリネームで、
差分からは `DROP + ADD`（データ消失）にも見えてしまう。drizzle-kit は対話的に確認するが、
推測である以上この曖昧さは原理的に残る。→ **自動化と明示性のトレードオフ**。

**今回 Drizzle を選ぶ決め手は生成の有無ではなく**:
> Drizzle は出力が SQL ファイルなので `wrangler d1 migrations apply` にそのまま乗る。
> Kysely の Migrator は TS を実行する仕組みで、Workers 上の D1 に対しては流れから外れる。

論点2で「マイグレーションは Wrangler の担当」と決めた以上、ここが噛み合うかが効く。

Kysely が勝つ場面: 既存 DB を自分で管理しない / 複雑な SQL を多用する / 抽象化を挟みたくない。
→ 今回はグリーンフィールドで、最も複雑なクエリでも「前回この種目でやったセット」程度。

**Drizzle の粗さ（承知の上で選ぶ）**:
- リレーショナルクエリ API は大きな設計変更を経ており、**ネット記事が新旧混在**。公式の現行版を見る
- 型エラーのメッセージが難解になることがある
- `drizzle-kit` のスナップショットがズレると想定外の差分が出ることがある
- 逃げ道: Drizzle でも `sql` テンプレートで生 SQL が書けるので行き止まりにはならない

## 5. 論点2: Terraform の守備範囲 —— 【決定済み 2026-09-20】Wrangler 中心 + Terraform は Access

### 前提の訂正

当初「D1 本体は Terraform で作る」と書いていたが **撤回した**。理由は下記。

### 出発点: Cloudflare のベストプラクティスは Wrangler 中心

Cloudflare の公式ドキュメント・チュートリアル・テンプレートに Terraform はほぼ登場しない。
これは手抜きではなく設計思想。**`wrangler.jsonc` 自体が既に IaC** だから。

```jsonc
{ "d1_databases": [{ "binding": "DB", "database_name": "gym-memo", "database_id": "..." }] }
```

Git にコミットでき、レビューでき、`wrangler deploy` で収束する。
「宣言 → 収束」という Terraform と同じ仕事をしている。

つまり **Worker とそれに紐づくリソースについては、道具が被っている**。
そこに Terraform を重ねると二重管理の摩擦（`database_id` の受け渡し等）が構造的に発生する。

### 境界線

> **Terraform は Cloudflare「アカウント」を管理する。Wrangler は「アプリケーション」を管理する。**

| 対象 | 担当 |
|---|---|
| ゾーンの設定（SSL モード等） | Terraform |
| **Access アプリケーション + ポリシー** | **Terraform ← 主戦場** |
| Worker のコード・アセット | Wrangler |
| **D1 データベース本体** | **Wrangler**（`wrangler d1 create` 一発、id は不変） |
| D1 のスキーマ/マイグレーション | Drizzle + Wrangler |
| Worker の Custom Domain / DNS | Wrangler（`wrangler.jsonc` の `routes` に書ける） |
| シークレットの値 | `wrangler secret put` |

### 検討した3つの道

- **道1**: Wrangler だけで完結。Terraform は AWS/GCP の別題材で学ぶ
- **道2**: Wrangler 中心 + Terraform は本当に Terraform の仕事だけ ← **採用**
- **道3**: 全部 Terraform に寄せる → **却下**

**採用理由**: 書く HCL の量は少ないが 100% 本物の使い方。
Zero Trust ポリシーを Terraform で管理するのは実務の一般的プラクティス。
**量を水増しするために不自然な使い方をするのは学習として逆効果。**
Terraform で身につけるべきは HCL の行数ではなく、state という概念・import・
plan で確認してから apply する運用感覚であり、これらは Access と DNS だけで全部学べる。

さらに道2は「Terraform とは何を管理するための道具か」という判断力が身につく。
これは全部 Terraform に押し込んだら絶対に学べない。

### 正直な前提

**Cloudflare は Terraform を学ぶ題材としては相性が良くない。** これは事実として認めた上で道2を選ぶ。

また Cloudflare provider は v5 で OpenAPI スキーマからの自動生成に作り直された経緯があり、
ドキュメントの粗さや挙動の癖が報告されている。
→ **詰まったとき「Terraform を理解していない」のか「provider の問題」なのかを切り分ける。**
不自然に消耗したら手動設定に切り替える判断も持っておく。

### セキュリティ上の注意

- API トークンは Global API Key ではなく**スコープ付きトークン**を作り、
  `CLOUDFLARE_API_TOKEN` 環境変数で渡す（`.gitignore` に `*.tfvars` 済み）
- **`terraform.tfstate` は平文 JSON**。渡した変数の値がそのまま残る
  → アプリのシークレットは Terraform 経由にせず `wrangler secret put` で直接入れる

### state の置き場所

- フェーズ2: ローカル state（ひとりなので競合しない）
- フェーズ3: R2 backend（`backend "s3"`）。`skip_*` フラグが複数必要で
  チェックサム周りの追加フラグが要る場合もある → **最初にやると本筋を見失う**ので後回し

### このプロジェクトで学べる Terraform 概念

1. provider の設定と認証（スコープ付きトークン）
2. **state の概念**
3. variable / output / tfvars
4. リソース間の暗黙の依存
5. **`resource` と `data` の区別** — ゾーンは既に存在する。管理したいのか読みたいだけなのか
6. **`import`** — Terraform 1.10.5 なので `import` ブロックが使える（plan で確認してから取り込める）。
   実務最頻出なのに入門書では流されがち。**今回の隠れた当たり**
7. backend の移行（local → R2）

## 6. 論点3: 「自分だけが使う」をどう実現するか —— 【一部決定 2026-09-20】

### 決定済み: 独自ドメインを買う / Cloudflare Registrar を使う

これが論点2と論点3を同時に解く分岐点だった。
ドメインがないとゾーンも DNS も Access も存在しないため、Terraform の出番も消滅する。

- **レジストラ: Cloudflare Registrar** — 原価販売（`.com` で年 $10 程度）。
  購入と同時にゾーン作成と NS 設定まで完了する。`.jp` など一部 TLD は非対応
- **TLD: `.dev` または `.app` を推奨**（後述）。`.com` でも可

### なぜ `.dev` / `.app` か —— HSTS プリロード

HTTPS には「最初の一回」の穴がある。ブラウザは歴史的にまず `http://` を試すため、
サーバーが HTTPS へリダイレクトするまでの往復が平文で流れる（**SSL ストリッピング攻撃**の隙）。

**HSTS** (`Strict-Transport-Security` ヘッダ) は「今後このドメインは必ず HTTPS」と
ブラウザに記憶させる仕組み。ただし **初回アクセスだけは保護されない**（TOFU 問題）。

**HSTS preload list** はブラウザ本体に焼き込まれたドメインリストで、
載っていれば初回から HTTPS 強制。通常は hstspreload.org への申請が必要。

**`.dev` と `.app` は Google 運営の TLD で、TLD 丸ごと preload されている。**
→ 買った瞬間、申請も設定もなしに **HTTP では物理的にアクセスできない**。

個人開発に向く理由:
1. HTTPS 周りの設定ミスが事故にならない（http のリクエストがそもそも来ない）
2. Cookie を `Secure` 前提で考えられる（Access の認証 Cookie 含む）
3. `.com` より名前が空いている

⚠️ 昔の「`myapp.dev` を /etc/hosts に書くローカル開発」は使えない。
今回はローカルが `localhost:5173` なので影響なし。

### 前提知識メモ: ゾーン / DNS / プロキシ

- **ゾーン** = 1つのドメインについて DNS の回答責任を持つ管理単位。
  Cloudflare では「登録した1ドメイン = 1ゾーン」。**Zone ID** が API/Terraform での識別子。
  SSL 設定・WAF・キャッシュ・Access はゾーン単位で効く
- **プロキシ ON/OFF（オレンジ雲/グレー雲）** = トラフィックが Cloudflare を通るかどうか。
  **WAF・キャッシュ・Access が効くのはプロキシ ON のときだけ**（通らないものは制御できない）。
  Worker はエッジで動くので常にプロキシ ON 相当

### 認証方式: Cloudflare Access（Zero Trust）

アプリの手前、Cloudflare のエッジで認証する。

```
① 未認証リクエストが gym.<domain> に来る
② エッジが Worker に届く「前に」止める        ← ここが肝
③ ログイン画面へリダイレクト（Google / GitHub / メールへワンタイムPIN）
④ 認証成功 → CF_Authorization Cookie（JWT）を発行
⑤ 以降はエッジで Cookie を検証して通過
⑥ Worker には Cf-Access-Jwt-Assertion ヘッダ付きで届く
```

**リクエストは Worker に到達しない → アプリに認証コードを1行も書かなくていい。**

設定の構造:

```
Access アプリケーション   「gym.<domain> を保護する」宣言
        └─ Access ポリシー  「誰を通すか」→ include: email = 自分のアドレス / decision: allow
```

- ID プロバイダは **One-time PIN（メールに6桁コード）なら IdP 設定すら不要**。最初はこれ
- 無料プランで一定人数まで使える。個人利用ならコストなし
- ⚠️ provider v5 で Access 関連のリソース構造が変わっている（ポリシーがアカウントスコープ化など）。
  **必ず Terraform Registry の v5 ドキュメントを一次情報として引くこと**

### Worker をホスト名に紐づける方法

- **Custom Domain**（推奨・新しい）— Worker に直接ホスト名を割り当て、DNS レコードは Cloudflare が自動生成。
  `wrangler.jsonc` に書ける: `"routes": [{ "pattern": "gym.<domain>", "custom_domain": true }]`
- Routes（旧）— パターンで振る。DNS レコードを自分で用意する必要がある

### 不採用

- **自前セッション認証**（パスワード / Passkey）— ドメイン不要だが学習目標に乗らない。
  ひとり用アプリにパスワード管理を実装するのはオーバーヘッド
- **認証なし・URL を秘密にする** — 対策ではない。却下

### 未決（論点3の残り）

- [ ] ドメイン名を決める
- [ ] `.dev` / `.app` / `.com` のどれにするか
- [ ] Worker 側で `Cf-Access-Jwt-Assertion` を検証するか（エッジバイパス対策。最初は不要）
- [ ] IdP は One-time PIN で始めるか、最初から Google にするか

**フェーズ1（ローカル）では認証は一切実装しない。** デプロイ直前に決めれば間に合う。

## 7. データモデル（たたき台）

```
exercises        種目マスタ
  id, name, muscle_group, created_at

workouts         1回のトレーニングセッション
  id, performed_at, note

sets             1セットの記録（このアプリの主役テーブル）
  id, workout_id, exercise_id, set_order,
  weight_kg, reps, rpe, note
```

**最重要クエリ**: 種目を選んだとき「前回この種目でやった全セット」を返す。
これが出るかどうかでアプリの価値が決まる。TanStack Query のキャッシュ設計も、
まずこのクエリを中心に考える。

集計・グラフは後回し。まず記録できること、前回が見えること。

---

## 8. 進め方

### フェーズ1: ローカルで最小限（認証なし・デプロイなし）

**1-a: 骨組みと疎通** —— ✅ **完了 2026-09-20**（詳細は12章）
- [x] pnpm workspaces、Vite + React、Hono Worker
- [x] `/api/health` を Hono RPC 経由で叩き、**型がついた**レスポンスを画面に出す
- [x] テスト基盤: `apps/api` に vitest-pool-workers、`apps/web` に jsdom + testing-library + MSW

**1-b: D1 + Drizzle** —— ✅ **完了 2026-09-20**（詳細は13章）
- [x] スキーマ定義、`drizzle-kit generate`、`wrangler d1 migrations apply --local`
- [x] 種目マスタの固定シード
- [x] テストに `applyD1Migrations` を追加、Drizzle クエリのテストを書く
- [x] API エンドポイント一式（1-c の UI が消費する土台）
- [x] 積み残しだった `cloudflare:workers` 新 API への移行

**1-c: ドメイン実装** —— ✅ **完了 2026-09-20**（詳細は14章）
- [x] TanStack Router / Query / Form
- [x] ワークアウト作成 → 種目選択 → セット記録 → 一覧
- [x] **「前回の記録」表示**（このアプリの存在理由）
- [x] フロントのコンポーネントテストを本格化（12本）
- **完了条件: 1回分の記録が最後まで入れられる → 達成**

### フェーズ2: Terraform で Cloudflare へ
- [ ] （決めたら）ドメイン取得・Cloudflare へ移管
- [ ] Terraform で D1 本番・Worker・DNS を作る
- [ ] Wrangler でコードデプロイ、マイグレーション適用
- [ ] Cloudflare Access を Terraform で設定、自分だけ許可
- **完了条件: ジムでスマホから記録できる**

### フェーズ3: 実用と学習の上積み
- [ ] PWA 化・オフライン対応（ジムは電波が悪い。TanStack Query の真骨頂）
- [ ] GitHub Actions で CI/CD
- [ ] Terraform state を R2 に
- [ ] 記録のグラフ化

---

## 9. 次に決めること

1. ~~ドメインを買うか~~ → **買う / Cloudflare Registrar**（決定 2026-09-20）
2. ドメイン名と TLD（`.dev` / `.app` 推奨）
3. モノレポツール（pnpm workspaces で十分か、Turborepo まで入れるか）
4. フェーズ1 のスコープ（種目マスタは固定シード、RPE・メモ・グラフは後回し、認証なし）

## 10. 決定ログ

| 日付 | 論点 | 決定 |
|---|---|---|
| 2026-09-20 | 論点1: 構成 | 案C（論理分離 / 物理1 Worker）。型安全は Hono RPC |
| 2026-09-20 | 論点2: Terraform | 道2（Wrangler 中心 + Terraform は Access 中心）。D1 も Wrangler 管理に訂正 |
| 2026-09-20 | 論点3: ドメイン | 買う。Cloudflare Registrar。TLD は `.dev`/`.app` 推奨 |
| 2026-09-20 | 論点3: 認証 | Cloudflare Access（One-time PIN で開始） |
| 2026-09-20 | 技術スタック | 確定（4章）。ORM は Drizzle、Kysely は検討の上で却下 |
| 2026-09-20 | テスト | 1-a から導入（11章）。「フェーズ1では入れない」を撤回 |
| 2026-09-20 | 実装 | **1-a 完了**（12章）。疎通・型貫通・テスト基盤すべて実測で確認 |
| 2026-09-20 | テスト | ストレージ分離は**テストファイル単位**と実測で判明（11章を訂正） |
| 2026-09-20 | 環境 | Cloudflare アカウント無しでも 1-b は進行可能と実測で確認（12章） |
| 2026-09-20 | 実装 | **1-b 完了**（13章）。スキーマ・API・テスト17本。非推奨 API の移行も完了 |
| 2026-09-20 | 実装 | **1-c 完了**（14章）。フェーズ1 達成。Router/Query/Form、テスト計29本 |
| 2026-09-20 | 設計変更 | Form の配列フィールドは不採用。UX 優先で1セットずつ記録する形に（14章） |
| 2026-09-20 | 要件 | **MVP の仕様を確定**（15章）。ヒアリング結果を反映。画像アップロードはバックログ |
| 2026-09-20 | 実装 | **1-d 完了**（16章）。スキーマ拡張・種目 CRUD。テスト計48本 |
| 2026-09-20 | スキーマ | **主キーを UUIDv7 に変更**（17章）。v4 ではなく v7 なのは id をタイブレーカーに使っているため |
| 2026-09-20 | 実装 | **1-e 完了**（18章）。修正・削除とセッション詳細の作り直し。テスト計60本 |
| 2026-09-20 | 実装 | **1-f 完了 / MVP 達成**（19章）。種目ごとの記録。テスト計69本 |

## 11. テスト戦略 —— 【決定 2026-09-20】

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

## 12. 実装ログ: 1-a（骨組みと疎通）—— 完了 2026-09-20

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

## 13. 実装ログ: 1-b（D1 + Drizzle）—— 完了 2026-09-20

### スキーマ（実装済み）

```
exercises   id, name(UNIQUE), muscle_group, created_at
workouts    id, performed_on(YYYY-MM-DD), created_at
sets        id, workout_id→workouts(CASCADE), exercise_id→exercises,
            set_order, weight_kg, reps, created_at
            INDEX: sets_exercise_idx, sets_workout_idx
```

RPE・メモは方針どおり後回し。`sets.exercise_id` の索引は「前回の記録」クエリのため。

### API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | 疎通確認 |
| GET | `/api/exercises` | 種目一覧 |
| POST | `/api/workouts` | セッション作成（201） |
| GET | `/api/workouts/:id` | セッション + セット（種目名つき） |
| POST | `/api/workouts/:id/sets` | セット記録（201） |
| GET | `/api/exercises/:id/last-sets` | **前回の記録**（`?excludeWorkoutId=` で記録中を除外） |

**`excludeWorkoutId` が要る理由**: これが無いと、今日1セット入れた時点で
「前回」が今日自身になってしまう。

**`setOrder` はサーバーが採番する**（同一ワークアウト×種目の連番）。
クライアントに決めさせると、並行して入力したときに破綻する。

### マイグレーションの流れ（論点2の分担どおり動いた）

```bash
pnpm db:generate       # drizzle-kit がスキーマ差分から SQL を生成
pnpm db:migrate:local  # wrangler がローカル D1 に適用
pnpm db:seed:local     # 種目マスタを投入
pnpm db:reset:local    # .wrangler を消して上2つをやり直す
```

**drizzle-kit の `meta/` フォルダは wrangler が無視する**ので、
`migrations/` を両者で共有して問題ない。実測で確認済み。

### テスト（API 側 17本）

- `queries.test.ts` — Drizzle クエリの単体。`getLastSets` を重点的に
  （記録なし / 直近が返る / 他種目を混ぜない / excludeWorkoutId）
- `routes.test.ts` — `exports.default.fetch` で Worker 全体を叩く統合テスト
  （201 / 400 バリデーション / 404）
- `health.test.ts` — 疎通

ストレージ分離がファイル単位なので、**`beforeEach` で `resetDb()`** している（11章の訂正どおり）。
削除順序は FK の都合で sets → workouts → exercises。

テストは本番の `seed.sql` に依存せず、自分でフィクスチャを作る。

### 積み残しを解消: `cloudflare:test` → `cloudflare:workers`

12章で「`SELF` / `env` が非推奨」と記録していた件。**移行できることを実測して移行した。**

```ts
// 旧（非推奨）
import { SELF, env } from 'cloudflare:test'
await SELF.fetch(url, init)

// 新
import { exports, env } from 'cloudflare:workers'
await exports.default.fetch(url, init)   // 2引数形式もそのまま使える
```

`applyD1Migrations` だけは `cloudflare:test` にしか無いので、そこだけ併用する。

### ハマりどころ

**1. `migrations_dir` の指定が必須**

`wrangler.jsonc` の D1 設定に書かないと、wrangler はリポジトリ直下の `./migrations` を探し
`No migrations present at <repo>/migrations` で失敗する。今回は `apps/api/migrations`。

**2. `noUncheckedIndexedAccess` がレスポンス型を汚していた**

`const [row] = await db.insert(...).returning()` は `T | undefined` になる。
これをそのまま返していたため、**Hono RPC のレスポンス型に `undefined` が混入**していた。
テスト側も `w!.id` と非 null アサーションだらけになり、Biome が16件警告を出して発覚。

→ クエリ関数側で潰すのが正しい。INSERT ... RETURNING は必ず1行返すのだから:

```ts
const [row] = await db.insert(workouts).values({ performedOn }).returning()
if (!row) throw new Error('workout の作成に失敗しました')
return row
```

**lint の警告が設計の弱さを指していた**例。`!` で黙らせなくてよかった。

### 動作確認（`wrangler dev` に実際に curl）

```
① GET  /api/exercises                     → シードした8種目が返る
② POST /api/workouts                      → id 採番
③ POST /api/workouts/:id/sets  x2         → setOrder 1, 2 と採番される
   GET  /api/workouts/:id                 → 種目名つきでセットが並ぶ
④ GET  /api/exercises/1/last-sets
        ?excludeWorkoutId=<今日>           → 前回(09-13)のセットが返る
⑤ POST 負の重量                            → 400
```

## 14. 実装ログ: 1-c（ドメイン実装）—— 完了 2026-09-20

### 画面

```
/                        セッション一覧 + 「今日のセッションを始める」
/workouts/$workoutId     記録画面
```

記録画面の構造:

```
2026-09-20
種目: [ベンチプレス ▼]
┌─ 前回の記録 (2026-09-13) ─┐   ← このアプリの存在理由
│ 1. 60kg × 10              │
│ 2. 65kg × 8               │
└───────────────────────────┘
重量[67.5]kg  回数[8]回  [記録する]
┌─ 今日 ──────────┐
│ 1. 67.5kg × 8   │
└─────────────────┘
```

### TanStack Query —— 学習の主役

**queryKey は階層 = 無効化の単位で設計する**（`src/api/keys.ts` に集約）:

```ts
exercises: () => ['exercises']
workouts:  () => ['workouts']
workout:   (id) => ['workouts', id]        // ['workouts'] の invalidate で両方が対象
lastSets:  (exerciseId, excludeWorkoutId) => ['exercises', exerciseId, 'last-sets', {...}]
```

**`staleTime` の使い分け**: 種目マスタは固定シードなので `Number.POSITIVE_INFINITY`。
取り直す理由がないものを取り直さない。

**楽観的更新**（`useAddSet`）: ジムでサーバー応答を待って画面が固まるのが最悪なので、
`onMutate` で先に画面を進め、`onError` で巻き戻し、`onSettled` でサーバーの真実に合わせ直す。

- 仮 id は **負数**にして本物の採番と衝突させない
- 種目名は**取得済みの種目一覧キャッシュから借りる**（`qc.getQueryData`）。再取得しない

**無効化の粒度がこの設計の肝**:

```ts
onSettled: () => {
  qc.invalidateQueries({ queryKey: keys.workout(workoutId) })
  qc.invalidateQueries({ queryKey: keys.workouts() })   // セット数が変わるので一覧も古い
  // 「前回の記録」は excludeWorkoutId で今日を除外しているので影響を受けない。
  // ここを無闇に invalidate しないのがポイント。
}
```

### TanStack Form + 共有 Zod スキーマ

`apps/api/src/schema/set.ts` の `setFormSchema` を **web の検証にそのまま渡している**
（Standard Schema 対応）。サーバーと同じルールなので
「クライアントは通るのにサーバーで 400」が構造的に起きない。

`<input>` からは文字列で届くので、`z.string().min(1).transform(Number).pipe(z.number()...)` の形にした。

⚠️ **`z.coerce.number()` は `.pipe()` の先に置けない**。
入力型が `unknown` で `ZodSafeParseError ... unknown is not assignable to string` になる。
`transform(Number)` を挟むのが正解。

UX 判断: **送信後は重量を残して回数だけ消す**（同じ重量で複数セット組むため）。

### 当初計画からの変更: 配列フィールドをやめた

設計メモでは「1回のワークアウトで種目→セットを N 行、動的配列フィールドが Form の見せ場」
としていたが、**ジムでの実際の使い方は「1セット終わるたびに1件記録」**。
UX を優先して1件ずつの入力にした。

→ 配列フィールドの練習は未消化。必要なら後で別の画面（例: テンプレート機能）で扱う。

### テスト（フロント 12本）

- `SetForm.test.tsx` (4) — 共有スキーマによる検証がクライアント側でも効くこと
- `WorkoutRecorder.test.tsx` (5) — MSW 経由。**楽観的更新とロールバックを実測**
- `WorkoutList.test.tsx` (3) — メモリ履歴でルータを組んで `<Link>` を検証

**楽観的更新の検証方法**: MSW ハンドラを `delay(100)` で遅らせ、
それより早く画面に出ていれば楽観的更新が効いている、と判定する。
ロールバックはエラーハンドラ（同じく遅延つき）に差し替えて、
「一度出てから消える」ことを確認する。

### ハマりどころ

**1. `InferResponseType` にステータスを指定しないとエラー型が混ざる**

zValidator を付けたルートは 400 も返すので、推論型が
`ZodSafeParseError<...> | 本来の型` のユニオンになり、プロパティにアクセスできない。

```ts
InferResponseType<typeof client.api.workouts[':id']['$get'], 200>   // ← 200 を指定する
```

型の定義箇所は `src/api/hooks.ts` に集約した。

**2. `mutateAsync` の拒否が未処理 Promise 拒否になる**

TanStack Form の `onSubmit` が `mutateAsync` を await するため、失敗が上に伝播する。
エラーは `addSet.error` として画面に出すので、`.catch(() => {})` で明示的に握る。

**3. ルータプラグインは `react()` より前に置く**

`tanstackRouter({ target: 'react', autoCodeSplitting: true })` を plugins 配列の先頭に。
プラグイン名は現在 `tanstackRouter`（旧 `TanStackRouterVite` も残っているが非推奨）。

**4. 生成ファイルを Biome の対象から外す**

`src/routeTree.gen.ts` は自動生成で `any` を含むため、`biome.json` の
`files.includes` に `"!**/routeTree.gen.ts"` を追加。

**5. `any` を使わずに TanStack Form の Field を受ける**

`FieldApi` は型引数が非常に多い。必要な形だけを**メソッド記法の構造的な型**で受ければ
実際の `FieldApi` が代入可能になり、`any` も biome-ignore も不要になる。

```ts
type FieldLike = {
  name: string
  state: { value: string; meta: { errors: unknown[] } }
  handleBlur(): void
  handleChange(value: string): void
}
```

**6. 日付は `toISOString()` を使わない**

UTC になるので日本時間の夜は日付が1日ずれる。ローカル時刻から組み立てる。

### 動作確認（実データを入れて全経路）

```
① :5180/ が SPA を返す                          <title>gym-memo</title>
② /workouts/1 が 200（vite / wrangler 両方）     SPA フォールバック
③ GET  /api/workouts（proxy 経由）               過去セッションが返る
④ POST /api/workouts                             今日のセッション作成
⑤ GET  /api/exercises/1/last-sets?exclude...     前回(09-13)の3セットが返る
⑥ POST セット → GET セッション                   種目名つきで反映される
```

⚠️ **ブラウザでの E2E は未実施**。Playwright のブラウザ（約150MB）が未インストールのため。
フェーズ3で Playwright を入れるときに合わせて実施する。

## 15. 要件と仕様（MVP）—— 【確定 2026-09-20】

フェーズ1完了後、ユーザーから実際の要件をヒアリングして確定させたもの。
**MVP を先に完成させ、足りないものは後から追加する**方針。

### 使い方の前提

- **PPL 分割**（push / pull / legs）で、**週3〜4回**
- ユーザーは自分ひとり
- 年間おおよそ180セッション・1,800セット → **D1 の性能は論点にならない**

### MVP の機能

| # | 機能 | 状態 |
|---|---|---|
| 1 | 記録 = 重量・回数・**メモ（セット単位）** | メモを追加 |
| 2 | **その種目の前回の記録**を見る | フェーズ1で実装済み |
| 3 | **日付ごと**の記録を見る | セッション詳細を作り直す |
| 4 | **種目ごと**の記録を見る | 新規 |
| 5 | **種目を自分で追加・編集・削除** | 新規（固定シードをやめる） |
| 6 | 種目に**部位**を設定（2軸） | 新規 |
| 7 | **セットの修正・削除** | 新規 |
| 8 | **セッションの削除** | 新規 |

### スキーマ（変更後）

```
exercises
  id            TEXT (UUIDv7)                                ← 17章
  name          UNIQUE
  category      'push' | 'pull' | 'legs'                    ← PPL。種目選択の絞り込み用
  muscleGroup   'chest' | 'shoulders' | 'triceps'
                | 'back' | 'biceps'
                | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs'
  createdAt

workouts        id(UUIDv7), performedOn, createdAt

sets
  ... 既存 ...
  note          NULL可                                       ← 追加
```

**なぜ部位を2軸持つか**: PPL は実際の分割と一致するので種目選択の絞り込みに効く。
細かい部位は情報として欲しい。どちらかに寄せると片方が不便になる。

⚠️ **2軸は独立に持つため「胸なのに pull」のような矛盾を作れてしまう。**
→ 画面側で `muscleGroup` を選んだら `category` を自動で埋め、変更もできる形にする。
   DB 制約ではなく UI で矛盾を作りにくくする方針。

### 画面構成

```
/                        セッション一覧（日付ごとの記録の入口）
/workouts/$workoutId     セッション詳細 + 記録・修正・削除
/exercises               種目一覧・追加・編集・削除
/exercises/$exerciseId   種目ごとの記録（履歴）
```

ヘッダに「記録 / 種目」のナビゲーションを置く。

**セッション詳細は作り直す。** フェーズ1では選択中の種目のセットしか見えなかったが、
**全種目のセットを種目ごとにまとめて表示**し、その下に記録フォームを置く。
過去のセッションを見返す用途にはこれでないと使えない。

### API（追加分）

```
POST   /api/exercises              種目追加
PATCH  /api/exercises/:id          種目編集
DELETE /api/exercises/:id          種目削除（使用中なら 409）
GET    /api/exercises/:id/history  種目ごとの記録
PATCH  /api/sets/:id               セット修正
DELETE /api/sets/:id               セット削除
DELETE /api/workouts/:id           セッション削除（sets は FK の CASCADE で消える）
```

### 決定事項

| 論点 | 決定 | 理由 |
|---|---|---|
| メモの粒度 | **セット単位** | ユーザー指定 |
| 部位の持ち方 | **PPL と細かい部位の両方** | ユーザー指定 |
| セット修正・削除 | **MVP に入れる** | 打ち間違えたら直せないと毎日使えない |
| 種目削除 | **物理削除 + 使用中なら拒否（409）** | アーカイブ（論理削除）も提案したがユーザーが物理削除を選択。`archivedAt` カラムは持たない |
| セッション削除 | **入れる** | 日付を間違えた・空のまま放置が起きるため |
| 画像アップロード | **MVP に入れない** | 下記バックログへ |

### バックログ（MVP の後）

| # | 項目 | 備考 |
|---|---|---|
| 1 | **種目への画像アップロード**（器具の設定メモ用） | **R2 が必要**。アプリ機能ではなくインフラ追加。R2 バケットはアカウント単位リソースなので **Terraform の正当な管理対象が1つ増える**（論点2の学習面ではプラス） |
| 2 | グラフ・推移 | |
| 3 | PR（自己ベスト） | |
| 4 | メニュー / テンプレート | TanStack Form の**動的配列フィールド**の練習に向く（1-c で未消化） |
| 5 | 有酸素・体重・体脂肪 | |
| 6 | PWA / オフライン対応 | TanStack Query の真骨頂。フェーズ3 |
| 7 | TanStack Router の loader / search params | 現状ルーティングしか使っていない |
| 8 | ブラウザでの E2E（Playwright） | フェーズ3 |

### 実装の割り方（フェーズ1.5）

| | 内容 |
|---|---|
| **1-d** | スキーマ拡張（メモ・部位2軸）+ 種目 CRUD —— ✅ **完了 2026-09-20**（16章） |
| **1-e** | セットの修正・削除、セッション削除、セッション詳細の作り直し —— ✅ **完了 2026-09-20**（18章） |
| **1-f** | 種目ごとの記録画面 + ナビゲーション整備 —— ✅ **完了 2026-09-20。MVP 達成** |

## 16. 実装ログ: 1-d（スキーマ拡張 + 種目 CRUD）—— 完了 2026-09-20

### 変更点

- `exercises.category`（PPL）を追加、`sets.note` を追加
- 種目マスタを「固定シード」から「初期データ」に格下げ（13種目）
- 種目 CRUD の API と `/exercises` 画面
- `GET /api/exercises?category=push` で絞り込み
- セット記録フォームにメモ欄

**部位 → PPL の自動補完**は `schema/exercise.ts` の `defaultCategoryFor` に集約した。
画面で部位を選ぶと分割が埋まり、手で変更もできる。テストで3パターン検証済み。

### ハマりどころ

**1. `InferResponseType` は明示的な `200` が無いと絞り込めない**

`c.json(rows)` はステータスが `ContentfulStatusCode`（広い型）になる。
zValidator を足して 400 が生えると、`InferResponseType<..., 200>` で絞ろうとしても
ユニオンが残り `[number]` で添字アクセスできなくなる。

→ **成功レスポンスに `c.json(rows, 200)` と明示する。**
一覧系は今後も `zValidator('query')` を足しがちなので、最初から付けておくのが無難。

**2. web に Worker の `Response` 型が見えている問題が実際に出た**

12章で「web の tsconfig が `worker-configuration.d.ts` を読むトレードオフ」と記録した件。
エラーレスポンスを読むヘルパを `(res: Response) => ...` と書いたら、
`Response` が Worker 版（`webSocket` / `cf` を持つ）に解決され、
Hono の `ClientResponse` を受け取れなかった。

→ 必要な形だけを構造的に受ける: `(res: { json(): Promise<unknown> })`。

**3. `ALTER TABLE ... ADD COLUMN NOT NULL` は既存行があると失敗する**

`category` は NOT NULL なので、行があるテーブルには DEFAULT 無しで足せない。
今回はローカルの捨てデータだったので `pnpm db:reset:local` で回避した。
→ **本番（フェーズ2以降）では、既存行があるテーブルに NOT NULL 列を足すとき
   DEFAULT を付けるか、多段マイグレーションにする必要がある。**

**4. 型付き MSW モックがドリフトを検出した**

`exercises` に `category`、`sets` に `note` を足した時点で、
モックのフィクスチャがコンパイルエラーになった。11章で狙ったとおりの挙動。

### 検証で踏んだ事故: 古い `wrangler dev` が生き残っていた

curl での確認結果が「フィルタが効かない」「POST が 404」「note が無い」と
実装と食い違った。原因は **5時間前に起動した `wrangler dev` が 8787 を握ったまま**
だったこと。バックグラウンド起動した pnpm ラッパーを `kill` しても、
子の `wrangler` / `workerd` までは止まっていなかった。

→ API の挙動が実装と食い違ったら、まず `lsof -nP -iTCP:8787 -sTCP:LISTEN` を見る。
   後片付けは `pkill -f 'gym-memo.*workerd'` のようにプロセス名で行う。
   （対話シェルで `pnpm dev` を Ctrl-C する分にはプロセスグループに届くのでこの問題は起きない）

### テスト

API 29本（+12）／フロント 19本（+6）。合計48本。

`ExerciseManager.test.tsx` では **部位→PPL の自動補完**と、
**使用中の種目削除でサーバーの 409 文言が画面に出ること**を検証している。

## 17. ID の方式 —— 【決定 2026-09-20】UUIDv7 / 接頭辞なし / API 側発行

### 決定

- **UUIDv7**（`uuid` パッケージの `v7()`）
- **接頭辞なし**（Stripe 風の `wk_...` は採用しない）
- **発行は API 側**（Drizzle の `$defaultFn`）

### なぜアプリ側発行にしたいのか（動機の整理）

1. **オフライン対応**（バックログ6番）— 電波の悪いジムで記録して後から同期するには、
   サーバーに問い合わせずに ID が決まっている必要がある
2. **楽観的更新の仮 ID が要らなくなる** — 1-c では `id: -Date.now()` という負数の仮 ID を使っていた

⚠️ **ただし今回は API 側発行を選んだため、上の2つはまだ実現していない。**
ID の形式が UUID になったので、後からクライアント発行に移すのは小さな変更で済む。
仮 ID は `optimistic-<timestamp>-<random>` という形に変えて残してある。

### 検討した選択肢

| 方式 | 長さ | 時系列順 | 生成 |
|---|---|---|---|
| UUIDv4 | 36 | ❌ | `crypto.randomUUID()` 標準 |
| **UUIDv7** | 36 | ✅ 先頭が時刻 | `uuid` パッケージ。RFC 9562 |
| ULID | 26 | ✅ | `ulid`。Crockford base32 |
| NanoID | 21 | ❌ | `nanoid`。最短 |
| CUID2 | 24前後 | ❌ 意図的に非順序 | `@paralleldrive/cuid2` |
| KSUID | 27 | ✅ | 採用例は少なめ |

### v4 ではなく v7 を選んだ決め手

**既存クエリが `id` をタイブレーカーに使っていた。**

```ts
.orderBy(sets.exerciseId, sets.setOrder, sets.id)          // 同一 setOrder の並び
.orderBy(desc(workouts.performedOn), desc(workouts.id))    // 同日に複数セッションがある場合
```

ランダム ID（v4 / NanoID）にすると**この順序が壊れる**。
`createdAt` で代替する手もあるが、`current_timestamp` は**秒精度**なので同一秒の並びが不定になる。
→ **時系列順の ID を選べばこの問題自体が消える。**

ULID（26文字）と迷ったが、RFC 標準であることを優先して UUIDv7 にした。

### SQLite / D1 固有の話（今回は判断材料にしていない）

`INTEGER PRIMARY KEY` は SQLite では `rowid` の別名で、テーブル本体の B-tree キーそのもの。
TEXT を主キーにすると内部 rowid とは別に主キー索引が1本増える（`WITHOUT ROWID` で回避可）。
**年間1,800行のアプリでは体感差が無い**ので、性能は判断材料にしなかった。

### 実装

```ts
// apps/api/src/db/schema.ts
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
```

`$defaultFn` は Drizzle が INSERT 時に呼ぶ。SQLite に UUID 生成関数が無いので、
DB のデフォルト値ではなく ORM 層で採番する形になる。

**Zod 4 には `z.uuidv7()` がある**（`z.uuidv4()` / `z.uuidv6()` も）。
ただし**パスパラメータの検証は `z.uuid()`（版を問わない）にした**。
将来クライアント発行に変えたときに版を縛って困らないようにするため。存在しなければ 404 で返せばよい。

**副作用として 400 と 404 が分かれた**:

```
GET /api/workouts/123                                   → 400（UUID ではない）
GET /api/workouts/01a0bf17-0000-7000-8000-000000000000  → 404（形式は正しいが存在しない）
```

### マイグレーションは squash した

主キーの型変更は SQLite ではテーブル再作成になる。
**まだどこにもデプロイしていない**ので、その再作成を履歴に残すより
最終形1本にしたほうが読みやすいと判断し、`migrations/` を作り直した。
本番稼働後は当然この手は使えない。

### シードの扱い

`seed.sql` は生 SQL なので UUID を生成できない。
**固定の UUIDv7 を13件ハードコード**してある（`INSERT OR IGNORE` で冪等）。

### テストへの影響

存在しない ID の 404 テストで `9999` が使えなくなったので、
**形式は正しいが存在しない UUID** を定数に置いた。

```ts
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'
```

型付き MSW フィクスチャも `number` → `string` でコンパイルエラーになり、
ここでも型がドリフトを捕まえた。

### 動作確認

```
① 種目一覧の id が UUID になっている
② POST /api/workouts が UUID を返す
③ セット2件が setOrder 1,2 で並び、メモも入る
④ UUID でない id → 400
⑤ 形式は正しいが存在しない id → 404
⑥ 「前回の記録」が時系列順で正しく引ける
```

## 18. 実装ログ: 1-e（修正・削除とセッション詳細の作り直し）—— 完了 2026-09-20

### API

```
PATCH  /api/sets/:id         重量・回数・メモの修正
DELETE /api/sets/:id         削除 + setOrder の詰め直し
DELETE /api/workouts/:id     セッション削除（セットは CASCADE）
```

**種目は修正できない仕様にした。** 変えると `setOrder`（ワークアウト×種目ごとの連番）の
意味が壊れるため。種目を間違えたら削除して入れ直す。

**削除時に `setOrder` を詰め直す。** 2/3 を消して 1,3 が残ると記録として不自然なので、
同じワークアウト×種目の残りを 1 から振り直す。1種目あたり数セットなので順次 UPDATE で十分。

### FK の CASCADE は D1 で効く（実測）

`deleteWorkout` はワークアウトを消すだけで、ぶら下がるセットは
`references(..., { onDelete: 'cascade' })` で消える。
SQLite は `PRAGMA foreign_keys` が OFF だと外部キーを無視するため念のため確認したが、
**ローカル D1（miniflare）では CASCADE が動作した。**
スキーマの CASCADE 宣言は飾りではなく実効性がある。

### 画面の作り直し

`WorkoutRecorder` → **`WorkoutDetail`** に改名・再構成。

1-c では「選択中の種目のセット」しか見えなかったが、
**全種目のセットを種目ごとにまとめて表示**し、その下に記録フォームを置く形にした。
過去のセッションを見返す用途にはこれでないと使えない。

```
2026-09-20                         [セッションを削除]
種目: [ベンチプレス ▼]
┌─ 前回の記録 (2026-09-13) ─┐
└───────────────────────────┘
重量[  ] 回数[  ] メモ[  ]  [記録する]

── 今日の記録 ──
ベンチプレス
  1. 60kg × 10  シート3段目  [編集][削除]
  2. 65kg × 8               [編集][削除]
```

セットは `exerciseId` 順に届くので、**隣り合う同一種目をまとめるだけ**でグループ化できる。

### SetForm を編集にも使い回した

追加専用だったフォームに `initial` / `submitLabel` / `onCancel` / `resetAfterSubmit` を足した。

⚠️ `resetAfterSubmit` は**新規追加のときだけ true**。
追加時は「同じ重量で複数セット組む」ので重量を残して回数とメモを消すが、
編集時に値が消えると困る。既定を false にして、追加側で明示的に渡す形にした。

### 楽観的更新を修正・削除にも広げた

- **修正**: 該当セットを `map` で差し替え
- **削除**: `filter` で除いたうえで、**画面側でも setOrder を詰め直す**

削除の詰め直しはサーバーと同じ計算をクライアントでも行っている。
`onSettled` の再取得で最終的に一致するので、ズレても自己修復する。

### セッション削除は2段階確認

`window.confirm` ではなく**ボタンを2段階**にした（「セッションを削除」→「削除しますか？ はい/いいえ」）。
ブラウザダイアログはテストしづらく、UX も割り込み的なため。
セット削除は1行だけで復旧も容易なので即時実行にしてある。

### テストのハマりどころ

**セクションを絞り込むヘルパは非同期にする必要があった。**

```ts
// ❌ 描画前に評価されて空の DOM を見てしまう
function todaySection() {
  const heading = screen.getByRole('heading', { name: '今日の記録' })
  ...
}

// ✅
async function todaySection() {
  const heading = await screen.findByRole('heading', { name: '今日の記録' })
  ...
}
```

`waitFor` のコールバック内で `await` する場合は `waitFor(async () => ...)` にすること。

### テスト

API 36本（+7）／フロント 24本（+5）。合計60本。

フロント側では「編集できる」「キャンセルできる」「削除すると setOrder が詰まる」
「セッション削除は確認してから実行する」を検証している。

### 動作確認（実 API）

```
① 3セット記録 → [(1,60),(2,65),(3,70)]
② 2セット目を 67.5kg×6 メモ付きに修正 → setOrder は 2 のまま
③ 2セット目を削除 → [(1,60),(2,70)] に詰まる
④ セッション削除 → 再取得 404、一覧も空。セットも消えている
```

## 19. 実装ログ: 1-f（種目ごとの記録）—— 完了 2026-09-20 / **MVP 達成**

### API

```
GET /api/exercises/:id/history   → { exercise, sessions: [{ workoutId, performedOn, sets }] }
```

**2段構えのクエリにした。**

1. まず「この種目をやったセッション」を `groupBy` + `limit 30` で絞る
2. その workoutId 群に対してセットを取り、JS でまとめる

1クエリで取って JS で切る方式だと**件数制限がかけられない**（セット単位で LIMIT しても
セッション単位の件数が決まらない）ため。`getLastSets` と同じ形。

### 画面

```
/exercises/$exerciseId    種目ごとの記録
```

```
ベンチプレス
Push · 胸

2026-09-20   ← セッション詳細へのリンク
  1. 62.5kg × 10
  2. 67.5kg × 8  最後きつい
2026-09-13
  ...
```

### ナビゲーションの整備

画面間が相互に行き来できるようになった。

```
ヘッダ:  [記録] [種目]
/                      → セッション一覧 ─┬→ /workouts/$id
/workouts/$id          → 種目名をクリック ─→ /exercises/$id
/exercises             → 種目名をクリック ─→ /exercises/$id
/exercises/$id         → 日付をクリック  ─→ /workouts/$id
```

**セッション詳細の種目名をリンクにした**のが効いている。
「今ベンチをやっていて、前回より上げられるか」を見たいとき、
その場から履歴に飛べる。

### MVP の達成状況（15章の要件）

| # | 機能 | |
|---|---|---|
| 1 | 記録 = 重量・回数・メモ（セット単位） | ✅ 1-d |
| 2 | その種目の前回の記録を見る | ✅ 1-c |
| 3 | 日付ごとの記録を見る | ✅ 1-e |
| 4 | 種目ごとの記録を見る | ✅ 1-f |
| 5 | 種目を自分で追加・編集・削除 | ✅ 1-d |
| 6 | 種目に部位を設定（2軸） | ✅ 1-d |
| 7 | セットの修正・削除 | ✅ 1-e |
| 8 | セッションの削除 | ✅ 1-e |

**MVP はすべて実装済み。**

### テスト

API 40本（+4）／フロント 29本（+5）。**合計69本。**

### 動作確認（3週分の PPL データを入れて）

```
① ベンチプレスの履歴 → 09-20 / 09-13 / 09-06 の順、メモつき、スクワットは混ざらない
② スクワットの履歴   → 同じ3セッション、ベンチは混ざらない
③ 記録のない種目     → sessions: []
④ 存在しない種目     → 404
```

ローカル DB には**3週分の PPL データが入った状態**になっている（`pnpm db:reset:local` で初期化可）。

