# 29. フェーズ2: Cloudflare へのデプロイ —— 完了 2026-09-23

MVP を本番に載せ、Cloudflare Access で自分だけがアクセスできる状態にした。
**`https://gym-memo.kuni-app.dev` が稼働中。**

### 最終的な構成

```
ブラウザ
  │  ① TLS（min_tls_version 1.2 / http は 301 で https へ）   ← 手動
  ▼
Cloudflare エッジ
  │  ② Access の検問（kunidesuyo1234@gmail.com のみ / 30日）    ← Terraform
  ▼
Worker gym-memo                                              ← Wrangler
  ├─ /api/*  → Hono → Drizzle → D1 gym-memo (APAC)            ← Wrangler
  └─ その他  → SPA アセット（19ファイル / gzip 175 KiB）
```

| 対象 | 担当 | 実体 |
|---|---|---|
| Access アプリ + ポリシー | Terraform | `infra/main.tf` |
| Worker / アセット / D1 / DNS | Wrangler | `wrangler.jsonc` |
| Zero Trust 組織 / IdP / ゾーンの TLS 設定 | **手動** | ダッシュボード（後述） |

5章で引いた境界線がそのまま形になった。HCL は 90 行ほどしかない。

### やった順序（この順序自体が安全装置）

1. アカウント作成 / `wrangler login` / ドメイン取得 / API トークン発行 —— 手動
2. `wrangler d1 create` → `database_id` 差し替え → マイグレーション → 実データ投入
3. `wrangler deploy` —— **この時点でルートが1本も無い**（`No targets deployed`）
4. `terraform apply` —— Access を張る
5. `wrangler.jsonc` に `routes` を足して再デプロイ —— ホスト名が生えた瞬間から保護済み

⚠️ **4と5を逆にしてはいけない。** ホスト名が生えてから Access が効くまでの間、
誰でも 4,190 件の記録を読み書きできる窓が開く。
3の「デプロイ済みだが到達経路が無い」状態を経由するのが肝。

### 踏んだもの

#### `database_id` を変えるとローカル D1 が見えなくなる

`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` の **hash は
`database_id` から導出されている**。`local-placeholder` を本物の ID に差し替えた瞬間、
別ファイルを見にいって `no such table: sets` になった。

データは消えていない（旧 hash のファイルが残る）。`tmp/import.sql` から入れ直して復旧。
**旧ファイルは孤児として残るので、容量が気になるなら消してよい。**

#### `pnpm deploy` は動かない

**pnpm の組み込みコマンドと名前が衝突**していて `package.json` の script が呼ばれない。

```
ERR_PNPM_NOTHING_TO_DEPLOY  No project was selected for deployment
```

`pnpm run deploy` と書くこと。`deploy:dry` は組み込みに無いので素通りする、という
非対称さが余計に紛らわしい。

#### Cloudflare provider v5 のドキュメントとスキーマのずれ

公式ドキュメントの例が `policies = [{ id = ..., precedence = 0 }]` だが、
**0 では通らない**（`terraform validate` が「1 以上」と教えてくれた）。
5章で警戒していた「provider の問題か理解不足かを切り分ける」の実例。
`validate` は API を叩かずに落としてくれるので、`plan` の前に必ず通す。

#### One-time PIN ではなく「Login with Cloudflare」になった

IdP を設定していないので OTP（メールに6桁）になると予想したが、
Zero Trust のオンボーディングが **`type = cloudflare` の IdP を自動登録**していた。
IdP が1つなので選択画面も出ず直接そこへ飛ぶ。

結果的に良かった: Cloudflare アカウントは Google アカウントで作ってあるので、
**OAuth クライアントを自作せずに「Google でログイン」相当が手に入った**
（20章の論点で「手間が本筋から外れる」として見送った選択肢）。

⚠️ Cloudflare アカウント（＝紐づく Google アカウント）が、インフラの管理権限と
アプリへのアクセス権の**両方の鍵**になった。

### Terraform に入れないと決めたもの（2つ）

#### Zero Trust 組織

当初は `cloudflare_zero_trust_organization` を `infra/main.tf` に書いていたが、
**`apply` する前に撤回した。**

