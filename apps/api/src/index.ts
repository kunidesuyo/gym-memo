import { routes } from './routes'

/**
 * Worker のエントリポイント。
 *
 * wrangler.jsonc の run_worker_first により通常 /api/* しか届かないが、
 * Worker 単体でも正しく振る舞えるようにフォールバックを持たせている。
 */
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return routes.fetch(request, env, ctx)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
