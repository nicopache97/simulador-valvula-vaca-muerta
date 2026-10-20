/**
 * FMU FMI 3.0 Co-Simulation compilada a WASM (EP-05, REQ-GEN-02 / TC-GEN-02).
 *
 * Port fiel — mismos defaults, mismo orden de operaciones en f64 — del engine
 * puro de @sim/physics (src/engine.ts y sus piezas valve/flow/pid/transmitter).
 * La FMU es stateful por diseño FMI: cada instancia muta su estado, pero cada
 * operación en f64 es idéntica a la del engine TS, por lo que los resultados
 * coinciden bit a bit (ver tests de TC-GEN-02, tolerancia < 1e-9 relativo).
 *
 * Subconjunto de la API C FMI 3.0 (co-simulation), adaptado al ABI de
 * WebAssembly: sin strings ni punteros de callback en la firma; los arrays de
 * valueReferences/values se intercambian por memoria lineal en offsets fijos
 * exportados (SCRATCH_*), igual que la C-API recibe punteros. Subconjunto:
 *   fmi3InstantiateCoSimulation / fmi3FreeInstance
 *   fmi3EnterInitializationMode / fmi3ExitInitializationMode
 *   fmi3SetFloat64 / fmi3GetFloat64 / fmi3SetInt32 / fmi3GetInt32
 *   fmi3DoStep (sin earlyReturn: REQ-FUN-SIM-02 queda fuera de alcance)
 */

// ---------------------------------------------------------------------------
// fmi3Status (FMI 3.0 §4.2): solo se usa OK y Error en este subconjunto.
const FMI_OK: f64 = 0
const FMI_ERROR: f64 = 3

// Posicioner I/P: salida del PID 0–100% → P_act 3–15 psi (engine.ts).
const ACTUATOR_MIN_PSI: f64 = 3
const ACTUATOR_SPAN_PSI: f64 = 12

// 1 Cv (US gpm/√psi) = 1.156 Kv (m³/h/√bar) (flow.ts).
const KV_PER_CV: f64 = 1 / 1.156

// Escenarios (índices de SIMULATION_SCENARIOS de @sim/shared):
// 0 normal, 1 cavitacion, 2 falla_sensor, 3 transitorio_p1.
const SCENARIO_FALLA_SENSOR: i32 = 2

// Calidad de la señal (0 GOOD, 1 UNCERTAIN, 2 BAD_SENSOR_FAILURE); el engine
// solo produce GOOD y BAD_SENSOR_FAILURE.
const QUALITY_GOOD: i32 = 0
const QUALITY_BAD_SENSOR_FAILURE: i32 = 2

// ---------------------------------------------------------------------------
// Área de scratch fija en memoria lineal para el intercambio de arrays
// valueReferences/values (los importadores escriben/leen vía DataView).
export const SCRATCH_VR: i32 = 8 // 64 × i32 (VRs de getters/setters)
export const SCRATCH_F64: i32 = 320 // 64 × f64 (valores Float64)
export const SCRATCH_I32: i32 = 896 // 64 × i32 (valores Int32)

// Value references (también declaradas en resources/modelDescription.xml; los
// tests cruzan ambas fuentes — TC-GEN-02 "asigna correctamente las references
// de valor"):
//   1 spBar [bar]        input      Float64
//   2 scenario           input      Int32 (código de escenario, arriba)
//   10..26               parámetros (ver setFloat64Var/setInt32Var)
//   30 pvPercent         output     Float64  (% de escala del AI)
//   31 valveOpening      output     Float64  (% de carrera)
//   32 pAct              output     Float64  (psi)
//   33 flow              output     Float64  (m³/h)
//   34 choked            output     Float64  (0/1, cavitación crítica)
//   35 quality           output     Int32    (código de calidad)
//   36 pvBar             output     Float64  (AI.PV, bar)
//   37 p1Bar             output     Float64
//   38 p2Bar             output     Float64
//   39 dpChokedBar       output     Float64  (F_L²·(P1 − r_c·P_v))
//   40 pidOutPercent     output     Float64  (salida PID %)
//   41 time              output     Float64  (reloj de proceso [s])
const VR_SP_BAR: i32 = 1
const VR_SCENARIO: i32 = 2

