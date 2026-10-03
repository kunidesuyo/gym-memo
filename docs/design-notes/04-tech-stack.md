# 4. 技術スタック —— 【確定 2026-09-20】

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
