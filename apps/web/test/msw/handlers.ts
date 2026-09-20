import type { InferResponseType } from 'hono/client'
import { HttpResponse, http } from 'msw'
import type { client } from '../../src/api/client'

/**
 * モックのレスポンス型を実際の API の推論型に縛る。
 * API 側のレスポンス形を変えてここを直し忘れると、
 * テストが通ってしまう前にコンパイルエラーになる。
 */
type Health = InferResponseType<typeof client.api.health.$get>

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json<Health>({
      status: 'ok',
      runtime: 'workers',
      time: '2026-09-20T00:00:00.000Z',
    }),
  ),
]
