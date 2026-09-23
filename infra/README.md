# infra —— Cloudflare「アカウント」側の管理

> **Terraform はアカウントを管理する。Wrangler はアプリケーションを管理する。**
> 境界線の根拠は `docs/design-notes.md` 5章、デプロイの実録は 29章。

## ここで管理しているもの

| リソース | 中身 |
|---|---|
| `cloudflare_zero_trust_access_policy.owner_only` | 誰を通すか。メールアドレス1件のみ `allow` / 30日 |
| `cloudflare_zero_trust_access_application.gym_memo` | どのホスト名を守るか。`gym-memo.kuni-app.dev` |
| `data.cloudflare_zone.main` | 既存ゾーンを**読むだけ**（作らない・消さない） |

> **判断基準: ここは「このアプリに属するもの」だけを管理する。**
> ドメインやアカウントに属するものは手動の前提条件に置く。

## ここで管理していないもの（意図的）

- **Worker / アセット / D1 / DNS レコード** → Wrangler（`wrangler.jsonc`）
- **アプリのシークレット** → `wrangler secret put`。`terraform.tfstate` は平文 JSON
- **IdP** → Zero Trust のオンボーディングが自動登録する（`type = cloudflare`）

### 手動で設定してある前提条件

⚠️ **作り直すときはこの値を再現すること。**どちらも一度 Terraform で書いてから外した
（経緯は `docs/design-notes.md` 29章）。

**Zero Trust 組織** — ダッシュボード（https://one.dash.cloudflare.com）

| 項目 | 値 |
|---|---|
| Team domain | `kuni-app.cloudflareaccess.com` |

`terraform destroy` で消せず、**`terraform import` にも対応していない**。
state を失うと管理下に戻す手段が無いため、state に入れない。

**ゾーンの TLS 設定** — ダッシュボード → `kuni-app.dev` → SSL/TLS → Edge Certificates

| 項目 | 値 | 既定値 |
|---|---|---|
| Minimum TLS Version | **TLS 1.2** | 1.0（TLS 1.0/1.1 は非推奨） |
| Always Use HTTPS | **On** | Off |

効く範囲は `kuni-app.dev` **全体**で、gym-memo とは無関係。ここに置くと2つ目の
アプリを作ったとき、2つの state が同じリソースを取り合う。

なお `.dev` は TLD 全体が HSTS プリロード済みなので、ブラウザ相手には
どちらもほぼ無意味（効くのは非ブラウザのクライアント）。衛生上の設定。

## 使い方

トークンは macOS キーチェーンにある。**`terraform.tfvars` にも `tfstate` にも入れない。**

```bash
cd infra

# 差分を見る
CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-terraform -w)" terraform plan

# 適用する（plan を保存してから適用するのが安全）
CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-terraform -w)" terraform plan -out=tfplan
CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-terraform -w)" terraform apply tfplan

# API を叩かずに構文と型を検査する（plan の前に通すと速い）
terraform validate
```

初回のみ `terraform init`。`terraform.tfvars` は `terraform.tfvars.example` からコピーする。

### トークンを作り直すとき

ダッシュボード → My Profile → API Tokens → Create Custom Token。

| 種別 | 項目 | 権限 |
|---|---|---|
| Account | Access: Apps and Policies | Edit |
| Account | Access: Organizations, Identity Providers, and Groups | Edit |
| Zone | Zone Settings | Edit |
| Zone | DNS | Edit |

Global API Key は使わない。キーチェーンへの格納は:

```bash
security add-generic-password -U -a "$USER" -s cloudflare-terraform -w
```

## 守るべきこと

**ダッシュボードで Access とゾーン設定を編集しない。**
Terraform 管理下なので、次の `plan` が差分を出し `apply` で戻される。
変更はコードを直して `apply` する。

**`tfplan` をコミットしない。** バイナリだが `terraform.tfvars` の値を含む（gitignore 済み）。

**`terraform apply` の前に必ず `plan` を読む。** 特に `destroy` を含む計画は中身を確認する。

## 順序の制約（作り直すとき）

```
1. D1 作成 → マイグレーション → データ投入
2. wrangler run deploy          ← ルート無し。到達経路ゼロの安全な状態
3. terraform apply              ← Access を張る
4. wrangler.jsonc に routes を足して再デプロイ
```

⚠️ **3と4を逆にしない。** ホスト名が生えてから Access が効くまでの間、
無認証で公開される窓が開く。

## state

フェーズ2 はローカル state（ひとりなので競合しない）。
R2 backend への移行はフェーズ3。

`terraform.tfstate` は **平文 JSON**。トークンは入っていない（環境変数で渡しており
変数にしていない）が、`allowed_email` などの変数の値はそのまま残る。gitignore 済み。
