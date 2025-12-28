import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 4848,
    allowedHosts: ['claudepm.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:4847',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4847',
        ws: true,
      },
    },
  },
})