class Instance {
  // Parámetros (defaults = createSimulation() de @sim/physics).
  supplyBaseBar: f64 = 100
  vesselNominalBar: f64 = 30
  qDemandNominal: f64 = 150
  capacity: f64 = 5
  cv: f64 = 50
  fl: f64 = 0.9
  valveFrictionFraction: f64 = 0.15
  valveDeadbandPsi: f64 = 0
  txTau: f64 = 0
  kp: f64 = 2
  ti: f64 = 8
  measure: i32 = 0 // 0 downstream, 1 upstream
  faultAtSec: f64 = 5
  stepAtSec: f64 = 10
  stepToBar: f64 = 140
  rampBarPerSec: f64 = 0.5
  rampToBar: f64 = 180
  // Config hidráulica fija (createFlowConfig defaults; no expuestas).
  specificGravity: f64 = 1
  vaporPressureBar: f64 = 0.0234
  criticalPressureRatio: f64 = 0.95
  // Config válvula fija (VALVE_DEFAULTS; no expuestas).
  springPreloadPsi: f64 = 5
  springRatePsiPerUnit: f64 = 8
  stictionRatio: f64 = 1.5
  mass: f64 = 0.0128
  damping: f64 = 0.576

  // Estado dinámico.
  t: f64 = 0
  scenario: i32 = 0
  spBar: f64 = 30
  // PID.
  integral: f64 = 0
  pidOut: f64 = 0
  // Válvula.
  x: f64 = 0
  v: f64 = 0
  stuck: bool = true
  // Transmisor (τ, LRV/URV como campos; bias/trims/caracterización = defaults
  // del engine: 0, 1 e identity).
  txLrv: f64 = 0
  txUrv: f64 = 100
  filteredPercent: f64 = 0
  pv: f64 = 0
  pvPercent: f64 = 0
  quality: i32 = QUALITY_GOOD
  tbSensorFault: bool = false
  // Proceso.
  vesselBar: f64 = 30
  pActPsi: f64 = ACTUATOR_MIN_PSI
  flowQ: f64 = 0
  choked: bool = false
  dpChokedBar: f64 = 0

  // Inputs pendientes (se consumen en el próximo fmi3DoStep, como
  // SimulationInputs.spBar/scenario del engine).
  pendingSpBar: f64 = 0
  hasPendingSpBar: bool = false
  pendingScenario: i32 = 0
  hasPendingScenario: bool = false

  constructor() {
    this.initState()
  }

  /** supplyAt() de engine.ts: presión de fuente según escenario e instante. */
  supplyAt(scenario: i32, t: f64): f64 {
    if (scenario === 1) {
      const ramped = this.supplyBaseBar + this.rampBarPerSec * t
      return Math.min(ramped, this.rampToBar)
    }
    if (scenario === 3 && t >= this.stepAtSec) {
      return this.stepToBar
    }
    return this.supplyBaseBar
  }

  /** Estado inicial = createSimulation(config) del engine. */
  initState(): void {
    this.txLrv = 0
    this.txUrv = this.supplyBaseBar
    this.t = 0
    this.scenario = this.hasPendingScenario ? this.pendingScenario : 0
    this.spBar = this.hasPendingSpBar ? this.pendingSpBar : this.vesselNominalBar
    this.integral = 0
    this.pidOut = 0
    this.x = 0
    this.v = 0
    this.stuck = true
    this.tbSensorFault = false
    this.quality = QUALITY_GOOD
    this.vesselBar = this.vesselNominalBar
    this.pActPsi = ACTUATOR_MIN_PSI
    // createSimulation: stepTransmitter(tx0, vesselBar, 0) → τ = 0 por defecto
    // deja filteredPercent = clamp(scaled) y pv = LRV + %·span.
    const span = this.txUrv - this.txLrv
    const scaled = ((this.vesselBar - this.txLrv) / span) * 100
    const clamped = Math.min(100, Math.max(0, scaled))
    this.filteredPercent =
      this.txTau > 0 ? this.filteredPercent + (clamped - this.filteredPercent) * 0 : clamped
    this.pv = this.txLrv + (this.filteredPercent / 100) * span
    this.pvPercent = this.filteredPercent
    const supply = this.supplyAt(this.scenario, 0)
    this.computeFlowVars(supply, this.vesselBar, this.x)
  }

