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
  const exerciseListRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/exercises',
    component: () => <div>種目一覧</div>,
  })
  const exerciseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/exercises/$exerciseId',
    component: () => <div>種目の記録</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      workoutRoute,
      exerciseListRoute,
      exerciseRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  // キャスト不要。RouterProvider は TRouter extends AnyRouter のジェネリックなので、
  // Register に登録した本番 router 以外も推論で受け取れる。
  // router も返す。遷移先の :workoutId まで見たいテストが pathname を読めるようにするため。
  return { router, ...renderWithQuery(<RouterProvider router={router} />) }
}
