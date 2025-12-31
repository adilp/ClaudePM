import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://tauri.app/v2/guides/develop/vite
export default defineConfig({
  plugins: [react()],
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    // Tauri expects a fixed port
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
  // Env variables starting with TAURI_ are available in the frontend
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // Vendor chunk splitting for better caching
        manualChunks: {
          // React core - rarely changes
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // TanStack Query - separate chunk for data fetching
          'query-vendor': ['@tanstack/react-query'],
          // Tauri plugins - native app functionality
          'tauri-vendor': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-notification',
            '@tauri-apps/plugin-store',
          ],
        },
      },
    },
  },
});
