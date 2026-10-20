# AGENTS.md — Simulador de Firma de Válvulas y Calibración de Transmisores

Simulador de instrumentación industrial para Vaca Muerta. Requerimientos fuente: `requerimientos-simulador-vaca-muerta.md` (norma ISO/IEC/IEEE 29148, fundamentos de Creus Solé 8ª ed., estándares FMI 3.0 / ISA-101 / ISA-18.2 / ISA-IEC 62443).

---

## 1. Stack y compilador

**Un solo lenguaje: TypeScript estricto.**

| Herramienta | Uso | Decisión |
|---|---|---|
| `tsc` (TypeScript ≥5.6, modo `strict`) | Compilador y type-check oficial | Es EL compilador del proyecto. Todo código pasa por `tsc --noEmit` en CI. |
| Vite | Dev server + build del front | Usa esbuild en dev (instantáneo) y Rollup para el build de producción. No se compila a mano. |
| Vitest | Test runner (mismo pipeline de transform que Vite) | Un solo runner para física, protocolos, API y componentes. |
| AssemblyScript (`asc`) | **Solo** para el binario WASM de la FMU FMI 3.0 | Es TypeScript con tipos estrictos; única pieza fuera del TS vanilla. La física ya está testeada en `packages/physics` antes de portarla. |
| Node 22 LTS + npm workspaces | Runtime y monorepo | Node se fija en `.nvmrc`. Turborepo solo si el build se vuelve lento (regla vaga: no antes). |
| SQLite (libsql/Drizzle) | Persistencia | Cero infraestructura. |

**Qué NO usar**: Babel standalone, webpack, ts-node en producción, ni lenguajes extra (Rust/C) salvo que la FMU lo exija y AssemblyScript quede corto.

## 2. Código reciclado disponible (verificado 2026-10-20)

Implementado en este repo: EP-00 (setup), EP-01 (motor físico), EP-02 (transmisores), EP-03 (engine + worker + protocolo), EP-04 (HMI 4 niveles), EP-05 (FMU FMI 3.0 WASM). Plantillas verificadas en otros proyectos del usuario:

- `~/Documentos/formulario-onbording/tecna-ob/` → base **Vite + React + TS + Tailwind + Vitest** lista para copiar (mejor `vite.config.ts` / `tsconfig` / eslint flat del árbol).
- `~/Documentos/manhattan-one/` → patrón de **monorepo workspaces** (`apps/*` + `packages/*`, exports por `src/index.ts`).
- `~/Documentos/trader-agent/debug-chart.html` → componente `ChartComponent` con **lightweight-charts** (canvas, ≥20 FPS) — base de las tendencias y de la firma de válvula.
- `~/Documentos/prompts-tecna-monitor/app/components/charts/` → helpers de series temporales (tema, tooltip, split de serie) para adaptar.
- `~/Documentos/dashboard-prompt-ops/components/dashboard/hud-elements.tsx` → paneles HUD (Tailwind puro) — adaptar a gris ISA-101.
- `~/Documentos/manhattan-one/packages/ui-components/src/audio-visualize/` → patrón de **loop en vivo + cleanup** (rAF/canvas) como referencia del worker de simulación.
- `~/Documentos/cursos/02-scada.md` y `04-proyecto-integrador.md` → modelo de dominio SCADA (tags, scan classes, ACK, shelving, interlocks).

**No existe en ningún lado** (se escribe de cero): — (todo lo pendiente está en épicas). Engine de orquestación, worker de simulación y contrato de mensajes worker↔UI: EP-03, vive en `packages/physics/src/engine.ts` (puro, determinista), `apps/web/src/sim/` (worker Vite + loop con reloj inyectado) y `packages/shared/src/index.ts` (protocolo tipado). Los bloques RB/TB/AI y el PID mínimo de transmisores viven en `packages/physics/src/transmitter.ts` y `pid.ts` (EP-02, v0.3.0). La HMI de 4 niveles vive en `apps/web/src/{state,components,views}` (EP-04, v0.5.0). La FMU FMI 3.0 vive en `packages/fmu` (EP-05, v0.6.0).

