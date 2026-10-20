# CHANGELOG

## v0.1.0 — EP-00: Setup monorepo + plantilla Vite + CI en verde (2026-10-20)

- **Infraestructura:** monorepo npm workspaces (`packages/*`, `apps/*`) con Node 22 (`.nvmrc`) y TypeScript `strict` en todo el repo.
- **Paquetes:**
  - `@sim/shared` — tipos y constantes compartidas (placeholder: roles de usuario REQ-NFUN-SEC-01).
  - `@sim/physics` — paquete vacío con test placeholder en verde (frecuencia de muestreo 100 Hz, REQ-GEN-01).
- **Apps:**
  - `@sim/web` — Vite + React 19 + Tailwind (paleta gris ISA-101 + alarmas ISA-18.2) + Vitest/jsdom, adaptado de la plantilla `tecna-ob`. App mínima "Simulador Vaca Muerta v0.1.0" con test de render en verde.
  - `@sim/server` — Hono con endpoint `/api/health` y test en verde.
- **Scripts raíz:** `npm run dev` (web), `npm run test` y `npm run build` (todos los workspaces).
- **Docs:** `docs/requerimientos.md` creado (extiende al documento fuente, tablas REQ/TC vacías).
- REQ/TC agregados: ninguno (EP-00 es infraestructura).
- Métricas: no aplica en esta épica.
