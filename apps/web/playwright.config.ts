/**
 * Configuración del recorrido e2e único (EP-07, REQ-E2E-01 / TC-E2E-01).
 *
 * Levanta los dos procesos que el recorrido necesita:
 *  · API `@sim/server` en :3101 (RBAC + auditoría — requiere `apps/server/dist`,
 *    el script raíz `npm run test:e2e` compila antes de invocar este config;
 *    la DB es `:memory:` para que cada corrida arranque limpia). Puerto
 *    propio y `reuseExistingServer: false`: el e2e es hermético y no toca
 *    el backend de desarrollo que el usuario pueda tener en :3001.
 *  · Dev server Vite de `@sim/web` en :5173 (proxy `/api` → :3101 vía
 *    `SIM_API_URL`, configurable en `vite.config.ts`). Puerto parametrizable
 *    por `SIM_E2E_PORT` (default 5173) para no chocar con un `npm run dev`
 *    del usuario ya corriendo en el default (v0.9.0).
 *
 * Los e2e NO corren en `npm run test` (suite unitaria Vitest) ni bloquean CI
 * sin navegador: son opt-in vía `npm run test:e2e` en la raíz.
 */
import { defineConfig } from '@playwright/test'

const E2E_PORT = process.env.SIM_E2E_PORT ?? '5173'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    headless: true,
  },
  webServer: [
    {
      command: 'npm run start -w @sim/server --prefix ../..',
      port: 3101,
      env: { PORT: '3101', SIM_DB: ':memory:' },
      // Hermético: nunca se reutiliza un server ajeno (podría ser una build
      // vieja sin /api/login, como el dev server del usuario en :3001).
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
      port: Number(E2E_PORT),
      env: { SIM_API_URL: 'http://localhost:3101' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