  /** computeFlow() de flow.ts (IEC 60534-2-1), característica lineal. */
  computeFlowVars(p1Bar: f64, p2Bar: f64, opening: f64): void {
    const dp = p1Bar - p2Bar
    this.dpChokedBar =
      this.fl * this.fl * (p1Bar - this.criticalPressureRatio * this.vaporPressureBar)
    const kvEffective = this.cv * KV_PER_CV * Math.min(1, Math.max(0, opening))
    if (dp <= 0 || kvEffective <= 0) {
      this.flowQ = 0
      this.choked = false
      return
    }
    if (dp >= this.dpChokedBar) {
      const available = Math.max(0, p1Bar - this.criticalPressureRatio * this.vaporPressureBar)
      this.flowQ = kvEffective * this.fl * Math.sqrt(available / this.specificGravity)
      this.choked = true
      return
    }
    this.flowQ = kvEffective * Math.sqrt(dp / this.specificGravity)
    this.choked = false
  }

  /** Paso de simulación = stepSimulation() del engine (mismo orden). */
  doStep(dt: f64): void {
    this.t += dt
    if (this.hasPendingSpBar) {
      this.spBar = this.pendingSpBar
      this.hasPendingSpBar = false
    }
    if (this.hasPendingScenario) {
      this.scenario = this.pendingScenario
      this.hasPendingScenario = false
    }

    // stepPid: P+I con anti-windup por integración condicional.
    const error = this.spBar - this.pv
    const dIntegral = this.ti > 0 ? (this.kp * error * dt) / this.ti : 0
    const integralCandidate = this.integral + dIntegral
    const outUnclamped = this.kp * error + integralCandidate
    if (outUnclamped >= 100) {
      this.pidOut = 100
    } else if (outUnclamped <= 0) {
      this.pidOut = 0
    } else {
      this.integral = integralCandidate
      this.pidOut = outUnclamped
    }
    this.pActPsi = ACTUATOR_MIN_PSI + (ACTUATOR_SPAN_PSI * this.pidOut) / 100

    // step() de valve.ts: fricción Coulomb con stick-slip + zona muerta.
    const fDyn = this.valveFrictionFraction * this.springRatePsiPerUnit
    const breakawayPsi = this.stictionRatio * fDyn + this.valveDeadbandPsi
    const fNet = this.pActPsi - (this.springPreloadPsi + this.springRatePsiPerUnit * this.x)
    if (this.stuck) {
      if (Math.abs(fNet) <= breakawayPsi) {
        // Vástago pegado: sin movimiento (el engine devuelve el mismo estado).
        this.computeFlowVars(this.supplyAt(this.scenario, this.t), this.vesselBar, this.x)
        this.updateVessel(dt)
        this.updateTransmitter(dt)
        return
      }
      this.stuck = false
      this.v = 0
    }
    const dir = this.v !== 0 ? Math.sign(this.v) : Math.sign(fNet)
    const accel = (fNet - dir * fDyn - this.damping * this.v) / this.mass
    const vNew = this.v + accel * dt
    const xNew = this.x + vNew * dt
    if (vNew * dir < 0) {
      this.v = 0
      this.stuck = true
    } else if (xNew <= 0) {
      this.x = 0
      this.v = 0
      this.stuck = true
    } else if (xNew >= 1) {
      this.x = 1
      this.v = 0
      this.stuck = true
    } else {
      this.x = xNew
      this.v = vNew
    }

    this.computeFlowVars(this.supplyAt(this.scenario, this.t), this.vesselBar, this.x)
    this.updateVessel(dt)
    this.updateTransmitter(dt)
  }

  /** dV/dt = (Q − qDemand)/capacity con piso en 0 (engine.ts). */
  updateVessel(dt: f64): void {
    this.vesselBar = Math.max(
      0,
      this.vesselBar + ((this.flowQ - this.qDemandNominal) / this.capacity) * dt,
    )
  }

