import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { WORKOUT_ID, workoutFixture } from '@test/msw/handlers'
import { server } from '@test/msw/server'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  it('データが揃うまで何も描かない（loader が待たせている）', async () => {
    // 取得に時間をかけて、途中の状態を観察できるようにする
    server.use(
      http.get('/api/workouts/:id', async () => {
        await delay(100)
        return HttpResponse.json(workoutFixture)
      }),
    )

    const { queryClient } = renderAt(`/workouts/${WORKOUT_ID}`)

    // ⚠️ **1ティック待ってから、データが来る前に**見ること。実測した推移:
    //      loader あり: 同期=空 / 1ティック後=空        / 完了で一気に描画
    //      loader なし: 同期=空 / 1ティック後=ナビだけ  / 完了で本体が入る
    //    loader があると Router がルート解決まで何も描かないので、
    //    ルート直下のナビ（__root.tsx）すら出ない。
    //    同期直後はどちらも空。完了後はどちらも全部出る。この1点でしか区別できない。
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('記録')).toBeNull()

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

    // ⚠️ **1回も取りに行かない。**
    //    loader は staleTime: 'static' でキャッシュを使う。画面側の
    //    useSuspenseQuery は staleTime が最低1秒に切り上げられるので、
    //    入れた直後のキャッシュは新鮮扱いで取り直さない
    //    （useQuery のままだと既定 staleTime: 0 で1回走っていた）。
    //    ⚠️ 1秒以上経ったキャッシュなら 1 になる。ここは「直後」の確認。
    //    `staleTime: 'static'` を外すと loader が取りに行って 1 になる。
    expect(calls).toBe(0)
  })

  it('失敗したら errorComponent がサーバーの文言と再試行を出す', async () => {
    let calls = 0
    server.use(
      http.get('/api/workouts/:id', () => {
        calls++
        return HttpResponse.json(
          { error: 'workout not found' },
          { status: 404 },
        )
      }),
    )

    renderAt(`/workouts/${WORKOUT_ID}`)

    // loader が throw するのでルートの errorComponent に入る。
    // errorFrom がサーバーの { error } を拾っていることも見ている。
    expect(
      await screen.findByText('workout not found', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '記録に戻る' })).toBeInTheDocument()

    // ⚠️ 再試行は router.invalidate()。reset() だと境界の UI しか戻らず
    //    loader が再実行されないので、取得が走らない。
    const before = calls
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })
})
