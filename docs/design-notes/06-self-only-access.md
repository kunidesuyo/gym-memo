# 6. 論点3: 「自分だけが使う」をどう実現するか —— 【一部決定 2026-09-20】

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
