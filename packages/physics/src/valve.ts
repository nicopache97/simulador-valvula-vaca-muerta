/**
 * Dinámica vástago-actuador neumático (REQ-FUN-VAL-01, firma de válvula).
 *
 * Unidades: presión [psi], carrera como fracción 0..1 (0 = asiento, 1 = plena
 * apertura). Todas las fuerzas se expresan como presión equivalente
 * (fuerza / área efectiva del diafragma), por lo que el balance del vástago es:
 *
 *   m·a = P_act − P_resorte(x) − F_rozamiento·signo(v) − c·v
 *
 * Rozamiento de empaquetadura: Coulomb con stick-slip (estático > dinámico).
 * Zona muerta: banda muerta adicional en presión que retrasa el despegue.
 */

/** Configuración física de la válvula (valores por defecto para actuador 3–15 psi). */
export interface ValveConfig {
  /** Pre-carga del resorte a carrera cero [psi]. Debe superar a la presión
   * mínima del actuador en más de F_estática para que la válvula asiente. */
  readonly springPreloadPsi: number
  /** Rigidez del resorte [psi por unidad de carrera]. */
  readonly springRatePsiPerUnit: number
  /** Rozamiento dinámico de empaquetadura, como fracción del empuje de resorte
   * a carrera completa: F_dyn = frictionFraction · springRatePsiPerUnit. */
  readonly frictionFraction: number
  /** Razón rozamiento estático / dinámico (stick-slip), ≥ 1. */
  readonly stictionRatio: number
  /** Zona muerta adicional [psi]: el vástago no despega mientras
   * |P_act − P_resorte(x)| ≤ F_estática + deadbandPsi. */
  readonly deadbandPsi: number
  /** Masa equivalente del conjunto vástago-actuador [psi·s²]. */
  readonly mass: number
  /** Amortiguamiento viscoso equivalente [psi·s]. */
  readonly damping: number
  /** Apertura inicial [0..1]. */
  readonly initialOpening: number
}

/** Estado del vástago; incluye la configuración resuelta (API pura: `step` no recibe config). */
export interface ValveState {
  /** Posición del vástago, fracción de carrera 0..1. */
  readonly x: number
  /** Velocidad del vástago [fracción de carrera / s]. */
  readonly v: number
  /** true mientras el vástago está pegado (rozamiento estático). */
  readonly stuck: boolean
  readonly config: ValveConfig
}

export const VALVE_DEFAULTS: ValveConfig = {
  springPreloadPsi: 5,
  springRatePsiPerUnit: 8,
  frictionFraction: 0.15,
  stictionRatio: 1.5,
  deadbandPsi: 0,
  mass: 0.0128,
  damping: 0.576,
  initialOpening: 0,
}

/** Rozamiento dinámico en presión equivalente [psi]. */
export function dynamicFrictionPsi(config: ValveConfig): number {
  return config.frictionFraction * config.springRatePsiPerUnit
}

/** Presión de resorte en la posición x [psi]: P = pre-carga + k·x. */
export function springPressurePsi(x: number, config: ValveConfig): number {
  return config.springPreloadPsi + config.springRatePsiPerUnit * x
}

export function createValve(overrides: Partial<ValveConfig> = {}): ValveState {
  const config: ValveConfig = { ...VALVE_DEFAULTS, ...overrides }
  const x = Math.min(1, Math.max(0, config.initialOpening))
  return { x, v: 0, stuck: true, config }
}

/**
 * Avanza la dinámica un paso dt [s] con presión de actuador pActPsi [psi].
 * Función pura: no muta el estado, devuelve uno nuevo.
 */
export function step(state: ValveState, pActPsi: number, dt: number): ValveState {
  const fDyn = dynamicFrictionPsi(state.config)
  const breakawayPsi = state.config.stictionRatio * fDyn + state.config.deadbandPsi
  const fNet = pActPsi - springPressurePsi(state.x, state.config)

  const { x, config } = state
  let { v, stuck } = state
  if (stuck) {
    if (Math.abs(fNet) <= breakawayPsi) {
      return state
    }
    stuck = false
    v = 0
  }

  const dir = v !== 0 ? Math.sign(v) : Math.sign(fNet)
  const accel = (fNet - dir * fDyn - config.damping * v) / config.mass
  const vNew = v + accel * dt
  const xNew = x + vNew * dt

  if (vNew * dir < 0) {
    // La velocidad cruzó por cero dentro del paso: el vástago se pega.
    return { x, v: 0, stuck: true, config }
  }
  if (xNew <= 0) {
    return { x: 0, v: 0, stuck: true, config }
  }
  if (xNew >= 1) {
    return { x: 1, v: 0, stuck: true, config }
  }
  return { x: xNew, v: vNew, stuck, config }
}
