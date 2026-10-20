import { describe, expect, it } from 'vitest'
import { computeFlow, createFlowConfig, KV_PER_CV } from './flow'

const P1 = 80 // bar
const RC_PV = 0.95 * 0.0234 // r_c · Pv (agua, defaults)
const DP_CHOKED = 0.9 ** 2 * (P1 - RC_PV)
const KV_50 = 50 * KV_PER_CV

describe('REQ-FUN-VAL-02 — caudal IEC 60534-2-1 y cavitación crítica', () => {
  it('TC-FUN-VAL-02: √ΔP antes de la cavitación y saturación horizontal después', () => {
    const config = createFlowConfig({ cv: 50, fl: 0.9 })

    // Fase no ahogada: Q = Kv·√(ΔP/G) exacta y crecimiento proporcional a √ΔP
    for (const p2 of [70, 50, 30, 20]) {
      const result = computeFlow(P1, p2, 1, config)
      expect(result.choked).toBe(false)
      expect(result.q).toBe(KV_50 * Math.sqrt((P1 - p2) / config.specificGravity))
    }
    const q70 = computeFlow(P1, 70, 1, config).q
    const q50 = computeFlow(P1, 50, 1, config).q
    expect(q70 / q50).toBeCloseTo(Math.sqrt(10 / 30), 10)

    // Fase ahogada: valor límite horizontal constante (fórmula exacta)
    const qChoked = KV_50 * 0.9 * Math.sqrt((P1 - RC_PV) / config.specificGravity)
    const r15 = computeFlow(P1, 15, 1, config)
    const r10 = computeFlow(P1, 10, 1, config)
    const r5 = computeFlow(P1, 5, 1, config)
    for (const result of [r15, r10, r5]) {
      expect(result.choked).toBe(true)
      expect(result.q).toBe(qChoked)
    }
    // Saturación horizontal: el caudal no crece aunque P2 siga cayendo
    expect(r15.q).toBe(r10.q)
    expect(r10.q).toBe(r5.q)
  })

  it('transición ahogado/no ahogado en ΔP = F_L²·(P1 − r_c·Pv)', () => {
    const config = createFlowConfig({ cv: 50, fl: 0.9 })
    const p2Choked = P1 - DP_CHOKED
    expect(computeFlow(P1, p2Choked + 1e-9, 1, config).choked).toBe(false)
    expect(computeFlow(P1, p2Choked - 1e-9, 1, config).choked).toBe(true)
    expect(computeFlow(P1, p2Choked + 1e-9, 1, config).dpChoked).toBeCloseTo(DP_CHOKED, 12)
  })

  it('equal-percentage: cv efectivo = Cv·R^(x−1)', () => {
    const config = createFlowConfig({
      cv: 50,
      fl: 0.9,
      characteristic: 'equal-percentage',
      rangeability: 50,
    })
    const qFull = computeFlow(P1, 70, 1, config).q
    const qHalf = computeFlow(P1, 70, 0.5, config).q
    expect(qFull).toBe(KV_50 * Math.sqrt(10))
    expect(qHalf / qFull).toBeCloseTo(50 ** -0.5, 12)
  })

  it('sin ΔP positivo no hay caudal', () => {
    const config = createFlowConfig({ cv: 50, fl: 0.9 })
    expect(computeFlow(5, 5, 1, config).q).toBe(0)
    expect(computeFlow(5, 10, 1, config).q).toBe(0)
  })
})
