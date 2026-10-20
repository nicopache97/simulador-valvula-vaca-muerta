/**
 * Transmisor inteligente HART / Foundation Fieldbus (REQ-FUN-TRM-01/02).
 *
 * Estructura de bloques según la arquitectura de instrumentos inteligentes
 * (Creus Solé):
 *
 *  Resource Block (RB):    identificación (tag, fabricante, modelo, serie) y
 *                          diagnóstico global (device status).
 *  Transducer Block (TB):  lectura primaria del sensor con desviación interna
 *                          simulable (sensorBias), caracterización de
 *                          linealidad, compensación térmica simple (deriva
 *                          residual por °C) y falla simulable TB_Sensor_Fault.
 *  Function Block AI:      escalamiento LRV/URV a % de escala, damping de
 *                          primer orden (τ), límites de rango (clamping a
 *                          0–100% con saturación high/low) y salida AI.PV en
 *                          unidades de ingeniería + % de escala con calidad.
 *
 * Comandos de campo tipo AMS/HART (REQ-FUN-TRM-02): zeroTrim, spanTrim y
 * setRange (re-rango digital con límite de relación turndown, default 400:1).
 *
 * La variable primaria se expresa en unidades de ingeniería arbitrarias
 * (bar, mbar, °C); el modelo es adimensional en ese sentido.
 */

/** Calidad de la señal propagada por el TB hacia el FB AI (AI.PV.Quality). */
export type SignalQuality = 'GOOD' | 'UNCERTAIN' | 'BAD_SENSOR_FAILURE'

/** Estado de saturación por límites de rango del FB AI. */
export type LimitStatus = 'NOT_LIMITED' | 'HIGH_LIMITED' | 'LOW_LIMITED'

/** Diagnóstico global del Resource Block. */
export type DeviceStatus = 'OK' | 'FAILURE'

/** Caracterización de linealidad del TB: identidad o raíz cuadrada (caudal). */
export type Characterization = 'identity' | 'sqrt'

/** Resource Block: identificación y diagnóstico global del dispositivo. */
export interface ResourceBlock {
  readonly tag: string
  readonly manufacturer: string
  readonly model: string
  readonly serialNumber: string
  readonly deviceStatus: DeviceStatus
}

/** Configuración del transmisor (campos estáticos del RB, TB y FB AI). */
export interface TransmitterConfig {
  // Resource Block
  readonly tag: string
  readonly manufacturer: string
  readonly model: string
  readonly serialNumber: string
  // Transducer Block
  /** Span nominal de fábrica [unid. ing.]; base para el límite de turndown.
   * Por defecto se resuelve como urv − lrv al crear el transmisor. */
  readonly nominalSpan: number
  /** Desviación interna (offset) del sensor, simulable [unid. ing.]. */
  readonly sensorBias: number
  /** Deriva térmica residual tras la compensación [unid. ing. / °C]:
   * a T = referenceTempDegC no hay error; la lectura se desvía linealmente
   * con la diferencia de temperatura. */
  readonly thermalDriftPerDegC: number
  /** Temperatura de referencia de la compensación térmica [°C]. */
  readonly referenceTempDegC: number
  /** Caracterización de linealidad aplicada a la lectura primaria. */
  readonly characterization: Characterization
  // Function Block AI
  /** LRV: límite inferior del rango configurado [unid. ing.]. */
  readonly lrv: number
  /** URV: límite superior del rango configurado [unid. ing.]. */
  readonly urv: number
  /** Constante de tiempo del filtro de damping [s]; 0 = sin filtro. */
  readonly tau: number
  /** Relación de turndown máxima admitida por setRange (default 400:1). */
  readonly maxTurndown: number
}

/** Estado completo del transmisor (la UI de EP-04 inspecciona estos bloques). */
export interface TransmitterState {
  readonly config: TransmitterConfig
  readonly rb: ResourceBlock
  /** Bandera TB_Sensor_Fault: falla simulada del sensor. */
  readonly tbSensorFault: boolean
  /** Última lectura del TB: caracterizada + sesgo + deriva térmica (pre-trim). */
  readonly rawInput: number
  /** Corrección de offset del trim de cero [unid. ing.]. */
  readonly trimOffset: number
  /** Corrección de ganancia del trim de span (adimensional). */
  readonly trimGain: number
  /** Estado del filtro de damping, en % de escala. */
  readonly filteredPercent: number
  /** AI.PV en unidades de ingeniería. */
  readonly pv: number
  /** AI.PV en % de escala (0–100). */
  readonly pvPercent: number
  readonly quality: SignalQuality
  readonly limitStatus: LimitStatus
}

export function createTransmitter(
  overrides: Partial<TransmitterConfig> & Pick<TransmitterConfig, 'lrv' | 'urv'>,
): TransmitterState {
  const span = overrides.urv - overrides.lrv
  if (!(span > 0)) {
    throw new Error(`rango inválido: URV (${overrides.urv}) debe superar a LRV (${overrides.lrv})`)
  }
  const config: TransmitterConfig = {
    tag: 'PT-100',
    manufacturer: 'SimInstruments',
    model: 'SIM-TRM-1',
    serialNumber: 'SN-0001',
    nominalSpan: span,
    sensorBias: 0,
    thermalDriftPerDegC: 0,
    referenceTempDegC: 20,
    characterization: 'identity',
    tau: 0,
    maxTurndown: 400,
    ...overrides,
  }
  const initialPv = overrides.lrv
  return {
    config,
    rb: {
      tag: config.tag,
      manufacturer: config.manufacturer,
      model: config.model,
      serialNumber: config.serialNumber,
      deviceStatus: 'OK',
    },
    tbSensorFault: false,
    rawInput: initialPv,
    trimOffset: 0,
    trimGain: 1,
    filteredPercent: 0,
    pv: initialPv,
    pvPercent: 0,
    quality: 'GOOD',
    limitStatus: 'NOT_LIMITED',
  }
}

