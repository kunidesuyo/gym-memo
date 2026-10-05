import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router'

/** loader はフックを呼べないので、queryClient はコンテキストで渡す。 */
export type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="mx-auto min-h-dvh max-w-md">
      <nav className="flex gap-4 border-b px-4 py-3 text-sm">
        <Link
          to="/"
          activeProps={{
            className: 'font-medium underline underline-offset-4',
          }}
          activeOptions={{ exact: true }}
        >
          記録
        </Link>
        <Link
          to="/exercises"
          activeProps={{
            className: 'font-medium underline underline-offset-4',
          }}
        >
          種目
        </Link>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  ),
})
