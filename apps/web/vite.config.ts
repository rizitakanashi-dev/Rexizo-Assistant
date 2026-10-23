import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API_KEY = env.REXIZO_API_KEY ?? env.JARVIS_API_KEY ?? ''

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (API_KEY) {
                proxyReq.setHeader('X-REXIZO-API-KEY', API_KEY)
                proxyReq.setHeader('X-JARVIS-API-KEY', API_KEY)
              }
            })
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            // WebSocket memakai event `proxyReqWs` (bukan `proxyReq`).
            // Browser tidak bisa mengirim header custom pada handshake WS,
            // jadi API key disuntik di sisi dev-server — tidak pernah masuk bundle.
            proxy.on('proxyReqWs', (proxyReq) => {
              if (API_KEY) {
                proxyReq.setHeader('X-REXIZO-API-KEY', API_KEY)
                proxyReq.setHeader('X-JARVIS-API-KEY', API_KEY)
              }
            })
          },
        },
      },
    },
  }
})
