import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from a custom domain root, so base is '/'.
// The app uses HashRouter, so no server-side SPA fallback is required on GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
