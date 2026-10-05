import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { routeTree } from './routeTree.gen'

/**
 * shadcn は `.dark` クラスでテーマを切り替える（index.css の @custom-variant dark）。
 * Tailwind 既定の `dark:` と違い prefers-color-scheme を自動では見ないので、
 * OS 設定に追従するようここで同期する。
 */
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
const syncTheme = () =>
  document.documentElement.classList.toggle('dark', darkMedia.matches)
syncTheme()
darkMedia.addEventListener('change', syncTheme)

const queryClient = new QueryClient()

// loader から queryClient を使うのでコンテキストに渡す（型は __root.tsx の RouterContext）。
// 読み出しは Query のキャッシュだけから行う（useLoaderData は使わない）。
// Router も loader の戻り値を保存しているが誰も読まない。詳細は
// routes/workouts/$workoutId.tsx のコメント。
const router = createRouter({ routeTree, context: { queryClient } })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root が見つかりません')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
