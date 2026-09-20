import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

// onUnhandledRequest: 'error' にしておくと、
// ハンドラを定義し忘れたリクエストが黙って素通りせずテストが落ちる。
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
