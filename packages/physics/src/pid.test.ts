import { describe, expect, it } from 'vitest'
import { createPid, stepPid } from './pid'
import type { PidState } from './pid'

const DT = 0.001

function run(state: PidState, sp: number, pv: number, seconds: number): PidState {
  let s = state
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    s = stepPid(s, sp, pv, DT)
  }
  return s
}

describe('FB PID mínimo (P + I, anti-windup por clamping)', () => {
  it('acción proporcional: salida = Kp·error', () => {
    const pid = createPid({ kp: 2, outMin: -100 })
    expect(stepPid(pid, 60, 50, DT).out).toBeCloseTo(20, 9)
    expect(stepPid(pid, 50, 60, DT).out).toBeCloseTo(-20, 9)
  })

  it('acción integral: crece linealmente Kp·e/Ti y elimina el error estacionario', () => {
    const pid = createPid({ kp: 1, ti: 2 })
    // Error constante e = 10: I(t) = Kp·e·t/Ti → a los 2 s, I = 10.
    const after2s = run(pid, 60, 50, 2)
    expect(after2s.integral).toBeCloseTo(10, 3)
    expect(after2s.out).toBeCloseTo(20, 3)
  })

  it('anti-windup: saturado no acumula integral y no hay sobrepaso al destaturar', () => {
    const pid = createPid({ kp: 1, ti: 10 })
    // e = 100 empuja la salida contra el tope superior (100): I no crece.
    const saturated = run(pid, 100, 0, 5)
    expect(saturated.out).toBe(100)
    expect(saturated.integral).toBe(0)
    // Al bajar la consigna a 50 (e = 50), la salida responde solo con P más
    // un paso de I (50.005): sin anti-windup la integral acumulada en 5 s de
    // saturación (Kp·e·t/Ti = 50) produciría una salida ≈ 100.
    const released = stepPid(saturated, 50, 0, DT)
    expect(released.out).toBeCloseTo(50.005, 6)
    expect(released.integral).toBeCloseTo(0.005, 9)
  })

  it('la salida satura al rango configurado', () => {
    const pid = createPid({ kp: 10, ti: 1, outMin: 0, outMax: 100 })
    const high = stepPid(pid, 100, 0, DT)
    expect(high.out).toBe(100)
    const low = stepPid(pid, -100, 0, DT)
    expect(low.out).toBe(0)
  })
})
