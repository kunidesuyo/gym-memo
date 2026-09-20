import type { AppType } from 'api/routes'
import { hc } from 'hono/client'

/**
 * Hono RPC の型付きクライアント。
 * AppType は apps/api のルート定義から推論されたもので、
 * パス・リクエスト・レスポンスすべてに型がつく（コード生成なし）。
 *
 * 開発時は Vite の proxy が /api を :8787 に流し、
 * 本番は同一 Worker が処理するので、どちらも同一オリジンでよい。
 */
export const client = hc<AppType>('/')
