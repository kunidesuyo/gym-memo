import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// 本番と同じマイグレーションをテスト用 D1 に流す。
// applyD1Migrations は cloudflare:test にしか無いが、env / exports は
// cloudflare:workers 側が推奨（cloudflare:test の同名 export は非推奨）。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
