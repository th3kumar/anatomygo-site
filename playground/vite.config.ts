import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: '/playground/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3017, strictPort: true, fs: { allow: ['..'] },  // lib/feature-shape.ts is shared with the explorer
    proxy: { '/models': 'http://127.0.0.1:3016', '/playground-seed.json': 'http://127.0.0.1:3016' } },
  build: { outDir: '../dist/playground', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
})
