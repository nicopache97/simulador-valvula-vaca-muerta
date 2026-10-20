/**
 * Cliente del worker de simulación (EP-03). Vite empaqueta
 * `simulation.worker.ts` como entry aparte al encontrar este `new URL`.
 */
import type { SimCommand, SimEvent } from '@sim/shared'

export function createSimulationWorker(): Worker {
  return new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
}

export type { SimCommand, SimEvent }
