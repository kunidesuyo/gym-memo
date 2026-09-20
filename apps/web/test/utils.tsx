import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    // テストでは再試行を切る。切らないと失敗系のテストが遅くなる。
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) }
}

/**
 * ルータを必要とするコンポーネント（<Link> を使うもの）用。
 * メモリ履歴で最小のルートツリーを組み立てて描画する。
 */
export function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  })
  const workoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/workouts/$workoutId',
    component: () => <div>ワークアウト画面</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, workoutRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  // biome-ignore lint/suspicious/noExplicitAny: テスト用の最小ルートツリーは本番の型と一致しない
  return renderWithQuery(<RouterProvider router={router as any} />)
}
