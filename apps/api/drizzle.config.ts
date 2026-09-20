import { defineConfig } from 'drizzle-kit'

/**
 * スキーマ(TS)から差分を計算してマイグレーション SQL を生成する。
 * 適用は drizzle-kit ではなく wrangler が行う（論点2で決めた分担）:
 *   pnpm db:generate       → SQL を生成
 *   pnpm db:migrate:local  → wrangler がローカル D1 に適用
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
})
