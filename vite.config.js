import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// Served from a custom domain root, so base is '/'.
// The app uses HashRouter, so no server-side SPA fallback is required on GitHub Pages.
export default defineConfig({
  plugins: [react(), cloudflare()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})