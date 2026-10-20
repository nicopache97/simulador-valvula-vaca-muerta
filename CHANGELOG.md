# CHANGELOG

## v0.2.0 — EP-01: Motor físico de válvulas `packages/physics` (2026-10-20)

- **REQ-FUN-VAL-01** — Dinámica vástago-actuador (`src/valve.ts`): balance de fuerzas en presión equivalente (psi): resorte con pre-carga, fricción Coulomb stick-slip (estático/dinámico), zona muerta adicional en presión, tope de carrera. API pura y funcional: `createValve(config)`, `step(valveState, pAct, dt)` (Euler semi-implícito, dt configurable). Defaults para actuador 3–15 psi (pre-carga 5 psi, k = 8 psi/unidad, ζ = 0.9).
- **REQ-FUN-VAL-02** — Caudal IEC 60534-2-1 (`src/flow.ts`): no ahogado Q = Kv·√(ΔP/G), cavitación crítica con F_L y r_c (default agua 0.95), característica lineal/equal-percentage. Presiones [bar], caudal [m³/h] (Cv → Kv, 1 Cv = 1.156 Kv).
- **Tests (Vitest, 9 verdes):** TC-FUN-VAL-01 (lazo cerrado, separación al 50% = 2·F_friction medida 2.407 psi vs 2.4 ±1.5%), TC-FUN-VAL-02 (√ΔP exacto + saturación horizontal ≈ 348 m³/h), TC-FUN-VAL-01a (equilibrio de resorte), TC-FUN-VAL-01b (zona muerta), test de rendimiento.
- **Métricas medidas:** separación del lazo 2.407 psi (error 0.29% vs 2.4 psi); 100 000 pasos de integración de válvula en ~15 ms (~0.15 µs/paso, factor ≈ 65 000× tiempo real; presupuesto REQ-NFUN-PERF-01: factor ≥ 5×).
- **Docs:** REQ/TC en `docs/requerimientos.md` con versión v0.2.0; nota de refinamiento de procedimiento en TC-FUN-VAL-01 (rampa continua en lugar de escalones discretos).
- REQ/TC agregados: REQ-FUN-VAL-01/02, TC-FUN-VAL-01/01a/01b/02.

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
