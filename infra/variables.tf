/**
 * 値は terraform.tfvars に置く（.gitignore 済み）。
 * ⚠️ API トークンは変数にしないこと。tfstate に平文で残る。
 *    provider が環境変数 CLOUDFLARE_API_TOKEN から直接読む。
 */

variable "account_id" {
  description = "Cloudflare のアカウント ID（wrangler whoami で出る）"
  type        = string
}

variable "zone_name" {
  description = "購入したドメイン。ゾーンは購入時に自動作成済み"
  type        = string
  default     = "kuni-app.dev"
}

variable "app_subdomain" {
  description = "アプリを載せるサブドメイン。zone_name と連結してホスト名になる"
  type        = string
  default     = "gym-memo"
}

variable "team_name" {
  description = <<-EOT
    Zero Trust のチーム名。<team_name>.cloudflareaccess.com がログイン画面になる。
    ⚠️ **ダッシュボードで作った組織の名前をここに書き写すだけ**。Terraform は
       組織を作らない（import 非対応で復旧手段が無いため。main.tf 冒頭を参照）。
       出力の組み立てにしか使わないので、ずれていても apply は通ってしまう。
  EOT
  type        = string
  default     = "kuni-app"
}

variable "allowed_email" {
  description = "Access を通す唯一のメールアドレス"
  type        = string
}
