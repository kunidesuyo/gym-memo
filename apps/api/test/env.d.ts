import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare global {
  namespace Cloudflare {
    interface Env {
      /** vitest.config.ts から注入されるマイグレーション一覧。 */
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
