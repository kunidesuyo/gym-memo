import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // ルータのプラグインは react() より前に置く必要がある
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    // 既定の 5173 は他プロジェクトと衝突しやすい。専用ポートを明示し、
    // strictPort で「黙って別ポートにずれる」のを防ぐ（proxy 先とズレると原因が分かりにくいため）。
    port: 5180,
    strictPort: true,

    // /api を wrangler dev (:8787) に流す。
    // これにより開発中もブラウザから見れば同一オリジン = CORS が発生しない。
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
