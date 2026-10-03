# 30. 運用手順書: 改修を本番に反映する（2026-09-23 / 2026-10-03 にスキル化）

⚠️ **内容は `.claude/skills/deploy/SKILL.md` に移した。** 手順書は「デプロイするとき
だけ読みたい」ものなので、毎セッション読まれる CLAUDE.md や、通しで読む
design-notes ではなく**スキル**が正しい置き場所だった（33章）。

扱っているのは4ケース（危険度が違う）:

| ケース | 手順 | 巻き戻し |
|---|---|---|
| 1. 機能変更のみ | `pnpm run deploy` | ✅ `wrangler rollback` |
| 2. スキーマ変更 | `db:migrate:remote` → `deploy` | ⚠️ 手動で逆マイグレーション |
| 3. + データ変換 | export → `migrate:remote` → 検証 → `deploy` | ⚠️ Time Travel（30日以内） |
| 4. + R2 など新リソース | bucket 作成 → `pnpm types` → 上記 | ⚠️ 同上 |
