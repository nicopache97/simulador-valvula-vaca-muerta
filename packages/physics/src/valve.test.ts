import { describe, expect, it } from 'vitest'
import { createValve, dynamicFrictionPsi, springPressurePsi, step } from './valve'
import type { ValveState } from './valve'

/** Paso de integración usado en los tests [s]. */
const DT = 0.002

function settle(state: ValveState, pActPsi: number, seconds: number): ValveState {
  let s = state
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    s = step(s, pActPsi, DT)
  }
  return s
}

interface Sample {
  p: number
  x: number
}

/**
 * Barrido continuo de P_act entre pFrom y pTo a velocidad constante [psi/s],
 * muestreando cada 0.1 psi (incrementos del TC-FUN-VAL-01). La rampa es
 * continua (no escalones con espera) para que el vástago deslice en régimen
 * quasi-estático: con holds discretos aparecería stick-slip que aliasearía
 * la medición de la separación del lazo.
 */
function sweep(
  initial: ValveState,
  pFrom: number,
  pTo: number,
  ratePsiPerSec: number,
): { samples: Sample[]; end: ValveState } {
  const steps = Math.ceil(Math.abs(pTo - pFrom) / ratePsiPerSec / DT)
  const dp = (pTo - pFrom) / steps
  const samples: Sample[] = []
  let nextSample = pFrom + Math.sign(dp) * 0.1
  let s = initial
  for (let i = 0; i < steps; i++) {
    const p = pFrom + dp * (i + 1)
    s = step(s, p, DT)
    const crossed = dp > 0 ? p >= nextSample : p <= nextSample
    if (crossed) {
      samples.push({ p, x: s.x })
      nextSample += Math.sign(dp) * 0.1
    }
  }
  return { samples, end: s }
}

/** Presión a la que el barrido cruza la carrera objetivo (interpolación lineal). */
function pressureAtX(samples: Sample[], targetX: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if ((a.x - targetX) * (b.x - targetX) <= 0 && b.x !== a.x) {
      return a.p + ((targetX - a.x) * (b.p - a.p)) / (b.x - a.x)
    }
  }
  throw new Error(`la carrera ${targetX} no fue alcanzada en el barrido`)
}

describe('REQ-FUN-VAL-01 — firma de válvula (P_act vs. carrera)', () => {
  it('TC-FUN-VAL-01: separación del lazo al 50% = 2·F_friction ±1.5% y lazo cerrado', () => {
    const valve = createValve({ frictionFraction: 0.15 })
    const rate = 0.05 // psi/s

    const up = sweep(valve, 3, 15, rate)
    const down = sweep(up.end, 15, 3, rate)

    const fFriction = dynamicFrictionPsi(valve.config) // 0.15 · 8 psi = 1.2 psi
    const separation = pressureAtX(up.samples, 0.5) - pressureAtX(down.samples, 0.5)
    const expected = 2 * fFriction
    console.log(
      `  TC-FUN-VAL-01: separación al 50% = ${separation.toFixed(4)} psi (esperada ${expected} psi)`,
    )

    expect(separation).toBeGreaterThan(0)
    expect(Math.abs(separation - expected) / expected).toBeLessThanOrEqual(0.015)

    // El lazo cierra: al volver a 3 psi el vástago vuelve al asiento inicial.
    expect(valve.x).toBe(0)
    expect(down.end.x).toBe(0)
    expect(down.end.stuck).toBe(true)
    expect(Math.abs(down.end.x - valve.x)).toBeLessThan(0.005)

    // La apertura máxima se alcanza (la válvula abre por completo en el barrido).
    expect(Math.max(...up.samples.map((s) => s.x))).toBeGreaterThanOrEqual(0.99)
  })

  it('resorte: el equilibrio bajo presión constante coincide con el balance analítico', () => {
    const valve = createValve()
    const settled = settle(valve, 9, 5)
    // Equilibrio en deslizamiento ascendente: P_act = P_resorte(x) + F_dyn
    const expectedX = (9 - springPressurePsi(0, valve.config) - dynamicFrictionPsi(valve.config)) / 8
    expect(settled.x).toBeCloseTo(expectedX, 2)
    expect(settled.stuck).toBe(true)
  })

  it('zona muerta: desplazamientos dentro de la banda no despegan el vástago', () => {
    // Vástago en equilibrio a 25%: P_resorte = 5 + 8·0.25 = 7 psi
    const restPsi = springPressurePsi(0.25, createValve().config)
    const without = createValve({ initialOpening: 0.25, deadbandPsi: 0 })
    const withDb = createValve({ initialOpening: 0.25, deadbandPsi: 1 })

    // ΔP = 2.3 psi: supera F_estática (1.8) pero no F_estática + zona muerta (2.8)
    const moved = settle(without, restPsi + 2.3, 5)
    const held = settle(withDb, restPsi + 2.3, 5)
    expect(moved.x).toBeCloseTo((restPsi + 2.3 - 5 - dynamicFrictionPsi(without.config)) / 8, 2)
    expect(held.x).toBe(0.25)
    expect(held.stuck).toBe(true)

    // Al superar la banda acumulada, el vástago con zona muerta despega
    const released = settle(held, restPsi + 2.3 + 1, 5)
    expect(released.x).toBeCloseTo(
      (restPsi + 3.3 - 5 - dynamicFrictionPsi(withDb.config)) / 8,
      2,
    )
  })

  it('rendimiento: 100 000 pasos dentro del presupuesto de tiempo real (REQ-NFUN-PERF-01)', () => {
    let s = createValve()
    const t0 = performance.now()
    for (let i = 0; i < 100_000; i++) {
      s = step(s, 3 + 12 * (i / 100_000), 0.01)
    }
    const elapsedMs = performance.now() - t0
    console.log(`  100 000 pasos de válvula: ${elapsedMs.toFixed(1)} ms total`)
    expect(elapsedMs).toBeLessThan(2_000)
    expect(s.x).toBeGreaterThan(0.9)
  })
})
