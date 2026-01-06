import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Ensure service worker is included in build
      input: {
        main: './index.html',
      },
    },
  },
  // Ensure service worker is served from root
  publicDir: 'public',
})