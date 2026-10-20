/**
 * EP-03 — Tests del engine de orquestación (TC-NFUN-PERF-01, TC-GEN-01
 * acotado y cobertura del protocolo de comandos sobre el engine puro).
 * El engine corre en Node sin DOM/worker: misma lógica que usa el worker.
 */
import { describe, expect, it } from 'vitest'
import {
  createSimulation,
  stepSimulation,
  toSnapshot,
  type SimulationState,
} from './engine'

const DT = 0.01

function runSteps(sim: SimulationState, n: number, inputs = {}): SimulationState {
  let s = sim
  for (let i = 0; i < n; i++) {
    s = stepSimulation(s, inputs, DT)
  }
  return s
}

function expectFiniteSnapshot(s: SimulationState): void {
  const snap = toSnapshot(s)
  for (const value of [
    snap.t,
    snap.spBar,
    snap.pvBar,
    snap.pvPercent,
    snap.valveOpeningPercent,
    snap.pActPsi,
    snap.p1Bar,
    snap.p2Bar,
    snap.flowM3h,
    snap.dpChokedBar,
    snap.pidOutPercent,
  ]) {
    expect(Number.isFinite(value)).toBe(true)
  }
}

describe('TC-NFUN-PERF-01 — 10 000 pasos de 10 ms (EP-03)', () => {
  it('el wall-clock total queda bajo el umbral de 20 s del TC', () => {
    const sim = createSimulation()
    const steps = 10_000 // 100 s de proceso a Δt = 10 ms

    const t0 = performance.now()
    const final = runSteps(sim, steps)
    const wallMs = performance.now() - t0

    const factor = (steps * DT) / (wallMs / 1000)
    console.log(
      `TC-NFUN-PERF-01: ${steps} pasos en ${wallMs.toFixed(1)} ms ` +
        `(≈${(wallMs / steps).toFixed(3)} ms/paso, factor tiempo-real ≈ ${factor.toFixed(0)}×; umbral TC: 20 s)`,
    )
    expect(final.t).toBeCloseTo(steps * DT, 6)
    expect(wallMs).toBeLessThan(20_000)
  })
})

describe('TC-GEN-01 (acotado EP-03) — rampa SP 0→100→0 % a 0.5 %/s', () => {
  it('completa el ciclo sin divergencia numérica (todos los valores finitos)', () => {
    const sim = createSimulation() // urv = 100 bar → 1 % = 1 bar de consigna
    const ratePercentPerSec = 0.5
    const legSec = 100 / ratePercentPerSec // 200 s por ramal
    const totalSteps = Math.round((2 * legSec) / DT) // 40 000 pasos

    let s = sim
    for (let i = 0; i < totalSteps; i++) {
      const phase = i * DT
      const spPercent =
        phase <= legSec ? ratePercentPerSec * phase : 100 - ratePercentPerSec * (phase - legSec)
      s = stepSimulation(s, { spBar: spPercent }, DT)
      expectFiniteSnapshot(s)
    }

    expect(s.t).toBeCloseTo(2 * legSec, 6)
    // Al volver la consigna a 0 la válvula cierra y la vasija vacía hacia 0:
    // el lazo sigue respondiendo (sin bloqueo ni NaN) al final del ciclo.
    const snap = toSnapshot(s)
    expect(snap.pvBar).toBeGreaterThanOrEqual(0)
    expect(Math.abs(snap.pvBar - snap.spBar)).toBeLessThan(10)
  })
})

describe('Engine puro: determinismo y pureza (REQ-GEN-01, base FMU EP-05)', () => {
  it('mismo input ⇒ mismo output (bit a bit en los snapshots)', () => {
    const a = runSteps(createSimulation(), 500, { spBar: 42 })
    const b = runSteps(createSimulation(), 500, { spBar: 42 })
    expect(toSnapshot(a)).toEqual(toSnapshot(b))
  })

  it('stepSimulation no muta el estado de entrada', () => {
    const s0 = createSimulation()
    const before = JSON.stringify(toSnapshot(s0))
    stepSimulation(s0, { spBar: 55 }, DT)
    expect(JSON.stringify(toSnapshot(s0))).toBe(before)
  })
})

