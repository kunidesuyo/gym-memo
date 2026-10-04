# migration —— スプレッドシートからの一度きりの移行

⚠️ **もう実行しない。** 2024-09-30 〜 2026-09-20 の2年分（セット 4,190件 /
セッション 267件 / 種目 51件）を Google スプレッドシートから D1 に移すために
書いたもので、移行は完了している。`src/` の現役コードとは独立している。

経緯は `docs/design-notes/25-spreadsheet-migration.md` と `28-main-sets.md`。

```
import-spreadsheet.ts   CSV → INSERT 文を生成するエントリ
parse-cell.ts           セル内の数値表記（`60×10×3`、`-18×10` など）を解釈する
classify.ts             セル内表記を「種目 / note / 無視」に分類する規則 + 個別修正
main-sets.ts            メインセット（本番セット）の判定
main-set-overrides.ts   ユーザーと1件ずつ確認して確定させた手動指定 22件
```

## なぜ残しているか

**テストに価値がある。**`parse-cell.test.ts`（15本）と `main-sets.test.ts`（11本）は
「2年分の記録をどう読んだか」という**取り決めそのもの**を固定している。

⚠️ 特に `parse-cell` は、**読めないトークンを例外も出さずに読み飛ばす**という
一番こわい壊れ方をした（セットが丸ごと消えても件数以外に痕跡が残らない）。
再移行することがあるなら、このテストが唯一の防具になる。

## 実行する場合

```bash
node --experimental-strip-types apps/api/migration/import-spreadsheet.ts <csv> [out.sql]
```

⚠️ **相対 import には `.ts` を付けること。** `--experimental-strip-types` で
直接実行するため。tsc 側は `allowImportingTsExtensions` で通している。
