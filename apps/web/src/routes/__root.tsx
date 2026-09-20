import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <main className="mx-auto min-h-dvh max-w-md p-4">
      <Outlet />
    </main>
  ),
})
