/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Target del backend configurable (el e2e EP-07 usa SIM_API_URL para
      // no depender de lo que haya corriendo en :3001).
      '/api': process.env.SIM_API_URL ?? 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
