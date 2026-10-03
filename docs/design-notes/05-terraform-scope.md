# 5. 論点2: Terraform の守備範囲 —— 【決定済み 2026-09-20】Wrangler 中心 + Terraform は Access

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
