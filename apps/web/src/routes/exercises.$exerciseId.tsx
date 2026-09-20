import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/exercises/$exerciseId')({
  component: () => (
    <p className="text-slate-400">種目ごとの記録（1-f で実装）</p>
  ),
})
