/**
 * Caudal a través de la válvula según IEC 60534-2-1 (REQ-FUN-VAL-02).
 *
 * Convención de unidades: presiones [bar], caudal [m³/h]. Se usa el
 * coeficiente Kv (m³/h por √bar); el Cv configurado (US gpm por √psi) se
 * convierte con 1 Cv = 1.156 Kv.
 *
 * Régimen no ahogado:  Q = Kv_ef·√(ΔP/G)
 * Cavitación crítica:  ΔP ≥ F_L²·(P1 − r_c·Pv)  →  Q = Kv_ef·F_L·√((P1 − r_c·Pv)/G)
 */

/** 1 Cv (US gpm/√psi) = 1.156 Kv (m³/h/√bar). */
export const KV_PER_CV = 1 / 1.156

export type ValveCharacteristic = 'linear' | 'equal-percentage'

/** Configuración hidráulica de la válvula. */
export interface FlowConfig {
  /** Coeficiente de flujo Cv [US gpm/√psi]. */
  readonly cv: number
  /** Factor de recuperación de presión F_L (0..1). */
  readonly fl: number
  /** Gravedad específica del fluido G (agua = 1). */
  readonly specificGravity: number
  /** Presión de vapor del fluido Pv [bar] (agua a ~20 °C ≈ 0.0234). */
  readonly vaporPressureBar: number
  /** Factor de relación de presión crítica r_c (agua ≈ 0.95). */
  readonly criticalPressureRatio: number
  /** Curva característica inherente de la válvula. */
  readonly characteristic: ValveCharacteristic
  /** Relación de ajuste R para equal-percentage (IEC: típicamente 50). */
  readonly rangeability: number
}

export interface FlowResult {
  /** Caudal volumétrico [m³/h]. */
  readonly q: number
  /** true si el régimen es ahogado (cavitación crítica). */
  readonly choked: boolean
  /** ΔP de inicio de cavitación crítica [bar]: F_L²·(P1 − r_c·Pv). */
  readonly dpChoked: number
}

export function createFlowConfig(
  overrides: Partial<FlowConfig> & Pick<FlowConfig, 'cv' | 'fl'>,
): FlowConfig {
  return {
    specificGravity: 1,
    vaporPressureBar: 0.0234,
    criticalPressureRatio: 0.95,
    characteristic: 'linear',
    rangeability: 50,
    ...overrides,
  }
}

/** Fracción de Cv efectiva según la curva característica inherente, f(x). */
export function characteristicFactor(opening: number, config: FlowConfig): number {
  const x = Math.min(1, Math.max(0, opening))
  if (config.characteristic === 'equal-percentage') {
    return config.rangeability ** (x - 1)
  }
  return x
}

export function computeFlow(
  p1Bar: number,
  p2Bar: number,
  opening: number,
  config: FlowConfig,
): FlowResult {
  const dp = p1Bar - p2Bar
  const dpChoked =
    config.fl ** 2 * (p1Bar - config.criticalPressureRatio * config.vaporPressureBar)
  const kvEffective = config.cv * KV_PER_CV * characteristicFactor(opening, config)

  if (dp <= 0 || kvEffective <= 0) {
    return { q: 0, choked: false, dpChoked }
  }
  if (dp >= dpChoked) {
    const available = Math.max(0, p1Bar - config.criticalPressureRatio * config.vaporPressureBar)
    return {
      q: kvEffective * config.fl * Math.sqrt(available / config.specificGravity),
      choked: true,
      dpChoked,
    }
  }
  return { q: kvEffective * Math.sqrt(dp / config.specificGravity), choked: false, dpChoked }
}
