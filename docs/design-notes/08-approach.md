# 8. 進め方

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
