import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// マイグレーションは Node 側（ここ）で読み、バインディング経由でテストに渡す。
// workerd の中では fs が使えないため。
const migrations = await readD1Migrations('./migrations')

/**
 * テストは Node ではなく workerd（本番と同じランタイム）の中で走る。
 * バインディング定義は wrangler.jsonc を直接読むので、
 * 開発・本番・テストで設定が1か所に集約される。
 *
 * v0.22 で `defineWorkersConfig` は廃止され、
 * Vite プラグイン `cloudflareTest()` に置き換わった。
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: '../../wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
})