**Decisión de gráficos (EP-04, v0.5.0):** tendencias con **lightweight-charts** (series temporales, volcado a 20 FPS desde el feed de 100 Hz del worker) y **firma de válvula (plano X-Y P_act vs. carrera) en SVG propio** — lightweight-charts solo soporta tiempo monótono creciente y el lazo de histéresis tiene ramas no monótonas en el eje X más un marcador en vivo. El ciclo de firma corre síncrono en el hilo de UI sobre la física pura de `@sim/physics` (mismo procedimiento que TC-FUN-VAL-01).

**Decisión FMU (EP-05, v0.6.0):** física portada a **AssemblyScript** (`packages/fmu/assembly/index.ts`), port fiel del engine (bit-exact vs `@sim/physics`, verificado en TC-GEN-02) — no una reimplementación. Empaquetado `binaries/wasm32/<modelIdentifier>.wasm` (módulo wasm32 core instanciable desde JS, como pide TC-GEN-02); el perfil `wasm32-wasip2` del draft FMI-LS-WASM (Component Model + WIT) queda descartado: no lo soporta AssemblyScript ni lo requiere el TC. Subconjunto de API FMI 3.0 sin strings/callbacks: instancia = índice i32, arrays VR/values por **memoria lineal en offsets de scratch exportados** (análogo a punteros C). `modelDescription.xml` validado contra el **XSD oficial FMI 3.0.2** vendido en `packages/fmu/schema/` (xmllint en el test, skip si no hay xmllint); FMPy descartado porque no ejecuta FMUs WASM. El artefacto `.fmu` es build (gitignored): `npm run build:fmu` (raíz).

## 3. Principios de trabajo (innegociables)

### Vago
- Mínimo código que cumpla el REQ. Nada de abstracciones "por si acaso", ni features fuera de épica.
- Copiar plantilla existente (sección 2) antes de configurar desde cero.
- Automatizar lo repetitivo; no documentar lo que el código ya dice.

### Efectivo
- **Todo lo que se pretende que funcione tiene un test.** Todo REQ nuevo llega con su(s) TC(s) implementado(s) en Vitest, nombrados con el ID del caso (`TC-FUN-VAL-01`, etc.). Ninguna tarea se da por terminada con tests rojos o sin escribir.
- Antes de implementar: verificar si ya existe algo reciclable (sección 2).
- Al terminar: `npm run test` y `npm run build` en verde, y el escenario del usuario funcionando end-to-end.

### Eficiente
- Antes de codear, invertir en elegir el mejor camino: investigar tipo de simulación / tecnología / librería / lógica visual / flujo de UX. Si una decisión técnica cambia el enfoque (p. ej. otra lib de gráficos, otra estrategia de integración), resolverla antes de escribir código y dejarla anotada en este archivo.
- Preferir estándares (IEC 60534-2-1 para caudal de válvula, FMI 3.0.2, ISA-101/18.2) sobre soluciones caseras.
- Medir cuando el REQ lo pide (latencia, FPS, memoria) y registrar el resultado en el test o en el changelog.

### Con propósito (la lógica unificadora)
- **Nada de botones o flujos aislados.** Cada acción de la UI es un paso del mismo recorrido: *operar la planta → diagnosticar → calibrar → aprender*.
- Debe existir **un solo recorrido e2e** (Playwright) que ejercite la lógica completa de simulación en una pasada: arrancar simulación → mover consigna → ver firma de válvula → inyectar falla → ver alarma ISA-18.2 → calibrar transmisor → exportar tendencia. Vive en `apps/web/e2e/recorrido.e2e.ts` (TC-E2E-01) y corre con `npm run test:e2e` en la raíz — opt-in, separado de `npm run test` (no bloquea CI sin navegador). El config levanta por `webServer` el API en :3101 (DB `:memory:`) y el dev server Vite en :5173 (proxy `/api` vía `SIM_API_URL`), hermético respecto del backend de desarrollo en :3001.
- **Todo comportamiento invisible en la realidad se explica en pantalla**: la UI debe auto-explicar qué está pasando (p. ej. "caudal saturado por cavitación crítica: P1−P2 ≥ F_L²(P1−r_c·P_v)"), con alertas contextualizadas al mundo real de Vaca Muerta.
- Cada épica debe dejar un **aprendizaje** verificable: el operario termina sabiendo algo que no sabía (histéresis, zona muerta, turndown, cavitación).