describe('Protocolo de comandos sobre el engine (init/start/pause/reset/setSp/setScenario)', () => {
  it('init: snapshot inicial coherente (t = 0, PV = presión nominal de vasija)', () => {
    const snap = toSnapshot(createSimulation())
    expect(snap.t).toBe(0)
    expect(snap.scenario).toBe('normal')
    expect(snap.p1Bar).toBeCloseTo(100, 6) // TC-GEN-01: P1 = 100 bar
    expect(snap.p2Bar).toBeCloseTo(30, 6) // TC-GEN-01: P2 = 30 bar
    expect(snap.pvPercent).toBeCloseTo(30, 6) // 30 bar sobre URV = 100 bar
    expect(snap.quality).toBe('GOOD')
    expect(snap.alarms).toEqual([])
  })

  it('setSp: el PID cierra el lazo y el PV converge al nuevo SP', () => {
    const settled = runSteps(createSimulation(), 3_000, { spBar: 45 }) // 30 s
    const snap = toSnapshot(settled)
    expect(Math.abs(snap.pvBar - 45)).toBeLessThan(1)
    expect(snap.alarms).toEqual([])
  })

  it('setScenario falla_sensor: calidad BAD_SENSOR_FAILURE tras faultAtSec y alarma prioridad 1', () => {
    let s = createSimulation({ scenario: 'falla_sensor', faultAtSec: 2 })
    s = runSteps(s, 100) // t = 1 s: aún GOOD
    expect(toSnapshot(s).quality).toBe('GOOD')
    s = runSteps(s, 200) // t = 3 s: falla inyectada
    const snap = toSnapshot(s)
    expect(snap.quality).toBe('BAD_SENSOR_FAILURE')
    expect(snap.alarms[0]).toMatchObject({ code: 'SENSOR_FAULT', priority: 1 })
  })

  it('setScenario cavitacion: el caudal se satura (choked) al rampar la fuente', () => {
    let s = createSimulation({ scenario: 'cavitacion', rampBarPerSec: 5, rampToBar: 180 })
    s = runSteps(s, 10_000) // t = 100 s → fuente en 180 bar
    const snap = toSnapshot(s)
    expect(snap.p1Bar).toBeCloseTo(180, 6)
    expect(snap.choked).toBe(true)
    expect(snap.alarms.some((a) => a.code === 'CAVITACION_CRITICA' && a.priority === 2)).toBe(true)
    // Caudal límite ahogado: Kv·F_L·√(P1 − r_c·Pv) con x = 1 (x no necesariamente 1;
    // verificar solo que el caudal no supera la cota teórica de apertura total).
    const kv = 50 / 1.156
    const qMax = kv * 0.9 * Math.sqrt(180 - 0.95 * 0.0234)
    expect(snap.flowM3h).toBeLessThanOrEqual(qMax + 1e-6)
  })

  it('setScenario transitorio_p1: escalón de fuente en stepAtSec', () => {
    let s = createSimulation({ scenario: 'transitorio_p1', stepAtSec: 2, stepToBar: 140 })
    s = runSteps(s, 150) // t = 1.5 s
    expect(toSnapshot(s).p1Bar).toBeCloseTo(100, 6)
    s = runSteps(s, 100) // t = 2.5 s
    expect(toSnapshot(s).p1Bar).toBeCloseTo(140, 6)
  })

  it('reset: createSimulation con la misma config reproduce el estado inicial', () => {
    const cfg = { spBar: 48, scenario: 'transitorio_p1' as const }
    const disturbed = runSteps(createSimulation(cfg), 500)
    expect(toSnapshot(disturbed).t).toBeGreaterThan(0)
    const reset = createSimulation(cfg)
    expect(toSnapshot(reset)).toEqual(toSnapshot(createSimulation(cfg)))
  })

  it('la señal mide el lado configurado (measure upstream: PV = P1 de la vasija)', () => {
    const sim = createSimulation({ measure: 'upstream', supplyBar: 150, vesselNominalBar: 100 })
    const snap = toSnapshot(runSteps(sim, 500))
    expect(snap.p1Bar).toBeCloseTo(snap.pvBar, 6)
  })
})
