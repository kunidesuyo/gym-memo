import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/**
 * exports.default は Worker 全体。export default の fetch から入るので、
 * /api 振り分け → Hono のルーティング の経路が実際に走る。モックはゼロ。
 */
describe('GET /api/health', () => {
  it('200 と疎通情報を返す', async () => {
    const res = await exports.default.fetch('https://example.com/api/health')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ok',
      runtime: 'workers',
    })
  })

  it('未定義の API パスは 404 を返す（body も { error: string }）', async () => {
    const res = await exports.default.fetch('https://example.com/api/unknown')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'not found' })
  })
})
