/**
 * Ciclo de firma de válvula (EP-04, Nivel 4): barrido de P_act 3→15→3 psi
 * sobre la física pura de `@sim/physics` (la misma que corre en el worker),
 * replicando el procedimiento de TC-FUN-VAL-01: rampa continua a 0.05 psi/s
 * con dt = 2 ms, muestreando cada 0.1 psi. Corre síncrono en el hilo de UI
 * (~240 000 pasos ≈ 40 ms) porque es una rutina de diagnóstico, no un proceso
 * en tiempo real.
 */
import {
  ACTUATOR_MIN_PSI,
  ACTUATOR_SPAN_PSI,
  createValve,
  dynamicFrictionPsi,
  step as stepValve,
  VALVE_DEFAULTS,
  type ValveConfig,
  type ValveState,
} from '@sim/physics'

export interface SignaturePoint {
  readonly pActPsi: number
  readonly travelPercent: number
}

export interface SignatureCycle {
  /** Rama ascendente (apertura), ordenada por carrera creciente. */
  readonly up: readonly SignaturePoint[]
  /** Rama descendente (cierre). */
  readonly down: readonly SignaturePoint[]
  /** Separación horizontal entre ramas a 50% de carrera [psi]. */
  readonly hysteresisPsi: number
  /** Rozamiento dinámico de empaquetadura usado [psi] (2·F = ancho esperado). */
  readonly frictionPsi: number
}

const DT_S = 0.002
const RATE_PSI_PER_S = 0.05
const SAMPLE_EVERY_PSI = 0.1
/** Carrera a la que se reporta el ancho de histéresis (TC-FUN-VAL-01). */
export const HYSTERESIS_AT_TRAVEL = 0.5

function sweep(
  initial: ValveState,
  pFrom: number,
  pTo: number,
): { samples: SignaturePoint[]; end: ValveState } {
  const steps = Math.ceil(Math.abs(pTo - pFrom) / RATE_PSI_PER_S / DT_S)
  const dp = (pTo - pFrom) / steps
  const samples: SignaturePoint[] = []
  let nextSample = pFrom + Math.sign(dp) * SAMPLE_EVERY_PSI
  let s = initial
  for (let i = 0; i < steps; i++) {
    const p = pFrom + dp * (i + 1)
    s = stepValve(s, p, DT_S)
    const crossed = dp > 0 ? p >= nextSample : p <= nextSample
    if (crossed) {
      samples.push({ pActPsi: p, travelPercent: s.x * 100 })
      nextSample += Math.sign(dp) * SAMPLE_EVERY_PSI
    }
  }
  return { samples, end: s }
}

/** Presión a la que el barrido cruza la carrera objetivo (interpolación lineal). */
function pressureAtTravel(samples: readonly SignaturePoint[], targetPercent: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if ((a.travelPercent - targetPercent) * (b.travelPercent - targetPercent) <= 0
      && b.travelPercent !== a.travelPercent) {
      return (
        a.pActPsi
        + ((targetPercent - a.travelPercent) * (b.pActPsi - a.pActPsi))
          / (b.travelPercent - a.travelPercent)
      )
    }
  }
  throw new Error(`la carrera ${targetPercent}% no fue alcanzada en el barrido`)
}

export function runSignatureCycle(
  config: ValveConfig = VALVE_DEFAULTS,
  atTravel: number = HYSTERESIS_AT_TRAVEL,
): SignatureCycle {
  const valve = createValve(config)
  const up = sweep(valve, ACTUATOR_MIN_PSI, ACTUATOR_MIN_PSI + ACTUATOR_SPAN_PSI)
  const down = sweep(up.end, ACTUATOR_MIN_PSI + ACTUATOR_SPAN_PSI, ACTUATOR_MIN_PSI)
  const target = atTravel * 100
  return {
    up: up.samples,
    down: down.samples,
    hysteresisPsi: pressureAtTravel(up.samples, target) - pressureAtTravel(down.samples, target),
    frictionPsi: dynamicFrictionPsi(config),
  }
}