| | destroy | import | |
|---|---|---|---|
| Zero Trust 組織 | ❌ | ❌ | **復旧手段が両方無い** |
| Access ポリシー / アプリ | ✅ | ✅ | |
| ゾーン設定 | ❌※ | ✅ | ※削除の概念が無いだけ。state から外れても値は残る |

組織は `terraform destroy` で消せず、**`terraform import` にも対応していない**。
state を失うと管理下に戻す手段が無い。復旧手段の無いリソースを state に入れるのは、
IaC の利点（壊してもコードから再現できる）を失った上でリスクだけ負う形になる。

加えて、アカウントに1つだけの一度きりのセットアップで設定差分が意味を持たない。
**アカウント作成やドメイン購入と同じ「手動の前提条件」に分類するのが筋**だった。

唯一の実質的な設定だった `session_duration` も、アプリとポリシー側の値に
上書きされるため実効値に影響しない（3箇所に書けて、細かいほうが優先される）。

#### ゾーンの TLS 設定

`cloudflare_zone_setting` で `min_tls_version` = 1.2、`always_use_https` = on を
**一度 apply してから外した**。理由は組織とは別で、**スコープのずれ**。

```
infra/ が置かれている場所 = gym-memo アプリのリポジトリ
zone settings が効く範囲   = kuni-app.dev 全体（将来の全アプリ）
```

Access のポリシーとアプリは `gym-memo.kuni-app.dev` を名指しした**アプリ固有の設定**
なのでここにあるのが自然だが、ゾーン設定は gym-memo と何の関係も無い。
2つ目のアプリ（`blog.kuni-app.dev` など）を別リポジトリで作ってそこでも
TLS を宣言したくなったら、**2つの state が同じリソースを取り合う**。
5章で「Terraform と Wrangler を重ねると起きる」と書いた二重管理の摩擦が、
Terraform 同士で再発する形になる。

外すコストはゼロだった。`terraform state rm` しても **Cloudflare 側の値は
1.2 / on のまま変わらない**（ゾーン設定には削除という概念が無く、常に値を持つ）。
本番の挙動は無変化、失うのは「宣言として残る」性質だけ。

ゾーン用に別の Terraform ルートを切る案も検討したが、設定2個のために state を
もう1つ増やすのは割に合わないので却下。WAF ルールなどでドメイン設定が実体を
持ってきたら、そのとき切ればいい。

⚠️ 手動にした設定の値は **`infra/README.md` に記録してある**。作り直すとき必要になる。

### 判断基準が1文になった

> **`infra/` は「このアプリに属するもの」を管理する。
> ドメインやアカウントに属するものは手動の前提条件。**

最初は組織だけを外していたため基準が2つ混在しており、それが
「ドメイン全体の設定を Terraform でやるのは違和感がある」という指摘に繋がった。
ゾーン設定も外したことで、判断が1本の線で説明できるようになった。

> 5章に書いた「不自然に消耗したら手動設定に切り替える判断も持っておく」の実践。
> どこまでを Terraform に入れるかを自分で判断したという意味で、これが今回一番の収穫。
> **HCL は 90 行ほどしか残っていないが、それが正しい量。**

### ドメインについて

- **Cloudflare Registrar / `kuni-app.dev` / 年 $12.20**（原価販売、更新料も同額）
- `.dev` を選んだのは **TLD 全体が HSTS プリロード済み**だから。`http://` が
  物理的に存在せず、SSL ストリッピングの隙が最初から無い
- 購入と同時にゾーン作成と NS 設定まで完了する。WHOIS は既定で秘匿される
  （ただし Cloudflare は実データを保持し、ICANN の手続きがあれば開示される）
- **サブドメインは無制限・無料**。ゾーンを持つとはそういうこと

### 残っているもの

- **state はローカル**。R2 backend（`backend "s3"`）への移行はフェーズ3。
  `skip_*` フラグが複数必要で、最初にやると本筋を見失う
- `terraform.tfstate` は平文 JSON。トークンが入っていないことは確認済み
  （`CLOUDFLARE_API_TOKEN` 環境変数で渡し、変数にしていない）
- トークンは macOS キーチェーンに格納:
  `CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-terraform -w)" terraform plan`