  /**
   * stepTransmitter() de transmitter.ts con los defaults del engine
   * (identity, sensorBias 0, deriva térmica 0, trimGain 1, trimOffset 0).
   */
  updateTransmitter(dt: f64): void {
    const fault = this.scenario === SCENARIO_FALLA_SENSOR && this.t >= this.faultAtSec
    if (fault !== this.tbSensorFault) {
      this.tbSensorFault = fault
      this.quality = fault ? QUALITY_BAD_SENSOR_FAILURE : QUALITY_GOOD
    }
    if (this.tbSensorFault) {
      // TB en falla: retiene el último valor válido y propaga mala calidad.
      this.quality = QUALITY_BAD_SENSOR_FAILURE
      return
    }
    const span = this.txUrv - this.txLrv
    const scaled = ((this.vesselBar - this.txLrv) / span) * 100
    const clamped = Math.min(100, Math.max(0, scaled))
    this.filteredPercent =
      this.txTau > 0
        ? this.filteredPercent + (clamped - this.filteredPercent) * (1 - Math.exp(-dt / this.txTau))
        : clamped
    this.pv = this.txLrv + (this.filteredPercent / 100) * span
    this.pvPercent = this.filteredPercent
    this.quality = QUALITY_GOOD
  }

  // p1Bar/p2Bar según toSnapshot() de engine.ts.
  p1Bar(): f64 {
    return this.measure === 1 ? this.vesselBar : this.supplyAt(this.scenario, this.t)
  }
  p2Bar(): f64 {
    return this.measure === 1 ? 30 : this.vesselBar
  }
}

const instances: Array<Instance | null> = new Array<Instance | null>(0)

function getInstance(instance: i32): Instance | null {
  if (instance < 0 || instance >= instances.length) return null
  return instances[instance]
}

// ---------------------------------------------------------------------------
// API FMI 3.0 (subconjunto co-simulation).

export function fmi3InstantiateCoSimulation(): i32 {
  const inst = new Instance()
  instances.push(inst)
  return instances.length - 1
}

export function fmi3FreeInstance(instance: i32): void {
  if (instance >= 0 && instance < instances.length) {
    instances[instance] = null
  }
}

export function fmi3EnterInitializationMode(instance: i32): f64 {
  return getInstance(instance) !== null ? FMI_OK : FMI_ERROR
}

/** Resuelve parámetros y reconstruye el estado (createSimulation del engine). */
export function fmi3ExitInitializationMode(instance: i32): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  inst.initState()
  return FMI_OK
}

/**
 * fmi3DoStep: avanza un paso de comunicación. `communicationStepSize` es el
 * dt del paso (canHandleVariableCommunicationStepSize = true en el XML). El
 * reloj lo lleva la propia instancia (como el engine), así que el subconjunto
 * omite `currentCommunicationPoint`. Sin earlyReturn/lastSuccessfulTime
 * (REQ-FUN-SIM-02 fuera de alcance, decisión registrada en AGENTS.md §4).
 */
export function fmi3DoStep(instance: i32, communicationStepSize: f64): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  if (!(communicationStepSize > 0)) return FMI_ERROR
  inst.doStep(communicationStepSize)
  return FMI_OK
}

function setFloat64Var(inst: Instance, vr: i32, value: f64): bool {
  switch (vr) {
    case VR_SP_BAR:
      inst.pendingSpBar = value
      inst.hasPendingSpBar = true
      return true
    case 10:
      inst.supplyBaseBar = value
      return true
    case 11:
      inst.vesselNominalBar = value
      return true
    case 12:
      inst.qDemandNominal = value
      return true
    case 13:
      inst.capacity = value
      return true
    case 14:
      inst.cv = value
      return true
    case 15:
      inst.fl = value
      return true
    case 16:
      inst.valveFrictionFraction = value
      return true
    case 17:
      inst.valveDeadbandPsi = value
      return true
    case 18:
      inst.txTau = value
      return true
    case 19:
      inst.kp = value
      return true
    case 20:
      inst.ti = value
      return true
    case 22:
      inst.faultAtSec = value
      return true
    case 23:
      inst.stepAtSec = value
      return true
    case 24:
      inst.stepToBar = value
      return true
    case 25:
      inst.rampBarPerSec = value
      return true
    case 26:
      inst.rampToBar = value
      return true
    default:
      return false
  }
}

