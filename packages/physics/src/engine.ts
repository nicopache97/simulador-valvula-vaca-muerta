/**
 * Engine de orquestación EP-03: cierra el lazo válvula + transmisor + PID
 * bajo los escenarios de proceso, con un snapshot serializable por tick.
 *
 * Modelo de planta (mínimo y directo en ambos modos de medición): la válvula
 * estrangula el flujo desde una fuente de presión constante `supplyBar` hacia
 * una vasija de capacidad `capacity` con demanda fija `qDemandNominal`:
 *
 *   Q = computeFlow(supply, V, x)        (IEC 60534-2-1)
 *   dV/dt = (Q − qDemandNominal) / capacity
 *
 * El transmisor mide V (presión aguas abajo de la válvula), así el lazo
 * SP → PID → P_act → válvula → caudal → V → PV es de acción directa para
 * `measure: 'downstream'` (V = P2) y para `measure: 'upstream'` (V = P1,
 * fuente a mayor presión: la válvula alimenta la vasija que es el header P1).
 *
 * El engine es 100% puro y determinista: mismo estado + mismos inputs ⇒ mismo
 * estado nuevo. Sin timers ni relojes (el scheduling vive en el worker), lo
 * que lo hace testeable en Node y reutilizable por la futura FMU (EP-05).
 */

import type {
  SimAlarm,
  SimulationConfig,
  SimulationScenario,
  SimSnapshot,
} from '@sim/shared'
import { computeFlow, createFlowConfig, type FlowConfig, type FlowResult } from './flow'
import { createPid, stepPid, type PidConfig, type PidState } from './pid'
import {
  createTransmitter,
  setSensorFault,
  stepTransmitter,
  type TransmitterConfig,
  type TransmitterState,
} from './transmitter'
import { createValve, step as stepValve, VALVE_DEFAULTS, type ValveConfig, type ValveState } from './valve'

/** Posicioner I/P: salida del PID 0–100% → P_act 3–15 psi (actuador neumático). */
export const ACTUATOR_MIN_PSI = 3
export const ACTUATOR_SPAN_PSI = 12

/** Banda de alarma de desviación SP−PV [bar]. */
export const DEVIATION_BAND_BAR = 5

export interface ResolvedSimulationConfig {
  readonly dt: number
  readonly scenario: SimulationScenario
  readonly measure: 'upstream' | 'downstream'
  readonly supplyBaseBar: number
  readonly vesselNominalBar: number
  readonly backPressureBar: number
  readonly qDemandNominal: number
  readonly capacity: number
  readonly faultAtSec: number
  readonly stepAtSec: number
  readonly stepToBar: number
  readonly rampBarPerSec: number
  readonly rampToBar: number
  readonly valve: ValveConfig
  readonly flow: FlowConfig
  readonly tx: TransmitterConfig
  readonly pid: PidConfig
}

/** Estado completo del engine (las funciones no mutan; devuelven estado nuevo). */
export interface SimulationState {
  readonly config: ResolvedSimulationConfig
  /** Reloj de proceso [s]. */
  readonly t: number
  /** Escenario activo (puede cambiar por `inputs` sin reset). */
  readonly scenario: SimulationScenario
  /** Consigna actual del PID [bar]. */
  readonly spBar: number
  readonly valve: ValveState
  readonly tx: TransmitterState
  readonly pid: PidState
  /** Presión de la vasija controlada V [bar] (la que mide el transmisor). */
  readonly vesselBar: number
  /** Presión de actuador aplicada este tick [psi]. */
  readonly pActPsi: number
  readonly flowQ: number
  readonly choked: boolean
  readonly dpChokedBar: number
}

/** Inputs de un paso; los campos undefined mantienen el valor del estado. */
export interface SimulationInputs {
  readonly spBar?: number
  readonly scenario?: SimulationScenario
}

/** Presión de fuente en el instante t según el escenario. */
function supplyAt(cfg: ResolvedSimulationConfig, scenario: SimulationScenario, t: number): number {
  if (scenario === 'cavitacion') {
    const ramped = cfg.supplyBaseBar + cfg.rampBarPerSec * t
    return Math.min(ramped, cfg.rampToBar)
  }
  if (scenario === 'transitorio_p1' && t >= cfg.stepAtSec) {
    return cfg.stepToBar
  }
  return cfg.supplyBaseBar
}