## 4. Épicas

| ID | Épica | REQ que cierra | Estado |
|---|---|---|---|
| EP-00 | Setup monorepo + plantilla Vite + CI (test/build en verde) | — (infraestructura) | hecho (v0.1.0) |
| EP-01 | Motor físico `packages/physics`: dinámica de válvula (histéresis, zona muerta, fricción de empaquetadura, resorte) + caudal IEC 60534 (Cv, F_L, cavitación) | REQ-FUN-VAL-01/02, TC-FUN-VAL-01/02 | hecho (v0.2.0) |
| EP-02 | Transmisor inteligente: bloques RB/TB/FB, damping, calidad de señal, autocalibración y turndown | REQ-FUN-TRM-01/02 | hecho (v0.3.0) |
| EP-03 | Worker de simulación en tiempo real (100 Hz) + contrato de tipos compartidos | REQ-GEN-01, REQ-NFUN-PERF-01 | hecho (v0.4.0) |
| EP-04 | HMI niveles 1–4 (ISA-101): tendencias, indicadores de barra con bandas, faceplate de firma de válvula, calibración | REQ-UI-01..04 | hecho (v0.5.0) |
| EP-05 | FMU FMI 3.0 (co-simulation) vía AssemblyScript/WASM + validación del modelDescription.xml contra el XSD oficial 3.0.2 | REQ-GEN-02, TC-GEN-02 | hecho (v0.6.0) |
| EP-06 | Backend: RBAC (Operador/Técnico/Ingeniero), auditoría, exportación CSV/JSON de tendencias | REQ-NFUN-SEC-01, REQ-NFUN-PORT-01 | hecho (v0.7.0) |
| EP-07 | Recorrido e2e único + modo "explicación" auto-contextualizada | REQ-E2E-01, TC-E2E-01 | hecho (v0.8.0) |

**Fuera de alcance hasta nuevo aviso** (decisión registrada 2026-10-20): Scheduled Execution (REQ-FUN-SIM-03), Intermediate Update (REQ-FUN-SIM-01) y Early Return (REQ-FUN-SIM-02) quedan para fase posterior — el PID corre dentro del paso de co-simulación.

## 5. Reglas de documentación, test y versionado

1. **Requerimiento nuevo = documento + test + versión, siempre juntos.** Ninguna tarea se mergea sin los tres.
2. Nuevos requerimientos se agregan en `docs/requerimientos.md` siguiendo el formato del documento fuente: ID (`REQ-XXX-NN`), descripción, criterio de aceptación, y su caso(s) de prueba `TC-XXX-NN` con precondiciones/procedimiento/resultado esperado.
3. Cada REQ y TC lleva la **versión en que entró** (p. ej. `desde: v0.2.0`).
4. **Semver** (`MAJOR.MINOR.PATCH`), una versión por épica completada:
   - `MINOR` → épica cerrada con sus REQ/TC verdes.
   - `PATCH` → fixes.
   - `MAJOR` → cambio incompatible en API de paquetes o formato de FMU.
5. `CHANGELOG.md` en la raíz: entrada por versión con épica(s), REQ/TC agregados y métricas medidas (latencia, FPS) cuando apliquen. Se actualiza **en la misma tarea**, nunca después.
6. Git tag `vX.Y.Z` al cerrar cada épica.
7. Si cambia cualquier cosa que este archivo documenta (stack, plantillas reciclables, decisiones de alcance), actualizar este `AGENTS.md` en la misma tarea.

## 6. Definición de done

- REQ + TC documentados en `docs/requerimientos.md` con versión asignada.
- Tests nuevos en verde; suite completa `npm run test` y `npm run build` pasando.
- El recorrido único (EP-07) sigue funcionando; si la tarea agrega un paso al recorrido, el test e2e se actualiza en la misma tarea.
- CHANGELOG actualizado y `AGENTS.md` consistente con la realidad.
- La UI auto-explica el comportamiento nuevo (alerta o nota contextual con la física/la norma involucrada).
