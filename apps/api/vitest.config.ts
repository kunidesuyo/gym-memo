import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

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
    }),
  ],
})
