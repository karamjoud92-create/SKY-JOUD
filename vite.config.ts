import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

function commit(): string {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
}
function commitCount(): string {
  try { return execSync('git rev-list --count HEAD').toString().trim() } catch { return '0' }
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_COUNT__: JSON.stringify(commitCount()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  build: {
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: undefined,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
