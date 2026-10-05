# 設計メモ

自分専用の筋トレ記録アプリ。**技術学習が主目的**。

設計判断の経緯・検討した代案・踏んだ落とし穴はここに全部ある。
「なぜこうなっているのか」はまずここを見る。

⚠️ **章番号がそのまま住所。** リポジトリ中に「N章」という参照が 80 箇所以上あるので、
**番号を振り直さないこと**。`NN-` で始まるファイルを探せば該当章に行き当たる。
章を足すときは末尾に新しい番号で足す。

## よく引かれるもの

| | |
|---|---|
| なぜ Wrangler 中心で Terraform は Access だけなのか | [5章](05-terraform-scope.md) / [29章](29-phase2-deploy.md) |
| 本番への反映手順 | **`.claude/skills/deploy/`**（[30章](30-deploy-runbook-moved.md)から移した） |
| 重量をグラムで持つ理由と `Math.round` の罠 | [26章](26-weight-in-grams.md) |
| メインセットの判定規則（懸垂の例外） | [28章](28-main-sets.md) |
| 種目の並び / `display_order` に UNIQUE を張らない理由 | [31章](31-exercise-display-order.md) |
| フロントの feature 構成と依存の向き | [32章](32-feature-folders.md) |
| テストをどのファイルに書くか | [34章](34-api-structure.md) |
| loader と Query のキャッシュの役割分担 | [35章](35-loader-and-query-cache.md) |
| 規約をどこに書くか | [33章](33-convention-placement.md) |
| バックログ（画像/R2、グラフ、PR、オフライン） | [15章](15-requirements-mvp.md) |

## 計画と論点（2026-09-20）

- [3. 論点1: 構成](03-structure.md) — 案C（コードは分離 / デプロイは Worker 1つ）。型は Hono RPC で貫通
- [4. 技術スタック](04-tech-stack.md) — Drizzle を採用し Kysely を却下した経緯を含む
- [5. 論点2: Terraform の守備範囲](05-terraform-scope.md) — **Terraform はアカウント、Wrangler はアプリケーション**。「D1 も Terraform」を撤回した
- [6. 論点3: 自分だけが使う](06-self-only-access.md) — ドメインを買う / Cloudflare Access。`.dev` を選んだ理由（HSTS プリロード）
- [11. テスト戦略](11-test-strategy.md) — 「フェーズ1では入れない」を撤回。ストレージ分離はテストファイル単位
- [1. 目的](01-purpose.md) / [2. 決まっていること](02-givens.md) / [8. 進め方](08-approach.md) / [10. 決定ログ](10-decision-log.md) — 計画当時の記録

⚠️ [7. データモデル（たたき台）](07-data-model-draft.md) と
[9. 次に決めること](09-open-questions.md) は**当時のまま**で、現状と食い違う。
現在のスキーマは `apps/api/src/db/schema.ts` を見ること。

## 設計判断

- [15. 要件と仕様（MVP）](15-requirements-mvp.md) — MVP の線引きと**バックログ**
- [17. ID の方式](17-id-uuidv7.md) — UUIDv7。`id` をソートのタイブレーカーに使う
- [20. UI ライブラリ](20-ui-library-shadcn.md) — shadcn/ui（Base UI 版）。ネイティブ `<select>` を使う判断
- [24. `field` / `native-select` の導入](24-field-native-select.md)
- [26. 重量をグラム整数で持つ](26-weight-in-grams.md) — ⚠️ `toG` の `Math.round` は必須
- [27. ホームをカレンダーに / 1日1セッション](27-calendar-one-session.md)
- [31. 種目の並びを手動指定にする](31-exercise-display-order.md) — ⚠️ UNIQUE を張らない / 既定 999
- [32. フロントを feature 単位に切る](32-feature-folders.md) — ⚠️ 依存は workouts → exercises の一方向
- [33. 規約の置き場所を分ける](33-convention-placement.md) — lint / スキル / コメント / design-notes の分担
- [34. api の整理](34-api-structure.md) — クエリのドメイン分割、テストの同居、移行コードの隔離
- [35. loader と Query のキャッシュ](35-loader-and-query-cache.md) — 役割分担、Router のキャッシュは何をするか（実測）

## フェーズ1 の実装ログ

- [12. 1-a 骨組みと疎通](12-log-1a-skeleton.md)
- [13. 1-b D1 + Drizzle](13-log-1b-d1-drizzle.md)
- [14. 1-c ドメイン実装](14-log-1c-domain.md)
- [16. 1-d スキーマ拡張 + 種目 CRUD](16-log-1d-schema-crud.md)
- [18. 1-e 修正・削除とセッション詳細](18-log-1e-edit-delete.md)
- [19. 1-f 種目ごとの記録](19-log-1f-exercise-history.md) — **MVP 達成**

## 作業ログ

- [21. 種目画面のブラッシュアップ](21-exercise-screen-polish.md)
- [22. 公式 Agent Skills の導入](22-agent-skills.md)
- [23. 公式スキルによるレビューと修正](23-skill-review.md)
- [25. スプレッドシートからの移行](25-spreadsheet-migration.md) — 2年分・4,000件超のデータ移行
- [28. メインセット / 移行データの誤読3件](28-main-sets.md) — ⚠️ パーサが黙ってセットを捨てていた

## フェーズ2: デプロイ

- [29. Cloudflare へのデプロイ](29-phase2-deploy.md) — 構成、順序、踏んだもの、Terraform に入れない判断
- [30. 運用手順書](30-deploy-runbook-moved.md) — **`.claude/skills/deploy/` に移した**