export function createSimulation(config: SimulationConfig = {}): SimulationState {
  const measure = config.measure ?? 'downstream'
  const supplyBaseBar = config.supplyBar ?? 100
  const vesselNominalBar = config.vesselNominalBar ?? 30
  const dt = config.dt ?? 0.01
  if (!(dt > 0)) {
    throw new Error(`dt inválido: ${dt}`)
  }
  const tx0 = createTransmitter({ lrv: 0, urv: supplyBaseBar, tau: config.txTau ?? 0 })
  const resolved: ResolvedSimulationConfig = {
    dt,
    scenario: config.scenario ?? 'normal',
    measure,
    supplyBaseBar,
    vesselNominalBar,
    backPressureBar: 30,
    qDemandNominal: config.qDemandNominal ?? 150,
    capacity: config.capacity ?? 5,
    faultAtSec: config.faultAtSec ?? 5,
    stepAtSec: config.stepAtSec ?? 10,
    stepToBar: config.stepToBar ?? 140,
    rampBarPerSec: config.rampBarPerSec ?? 0.5,
    rampToBar: config.rampToBar ?? 180,
    valve: {
      ...VALVE_DEFAULTS,
      frictionFraction: config.valveFrictionFraction ?? VALVE_DEFAULTS.frictionFraction,
      deadbandPsi: config.valveDeadbandPsi ?? VALVE_DEFAULTS.deadbandPsi,
    },
    flow: createFlowConfig({ cv: config.cv ?? 50, fl: config.fl ?? 0.9 }),
    tx: tx0.config,
    pid: { kp: config.kp ?? 2, ti: config.ti ?? 8, outMin: 0, outMax: 100 },
  }

  const valve = createValve(resolved.valve)
  const vesselBar = vesselNominalBar
  // Transmisor inicializado coherente con la vasija (τ = 0 → lectura exacta).
  const tx = stepTransmitter(tx0, vesselBar, 0)
  const pid = createPid(resolved.pid)
  const supply = supplyAt(resolved, resolved.scenario, 0)
  const flow: FlowResult = computeFlow(supply, vesselBar, valve.x, resolved.flow)

  return {
    config: resolved,
    t: 0,
    scenario: resolved.scenario,
    spBar: config.spBar ?? vesselNominalBar,
    valve,
    tx,
    pid,
    vesselBar,
    pActPsi: ACTUATOR_MIN_PSI + (ACTUATOR_SPAN_PSI * pid.out) / 100,
    flowQ: flow.q,
    choked: flow.choked,
    dpChokedBar: flow.dpChoked,
  }
}

/**
 * Avanza la simulación un paso dt [s]. Cadena del lazo:
 * SP − PV → PID → P_act (3–15 psi) → dinámica del vástago → caudal IEC 60534
 * → vasija (dV/dt) → transmisor TB→AI (con falla simulable) → PV del próximo tick.
 */
export function stepSimulation(
  sim: SimulationState,
  inputs: SimulationInputs,
  dt: number,
): SimulationState {
  const scenario = inputs.scenario ?? sim.scenario
  const spBar = inputs.spBar ?? sim.spBar
  const t = sim.t + dt

  const pid = stepPid(sim.pid, spBar, sim.tx.pv, dt)
  const pActPsi = ACTUATOR_MIN_PSI + (ACTUATOR_SPAN_PSI * pid.out) / 100
  const valve = stepValve(sim.valve, pActPsi, dt)

  const supply = supplyAt(sim.config, scenario, t)
  const flow = computeFlow(supply, sim.vesselBar, valve.x, sim.config.flow)
  const vesselBar = Math.max(
    0,
    sim.vesselBar + ((flow.q - sim.config.qDemandNominal) / sim.config.capacity) * dt,
  )

  const fault = scenario === 'falla_sensor' && t >= sim.config.faultAtSec
  const tx = stepTransmitter(setSensorFault(sim.tx, fault), vesselBar, dt)

  return {
    ...sim,
    t,
    scenario,
    spBar,
    pid,
    pActPsi,
    valve,
    vesselBar,
    tx,
    flowQ: flow.q,
    choked: flow.choked,
    dpChokedBar: flow.dpChoked,
  }
}

/** Proyecta el estado al snapshot serializable del wire (worker → UI). */
export function toSnapshot(sim: SimulationState): SimSnapshot {
  const cfg = sim.config
  const supply = supplyAt(cfg, sim.scenario, sim.t)
  const upstream = cfg.measure === 'upstream'
  const p1Bar = upstream ? sim.vesselBar : supply
  const p2Bar = upstream ? cfg.backPressureBar : sim.vesselBar

  const alarms: SimAlarm[] = []
  if (sim.tx.quality === 'BAD_SENSOR_FAILURE') {
    alarms.push({
      code: 'SENSOR_FAULT',
      priority: 1,
      message:
        'TB_Sensor_Fault activo: AI.PV retiene el último valor válido (calidad BAD_SENSOR_FAILURE)',
    })
  }
  if (sim.choked) {
    alarms.push({
      code: 'CAVITACION_CRITICA',
      priority: 2,
      message:
        'Caudal saturado por cavitación crítica: ΔP ≥ F_L²·(P1 − r_c·P_v) (flujo ahogado, IEC 60534-2-1)',
    })
  }
  if (Math.abs(sim.spBar - sim.tx.pv) > DEVIATION_BAND_BAR) {
    alarms.push({
      code: 'DESVIACION_SP',
      priority: 3,
      message: `PV fuera de banda: |SP − PV| > ${DEVIATION_BAND_BAR} bar`,
    })
  }
  alarms.sort((a, b) => a.priority - b.priority)

  return {
    t: sim.t,
    dt: cfg.dt,
    spBar: sim.spBar,
    pvBar: sim.tx.pv,
    pvPercent: sim.tx.pvPercent,
    quality: sim.tx.quality,
    valveOpeningPercent: sim.valve.x * 100,
    valveStuck: sim.valve.stuck,
    pActPsi: sim.pActPsi,
    p1Bar,
    p2Bar,
    flowM3h: sim.flowQ,
    choked: sim.choked,
    dpChokedBar: sim.dpChokedBar,
    pidOutPercent: sim.pid.out,
    scenario: sim.scenario,
    alarms,
  }
}
