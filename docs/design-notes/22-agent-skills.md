# 22. 公式 Agent Skills の導入 —— 2026-09-21

### 方針: 公式のみ。野良は入れない

技術スタックごとに調査した結果、**公式 Skills が存在したのは5件**だった。

| 技術 | 提供元 | 配布 | 導入方法 |
|---|---|---|---|
| Cloudflare | Cloudflare | [cloudflare/skills](https://github.com/cloudflare/skills) | プラグイン（project スコープ） |
| Hono | Hono | [honojs/skills](https://github.com/honojs/skills) | プラグイン（project スコープ） |
| Terraform | HashiCorp | [hashicorp/agent-skills](https://github.com/hashicorp/agent-skills) | プラグイン（project スコープ） |
| shadcn/ui | shadcn | shadcn-ui/ui の `/skills/` | `gh skill install shadcn/ui --all --agent claude-code --scope project` |
| TanStack Router | TanStack | **npm パッケージに同梱** | TanStack Intent（**未完了**・後述） |

**公式が存在しなかったもの**: TanStack Query / Form（Router のみ同梱）、Drizzle ORM、Zod、
Vite、Vitest、Biome、MSW、Tailwind CSS、Base UI / MUI、pnpm、TypeScript。

### ⚠️ 紛らわしい罠

**`tanstack-skills/tanstack-skills`** は組織名が公式っぽいが、
リポジトリ自身が **"UNOFFICIAL Claude Code TanStack Skills"** と明記している。検索上位に出るので注意。

Drizzle / Tailwind / MUI で出てくるものも、確認した限りすべて個人・第三者アカウントだった。

### プロジェクトスコープで入れた理由

`--scope project` を付けると `.claude/settings.json` に書かれ、リポジトリで共有される。

```bash
claude plugin install cloudflare@cloudflare --scope project
```

ただし**マーケットプレイスの登録はユーザー設定に入る**ため、それだけでは clone した人に伝わらない。
`.claude/settings.json` に `extraKnownMarketplaces` を明記して、リポジトリだけで完結するようにした。

```json
{
  "extraKnownMarketplaces": {
    "cloudflare": { "source": { "source": "github", "repo": "cloudflare/skills" } },
    "hono":       { "source": { "source": "github", "repo": "honojs/skills" } },
    "hashicorp":  { "source": { "source": "github", "repo": "hashicorp/agent-skills" } }
  },
  "enabledPlugins": { ... }
}
```

### shadcn は配布経路が別 —— 最終的に `gh skill` に統一

入ったのは2つ:
- `shadcn` — CLI、レジストリ、テーマ、base ライブラリ（base/radix/aria）の選択
- **`migrate-radix-to-base`** — Radix → Base UI 移行。20章で Base UI を選んだ構成に直結する

**当初は shadcn 公式が案内する `pnpm dlx skills add shadcn/ui`**（vercel-labs/skills）で入れた。
これは `.agents/skills/` に実体を置き `.claude/skills/` からシンボリックリンクを張る方式で、
Codex / Cursor など他エージェントとの共用を前提にしたレイアウト。

**しかし AGENTS.md を廃止して Claude Code 一本に寄せた（上記）ので、方針がちぐはぐになった。**
他エージェント共用を捨てたのに、共用前提の `.agents/` を残しているのは一貫しない。

→ **`gh skill` に切り替えた。**

```bash
gh skill install shadcn/ui --all --agent claude-code --scope project
```

両者を実際に入れて比較したところ、**ファイル構成（25ファイル）と本文は完全に同一**。
差は `SKILL.md` の frontmatter だけだった。

| | skills CLI | **gh skill（採用）** |
|---|---|---|
| 配置 | `.agents/skills/` + シンボリックリンク | **`.claude/skills/` に実体のみ** |
| 他エージェント共用 | ⭕️ | ❌（`--agent` ごとに複製） |
| 出所の記録 | `skills-lock.json`（ハッシュのみ） | **SKILL.md の frontmatter に埋め込み** |
| バージョン固定 | ❌ | **`--pin`** |
| 事前確認 | ❌ | **`gh skill preview`** |
| Windows のリンク問題 | あり | **無い** |

出所メタデータは frontmatter に入るので、**ファイルがどこにコピーされても追跡できる**。

```yaml
metadata:
    github-repo: https://github.com/shadcn/ui
    github-ref: refs/tags/shadcn@4.21.0      # リリースタグが分かる
    github-tree-sha: b5791523e07794a4deb201e78eab3f3adbd022c0
    github-path: skills/shadcn
```

インストール時に **「Skills may contain prompt injections or malicious scripts」** の警告と、
SHA 付きの検証コマンドが表示されるのも良い。

⚠️ **2つのツールを混ぜないこと。** frontmatter のキー順とメタデータの有無が違うため、
`skills update` と `gh skill update` を両方回すと書き換え合戦になる。

更新は `gh skill update --all`。

### TanStack Intent（完了。ただし落とし穴あり）

仕組みが他と違う。**スキルを project にコピーせず、`CLAUDE.md` に
「node_modules のスキルを必要に応じて読め」という案内を書く**方式。

```bash
npx @tanstack/intent@latest install --review
```

⚠️ **初回は対話的な権限確認が必須**で、非対話では
`intent.skills is not configured` で失敗する。
Claude Code の `!` 経由でも TTY が無いため失敗した。**素のターミナルで実行する必要がある。**

実行結果:
- `package.json` に `"intent": { "skills": ["*"] }` が入った（**ワイルドカード = 全ソース許可**。
  今後スキルを同梱するパッケージが増えたら自動で許可される点に注意）
- **`AGENTS.md`** が生成され、`<!-- intent-skills:start -->` ブロックに
  「作業前に `intent list` で探し、該当すれば `intent load` してから編集せよ」という案内が入った

### ⚠️ AGENTS.md は そのままでは読まれない

Claude Code の既定は `claude-md-or-agents-md`:

| リポジトリの状態 | Claude が読むもの |
|---|---|
| AGENTS.md のみ | AGENTS.md |
| **AGENTS.md と CLAUDE.md の両方** | **CLAUDE.md だけ** |
| CLAUDE.md が AGENTS.md を import | 両方 |

**このプロジェクトは CLAUDE.md を作った直後だったので、AGENTS.md が無視される状態だった。**

→ 最終的に **AGENTS.md を廃止し、`intent-skills` ブロックを CLAUDE.md に直接置いた**。

当初は `CLAUDE.md` 先頭に `@AGENTS.md` のインポートを置いて解決したが、
指示ファイルが2つに分かれるのが分かりにくいため1つに寄せた。

Intent は AGENTS.md / CLAUDE.md / .cursorrules / copilot-instructions.md を
**サポート対象の設定ファイル**として扱い、「既にブロックがあるファイルを更新する」
仕様なので、CLAUDE.md に移しても再実行で AGENTS.md が復活しない。
`install --dry-run` で `Generated skill loading guidance for CLAUDE.md.` と出ることを確認済み。

⚠️ トレードオフ: AGENTS.md は Codex / Cursor など**他エージェントとの共有ファイル**でもある。
今後それらを併用するなら AGENTS.md を復活させて `@AGENTS.md` インポートに戻すほうがよい。

⚠️ 当時 `.agents/` ディレクトリがあったが、`AGENTS.md` とは無関係だった
（前者は shadcn スキルの実体置き場）。その後 `gh skill` に切り替えて `.agents/` は廃止した。

動作確認:

```
$ pnpm dlx @tanstack/intent@latest load @tanstack/router-core#router-core/search-params
name: search-params
description: validateSearch, search param validation with Zod/Valibot/ArkType adapters, ...
metadata: { library: tanstack-router, library_version: '1.171.15' }
sources: TanStack/router:docs/router/guide/search-params.md ...
```

公式ドキュメント由来で、**インストール済みバージョンに紐づいた**内容が返る。

`list` で確認できた提供範囲（このリポジトリのインストール済みバージョン時点）:

```
@tanstack/router-plugin   router-plugin
@tanstack/router-core     router-core
    auth-and-guards / code-splitting / data-loading / navigation
    not-found-and-errors / path-params / search-params / ssr / type-safety
@tanstack/virtual-file-routes
```

`search-params` はバックログ7番（Router の search params 活用）に直結する。
**Query と Form は未提供**（`package.json` に `intent` フィールドが無い）。

### CLAUDE.md を追加した

毎セッション読まれるので、**破ると壊れる規約**と**意図的にそうしている箇所**に絞った。
経緯の説明はこのドキュメント（design-notes）に任せ、CLAUDE.md からは参照するだけにしてある。
