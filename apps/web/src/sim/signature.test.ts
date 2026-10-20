/**
 * TC-UI-05: el ciclo de firma ejecutado desde la HMI (barrido 3→15→3 psi a
 * 0.05 psi/s, dt = 2 ms) reproduce el lazo de histéresis físico: separación
 * entre ramas al 50% de carrera ≈ 2·F_friction (mismo criterio que
 * TC-FUN-VAL-01, verificado acá contra la API que consume la UI).
 */
import { describe, expect, it } from 'vitest'
import { runSignatureCycle } from './signature'

describe('runSignatureCycle — ciclo de firma para la HMI (EP-04)', () => {
  it('genera ambas ramas y el ancho de histéresis coincide con 2·F_friction', () => {
    const cycle = runSignatureCycle()
    expect(cycle.up.length).toBeGreaterThan(100)
    expect(cycle.down.length).toBeGreaterThan(100)
    // F_friction = 0.15 · 8 psi = 1.2 psi ⇒ ancho esperado 2.4 psi (±1.5%).
    expect(cycle.frictionPsi).toBeCloseTo(1.2, 6)
    expect(Math.abs(cycle.hysteresisPsi - 2.4) / 2.4).toBeLessThanOrEqual(0.015)
  })

  it('recorre el actuador completo: de 0% a 100% de carrera y de vuelta', () => {
    const cycle = runSignatureCycle()
    const travels = (pts: readonly { travelPercent: number }[]) =>
      pts.map((p) => p.travelPercent)
    expect(Math.max(...travels(cycle.up))).toBeGreaterThanOrEqual(99.9)
    expect(Math.min(...travels(cycle.down))).toBeLessThanOrEqual(0.1)
  })
})