/** Activa/desactiva la bandera TB_Sensor_Fault (falla simulada del sensor). */
export function setSensorFault(state: TransmitterState, fault: boolean): TransmitterState {
  if (fault === state.tbSensorFault) return state
  const quality: SignalQuality = fault ? 'BAD_SENSOR_FAILURE' : 'GOOD'
  const deviceStatus: DeviceStatus = fault ? 'FAILURE' : 'OK'
  // El TB retiene el último valor válido; solo cambian calidad y diagnóstico.
  return { ...state, tbSensorFault: fault, quality, rb: { ...state.rb, deviceStatus } }
}

/**
 * Re-rango digital del FB AI (comando HART/AMS). Cambia LRV/URV sin tocar la
 * medición física. Exige urv > lrv y span ≥ nominalSpan / maxTurndown
 * (relación de turndown configurable, default 400:1).
 */
export function setRange(state: TransmitterState, lrv: number, urv: number): TransmitterState {
  const span = urv - lrv
  if (!(span > 0)) {
    throw new Error(`rango inválido: URV (${urv}) debe superar a LRV (${lrv})`)
  }
  const turndown = state.config.nominalSpan / span
  if (turndown > state.config.maxTurndown) {
    throw new Error(
      `turndown ${turndown.toFixed(1)}:1 supera el límite de ${state.config.maxTurndown}:1 del transmisor`,
    )
  }
  return { ...state, config: { ...state.config, lrv, urv } }
}

/**
 * Zero Trim (ajuste de cero, HART cmd 35): con un patrón aplicado al proceso,
 * corrige el offset para que la lectura compensada coincida con el patrón.
 * Usa la última lectura del TB (state.rawInput).
 */
export function zeroTrim(state: TransmitterState, appliedStandard: number): TransmitterState {
  return { ...state, trimOffset: appliedStandard - state.trimGain * state.rawInput }
}

/**
 * Span Trim (ajuste de span, HART cmd 36): corrige la ganancia para que la
 * lectura compensada en el punto actual coincida con el patrón aplicado.
 * Requiere una lectura primaria no nula (spanTrim en cero es indeterminado).
 */
export function spanTrim(state: TransmitterState, appliedStandard: number): TransmitterState {
  if (state.rawInput === 0) {
    throw new Error('spanTrim indeterminado: la lectura primaria del TB es cero')
  }
  return { ...state, trimGain: (appliedStandard - state.trimOffset) / state.rawInput }
}

/** Lectura primaria del TB: caracterización + sesgo + deriva térmica. */
function transducerReading(
  input: number,
  temperatureDegC: number,
  config: TransmitterConfig,
): number {
  const characterized =
    config.characterization === 'sqrt' ? Math.sqrt(Math.max(0, input)) : input
  const thermalError = config.thermalDriftPerDegC * (temperatureDegC - config.referenceTempDegC)
  return characterized + config.sensorBias + thermalError
}

/**
 * Avanza el transmisor un paso dt [s] con entrada física `input` [unid. ing.].
 * Función pura: no muta el estado, devuelve uno nuevo. La cadena es:
 * TB (lectura + trims) → escalamiento % → clamp 0–100 (limitStatus) →
 * damping de primer orden (actualización exacta) → AI.PV.
 */
export function stepTransmitter(
  state: TransmitterState,
  input: number,
  dt: number,
  temperatureDegC: number = state.config.referenceTempDegC,
): TransmitterState {
  if (state.tbSensorFault) {
    // TB en falla: se retiene el último valor válido y se propaga la mala calidad.
    return { ...state, quality: 'BAD_SENSOR_FAILURE', rb: { ...state.rb, deviceStatus: 'FAILURE' } }
  }

  const rawInput = transducerReading(input, temperatureDegC, state.config)
  const compensated = state.trimGain * rawInput + state.trimOffset

  const span = state.config.urv - state.config.lrv
  const scaled = ((compensated - state.config.lrv) / span) * 100
  let clamped = scaled
  let limitStatus: LimitStatus = 'NOT_LIMITED'
  if (scaled >= 100) {
    clamped = 100
    limitStatus = 'HIGH_LIMITED'
  } else if (scaled <= 0) {
    clamped = 0
    limitStatus = 'LOW_LIMITED'
  }

  const tau = state.config.tau
  const filteredPercent =
    tau > 0
      ? state.filteredPercent + (clamped - state.filteredPercent) * (1 - Math.exp(-dt / tau))
      : clamped

  return {
    ...state,
    rawInput,
    filteredPercent,
    pv: state.config.lrv + (filteredPercent / 100) * span,
    pvPercent: filteredPercent,
    quality: 'GOOD',
    limitStatus,
    rb: { ...state.rb, deviceStatus: 'OK' },
  }
}