function getFloat64Var(inst: Instance, vr: i32): f64 {
  switch (vr) {
    case 30:
      return inst.pvPercent
    case 31:
      return inst.x * 100
    case 32:
      return inst.pActPsi
    case 33:
      return inst.flowQ
    case 34:
      return inst.choked ? 1 : 0
    case 36:
      return inst.pv
    case 37:
      return inst.p1Bar()
    case 38:
      return inst.p2Bar()
    case 39:
      return inst.dpChokedBar
    case 40:
      return inst.pidOut
    case 41:
      return inst.t
    case 10:
      return inst.supplyBaseBar
    case 11:
      return inst.vesselNominalBar
    case 12:
      return inst.qDemandNominal
    case 13:
      return inst.capacity
    case 14:
      return inst.cv
    case 15:
      return inst.fl
    case 16:
      return inst.valveFrictionFraction
    case 17:
      return inst.valveDeadbandPsi
    case 18:
      return inst.txTau
    case 19:
      return inst.kp
    case 20:
      return inst.ti
    case 22:
      return inst.faultAtSec
    case 23:
      return inst.stepAtSec
    case 24:
      return inst.stepToBar
    case 25:
      return inst.rampBarPerSec
    case 26:
      return inst.rampToBar
    default:
      // NaN = VR no Float64 válido (los status de FMI se informan aparte).
      return NaN
  }
}

function setInt32Var(inst: Instance, vr: i32, value: i32): bool {
  switch (vr) {
    case VR_SCENARIO:
      inst.pendingScenario = value
      inst.hasPendingScenario = true
      return true
    case 21:
      inst.measure = value
      return true
    default:
      return false
  }
}

function getInt32Var(inst: Instance, vr: i32): i32 {
  switch (vr) {
    case VR_SCENARIO:
      return inst.scenario
    case 21:
      return inst.measure
    case 35:
      return inst.quality
    default:
      return i32.MIN_VALUE
  }
}

export function fmi3SetFloat64(
  instance: i32,
  vrPtr: i32,
  nvr: i32,
  valuesPtr: i32,
  nValues: i32,
): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  if (nValues < nvr) return FMI_ERROR
  for (let i = 0; i < nvr; i++) {
    const vr = load<i32>(vrPtr + i * 4)
    const value = load<f64>(valuesPtr + i * 8)
    if (!setFloat64Var(inst, vr, value)) return FMI_ERROR
  }
  return FMI_OK
}

export function fmi3GetFloat64(
  instance: i32,
  vrPtr: i32,
  nvr: i32,
  valuesPtr: i32,
  nValues: i32,
): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  if (nValues < nvr) return FMI_ERROR
  for (let i = 0; i < nvr; i++) {
    const vr = load<i32>(vrPtr + i * 4)
    store<f64>(valuesPtr + i * 8, getFloat64Var(inst, vr))
  }
  return FMI_OK
}

export function fmi3SetInt32(
  instance: i32,
  vrPtr: i32,
  nvr: i32,
  valuesPtr: i32,
  nValues: i32,
): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  if (nValues < nvr) return FMI_ERROR
  for (let i = 0; i < nvr; i++) {
    const vr = load<i32>(vrPtr + i * 4)
    const value = load<i32>(valuesPtr + i * 4)
    if (!setInt32Var(inst, vr, value)) return FMI_ERROR
  }
  return FMI_OK
}

export function fmi3GetInt32(
  instance: i32,
  vrPtr: i32,
  nvr: i32,
  valuesPtr: i32,
  nValues: i32,
): f64 {
  const inst = getInstance(instance)
  if (inst === null) return FMI_ERROR
  if (nValues < nvr) return FMI_ERROR
  for (let i = 0; i < nvr; i++) {
    const vr = load<i32>(vrPtr + i * 4)
    store<i32>(valuesPtr + i * 4, getInt32Var(inst, vr))
  }
  return FMI_OK
}
