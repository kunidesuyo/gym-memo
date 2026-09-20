import { Hono } from 'hono'

/**
 * ルート定義。ここが Hono RPC の型の源になる。
 *
 * web 側はこのファイルだけを型解決する（Worker エントリの index.ts は読まない）ため、
 * ここには「ルートとハンドラ」以外を置かないこと。
 * メソッドチェーンで書いているのも RPC のためで、
 * 途中で変数に代入して分けると型が積み上がらない。
 */
export const routes = new Hono<{ Bindings: Env }>().get('/api/health', (c) =>
  c.json({
    status: 'ok',
    runtime: 'workers',
    time: new Date().toISOString(),
  }),
)

export type AppType = typeof routes
