import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="mx-auto min-h-dvh max-w-md">
      <nav className="flex gap-4 border-slate-200 border-b px-4 py-3 text-sm dark:border-slate-800">
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
