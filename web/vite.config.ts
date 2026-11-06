/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // dev only: ให้ cookie และ /api ทำงานแบบ same-origin เหมือนผ่าน Traefik
    proxy: {
      '/api': 'http://localhost:8000',
      // ภาพถนนของแผนที่ — ตอน build จริง nginx ทำหน้าที่นี้พร้อม cache (web/nginx.conf)
      '/tiles': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tiles/, ''),
        headers: { 'User-Agent': 'PetFinder-class-project/0.1 (+https://github.com/buildsudtae/petFinder)' },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
