/**
 * Function Block PID mínimo (P + I) para cerrar el lazo de control (EP-04).
 * Anti-windup por integración condicional: si la salida satura (clamping),
 * el término integral no se acumula.
 *
 * Unidades: SP, PV y salida comparten la misma base (la salida se expresa
 * típicamente en % de escala del actuador).
 */

export interface PidConfig {
  /** Ganancia proporcional Kp. */
  readonly kp: number
  /** Tiempo integral Ti [s]; 0 = acción integral deshabilitada (solo P). */
  readonly ti: number
  /** Límite inferior de la salida. */
  readonly outMin: number
  /** Límite superior de la salida. */
  readonly outMax: number
}

export interface PidState {
  readonly config: PidConfig
  /** Término integral acumulado (contribución a la salida, mismas unidades que out). */
  readonly integral: number
  /** Salida calculada, ya saturada al rango [outMin, outMax]. */
  readonly out: number
}

export const PID_DEFAULTS: PidConfig = {
  kp: 1,
  ti: 0,
  outMin: 0,
  outMax: 100,
}

export function createPid(
  overrides: Partial<PidConfig> & Pick<PidConfig, 'kp'>,
): PidState {
  const config: PidConfig = { ...PID_DEFAULTS, ...overrides }
  if (!(config.outMax > config.outMin)) {
    throw new Error(`rango de salida inválido: outMax (${config.outMax}) debe superar a outMin (${config.outMin})`)
  }
  return { config, integral: 0, out: 0 }
}

/**
 * Ejecuta el algoritmo un paso dt [s] ante consigna sp y medición pv
 * (mismas unidades). Función pura: no muta el estado, devuelve uno nuevo.
 */
export function stepPid(state: PidState, sp: number, pv: number, dt: number): PidState {
  const { kp, ti, outMin, outMax } = state.config
  const error = sp - pv
  const dIntegral = ti > 0 ? (kp * error * dt) / ti : 0
  const integralCandidate = state.integral + dIntegral
  const outUnclamped = kp * error + integralCandidate

  // Anti-windup: saturado, no se acumula integral (integración condicional).
  if (outUnclamped >= outMax) {
    return { ...state, out: outMax }
  }
  if (outUnclamped <= outMin) {
    return { ...state, out: outMin }
  }
  return { ...state, integral: integralCandidate, out: outUnclamped }
}
