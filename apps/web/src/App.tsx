import { useQuery } from '@tanstack/react-query'
import { client } from './api/client'

export function App() {
  const { data, isPending, error } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await client.api.health.$get()
      if (!res.ok) throw new Error(`health check failed: ${res.status}`)
      return await res.json()
    },
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <h1 className="font-bold text-2xl">gym-memo</h1>

      <section className="rounded-lg border border-gray-300 p-4">
        <h2 className="mb-2 font-medium text-gray-500 text-sm">API 疎通確認</h2>

        {isPending && <p>確認中...</p>}
        {error && <p role="alert">エラー: {error.message}</p>}
        {data && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500">status</dt>
            <dd>{data.status}</dd>
            <dt className="text-gray-500">runtime</dt>
            <dd>{data.runtime}</dd>
            <dt className="text-gray-500">time</dt>
            <dd>{data.time}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
