import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('App', () => {
  it('API から取得した疎通情報を表示する', async () => {
    render(<App />, { wrapper: Wrapper })

    expect(screen.getByText('確認中...')).toBeInTheDocument()
    expect(await screen.findByText('ok')).toBeInTheDocument()
    expect(screen.getByText('workers')).toBeInTheDocument()
  })
})
