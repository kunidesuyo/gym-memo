import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { WORKOUT_ID, workoutFixture } from '@test/msw/handlers'
import { server } from '@test/msw/server'
import { render, screen } from '@testing-library/react'
import { delay, HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { routeTree } from '@/routeTree.gen'

/**
 * loader が効いているかを見る。
 *
 * ⚠️ **本物のルートツリーで描く。** test/utils.tsx の `renderWithRouter` は
 *    独自のツリーを組むので loader を通らず、ここの検証にならない。
 */
function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

describe('/workouts/$workoutId の loader', () => {
  it('ローディングを経由せずに表示する（loader が取り終えてから描く）', async () => {
    // 取得に時間をかけて、ローディングが出る隙を作る
    server.use(
      http.get('/api/workouts/:id', async () => {
        await delay(100)
        return HttpResponse.json(workoutFixture)
      }),
    )

    const { queryClient } = renderAt(`/workouts/${WORKOUT_ID}`)

    // ⚠️ **1ティック待ってから、データが来る前に**見ること。実測した推移:
    //      loader あり: 同期=空 / 1ティック後=空        / データ到着で一気に描画
    //      loader なし: 同期=空 / 1ティック後=読み込み中 / データ到着で差し替え
    //    同期直後はどちらも空（Router がまだルートを解決していない）。
    //    await findByText のあとだとどちらも表示が消えている。
    //    この1点でしか区別できない。
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('読み込み中...')).toBeNull()

    expect(await screen.findByText('2026-09-20')).toBeInTheDocument()

    // Query のキャッシュに入っている（Router の loader キャッシュではなく）
    expect(queryClient.getQueryData(['workouts', WORKOUT_ID])).toMatchObject({
      performedOn: '2026-09-20',
    })
  })

  it("キャッシュがあれば loader は取りに行かない（staleTime: 'static'）", async () => {
    let calls = 0
    server.use(
      http.get('/api/workouts/:id', () => {
        calls++
        return HttpResponse.json(workoutFixture)
      }),
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    // あらかじめキャッシュに入れておく
    queryClient.setQueryData(['workouts', WORKOUT_ID], workoutFixture)

    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: [`/workouts/${WORKOUT_ID}`],
      }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByText('2026-09-20')
    await new Promise((resolve) => setTimeout(resolve, 60))

    // ⚠️ 1回は画面側の useQuery（既定 staleTime: 0）による取り直し。
    //    loader からも取ると 2 になる。`staleTime: 'static'` を外すと落ちる。
    expect(calls).toBe(1)
  })

  it('取得に失敗しても画面は落ちない', async () => {
    server.use(
      http.get('/api/workouts/:id', () =>
        HttpResponse.json({ error: 'workout not found' }, { status: 404 }),
      ),
    )

    renderAt(`/workouts/${WORKOUT_ID}`)

    // loader が throw するので Router のエラー境界に入る。
    // errorComponent を置いていないので既定の表示になるが、
    // 少なくともサーバーの文言が拾えていること（errorFrom が効いている）を見る。
    expect(
      await screen.findByText(/workout not found/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
  })
})
