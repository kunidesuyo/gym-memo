/**
 * Cloudflare の「アカウント」側を管理する。
 *
 * ⚠️ Worker / D1 / アセット / DNS レコードはここに書かない。それらは Wrangler の担当。
 *    境界線の根拠は docs/design-notes.md 5章。
 *
 * ここで作るのは2つだけ:
 *   1. Access ポリシー    「誰を通すか」
 *   2. Access アプリ      「どのホスト名を守るか」＋ 1 の紐付け
 *
 * ⚠️ Zero Trust 組織（<team>.cloudflareaccess.com）は**意図的にここで管理しない**。
 *    ダッシュボードで作る。理由:
 *      - アカウントに1つだけの一度きりのセットアップで、設定差分が意味を持たない
 *      - terraform destroy で消せない（API 側に残る）
 *      - **terraform import に対応していない**ため、state を失うと管理下に戻せない
 *    復旧手段の無いリソースを state に入れるのは、IaC の利点を失ってリスクだけ負う。
 *    アカウント作成・ドメイン購入と同じ「手動の前提条件」に分類する。
 */

terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 で OpenAPI からの自動生成に作り直され、v4 とは記法が別物になっている。
      # ネットの v4 時代の記事（policy をアプリ内のブロックで書くやつ）は動かない。
      version = "~> 5.25"
    }
  }

  # フェーズ2 はローカル state。ひとりなので競合しない。
  # R2 backend への移行はフェーズ3（最初にやると本筋を見失う）。
}

provider "cloudflare" {
  # api_token は環境変数 CLOUDFLARE_API_TOKEN から読む。
  # ⚠️ ここに書いたり tfvars に置いたりしないこと。terraform.tfstate は平文 JSON で、
  #    渡した変数の値がそのまま残る。
}

/**
 * ゾーンは**ドメイン購入時に既に存在している**。
 *
 * ⚠️ resource ではなく data で読むこと。resource にすると Terraform が
 *    「自分が作ったもの」として扱い、destroy でゾーンごと消しにいく。
 */
data "cloudflare_zone" "main" {
  filter = {
    name = var.zone_name
  }
}

/**
 * 「誰を通すか」。アカウント単位のリソースで、アプリとは独立して存在する
 * （複数のアプリから使い回せる）。
 *
 * include は OR。1つでも満たせば通る。ここでは自分のメールアドレス1件だけ。
 * それ以外は暗黙に拒否される（Access は allow に当たらなければ通さない）。
 */
resource "cloudflare_zero_trust_access_policy" "owner_only" {
  account_id = var.account_id
  name       = "owner only"
  decision   = "allow"

  include = [
    {
      email = {
        email = var.allowed_email
      }
    }
  ]

  session_duration = "720h"
}

/**
 * 「どのホスト名を守るか」。
 *
 * ⚠️ このアプリの実体（Worker）はまだこのホスト名に繋がっていない。
 *    Access を**先に**張り、DNS を後から繋ぐ。逆順にすると、ホスト名が生えてから
 *    保護が効くまでの間、誰でも D1 を読み書きできる窓が開く。
 *
 * allowed_idps は指定しない = アカウントに設定済みの IdP を全部使う。
 * 今は何も設定していないので One-time PIN（メールに届く6桁コード）になる。
 */
resource "cloudflare_zero_trust_access_application" "gym_memo" {
  account_id = var.account_id
  name       = "gym-memo"
  type       = "self_hosted"

  # ゾーン名は data から取る。ゾーンが無ければここで落ちるので、
  # 存在しないホスト名に対して Access を張る事故が起きない。
  domain = "${var.app_subdomain}.${data.cloudflare_zone.main.name}"

  policies = [
    {
      id = cloudflare_zero_trust_access_policy.owner_only.id
      # ⚠️ 1 以上。公式ドキュメントの例は 0 だが通らない（provider v5 の
      #    自動生成でドキュメントとスキーマがずれている箇所）。
      precedence = 1
    }
  ]

  # 自分しか使わないのでアプリ一覧に出す必要がない。
  app_launcher_visible = false

  # ポリシー側の session_duration が優先されるので実質これは効かないが、
  # 既定の 24h のままだと「30日と書いたのに 24h と出る」plan になって紛らわしい。
  session_duration = "720h"

  # 盗まれたトークンの再利用と CSRF に対する上乗せ。自分専用なので副作用がない。
  enable_binding_cookie      = true
  http_only_cookie_attribute = true
}

output "auth_domain" {
  # Terraform の管理対象ではない（ダッシュボードで作る前提条件）。
  # ログイン画面の URL を思い出せるように組み立てているだけ。
  description = "ログイン画面のホスト。Terraform では管理していない"
  value       = "${var.team_name}.cloudflareaccess.com"
}

output "protected_hostname" {
  description = "Access が守るホスト名。ステップ5でここに Worker を繋ぐ"
  value       = cloudflare_zero_trust_access_application.gym_memo.domain
}

output "zone_id" {
  description = "kuni-app.dev のゾーン ID"
  value       = data.cloudflare_zone.main.zone_id
}
