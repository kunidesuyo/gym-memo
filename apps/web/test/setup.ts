import '@testing-library/jest-dom/vitest'

// jsdom は scrollTo を実装していない。TanStack Router が遷移時に呼ぶので黙らせる。
window.scrollTo = () => {}

import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

// onUnhandledRequest: 'error' にしておくと、
// ハンドラを定義し忘れたリクエストが黙って素通りせずテストが落ちる。
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
