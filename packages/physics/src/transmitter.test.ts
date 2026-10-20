import { describe, expect, it } from 'vitest'
import type { TransmitterState } from './transmitter'
import {
  createTransmitter,
  setRange,
  setSensorFault,
  spanTrim,
  stepTransmitter,
  zeroTrim,
} from './transmitter'

/** Paso de integración usado en los tests [s]. */
const DT = 0.001

function run(state: TransmitterState, input: number, seconds: number): TransmitterState {
  let s = state
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    s = stepTransmitter(s, input, DT)
  }
  return s
}

describe('REQ-FUN-TRM-01 — bloques RB/TB/AI y propagación de calidad', () => {
  it('TC-FUN-TRM-01: respuesta exponencial con τ = 2.0 s y falla de sensor en el mismo paso', () => {
    const tx = createTransmitter({ lrv: 0, urv: 100, tau: 2.0 })

    // Asentado a 10 bar (15τ: residual del arranque en frío ≈ 3·10⁻⁶ %).
    const settled = run(tx, 10, 30)
    expect(settled.pvPercent).toBeCloseTo(10, 4)
    expect(settled.quality).toBe('GOOD')

    // Respuesta de primer orden exacta: PV(t) = 50 + (PV₀ − 50)·e^(−t/τ),
    // verificada al τ y al 3τ.
    const base = settled.pvPercent
    const stepTo = (t: number) => run(settled, 50, t)
    const expectedAt = (t: number) => 50 + (base - 50) * Math.exp(-t / 2.0)
    const atTau = stepTo(2.0)
    const at3Tau = stepTo(6.0)
    console.log(
      `  TC-FUN-TRM-01: PV(τ) = ${atTau.pvPercent.toFixed(4)}% (esperado ${expectedAt(2).toFixed(4)}), ` +
        `PV(3τ) = ${at3Tau.pvPercent.toFixed(4)}% (esperado ${expectedAt(6).toFixed(4)})`,
    )
    expect(atTau.pvPercent).toBeCloseTo(expectedAt(2.0), 4)
    expect(atTau.pv).toBeCloseTo(expectedAt(2.0), 4)
    expect(at3Tau.pvPercent).toBeCloseTo(expectedAt(6.0), 4)

    // Forma de la curva: monótona creciente con incrementos decrecientes.
    const diffs: number[] = []
    let prev = settled.pvPercent
    let s = settled
    for (let k = 1; k <= 16; k++) {
      s = run(s, 50, 0.5)
      diffs.push(s.pvPercent - prev)
      prev = s.pvPercent
    }
    for (let k = 0; k < diffs.length; k++) {
      expect(diffs[k]).toBeGreaterThan(0)
      if (k > 0) expect(diffs[k]).toBeLessThan(diffs[k - 1])
    }

    // TB_Sensor_Fault = TRUE: calidad GOOD → BAD_SENSOR_FAILURE dentro del
    // mismo paso de integración (menos de 10 ms); el RB reporta FAILURE y el
    // AI retiene el último valor válido.
    const faulty = setSensorFault(s, true)
    expect(faulty.quality).toBe('BAD_SENSOR_FAILURE')
    expect(faulty.rb.deviceStatus).toBe('FAILURE')
    expect(faulty.tbSensorFault).toBe(true)
    expect(faulty.pvPercent).toBe(s.pvPercent)

    const afterFaultStep = stepTransmitter(faulty, 80, 0.01)
    expect(afterFaultStep.quality).toBe('BAD_SENSOR_FAILURE')
    expect(afterFaultStep.pvPercent).toBe(s.pvPercent)

    // Al retirar la falla, el TB vuelve a medir: el filtro (τ = 2 s) retoma
    // la marcha hacia la nueva entrada.
    const recovered = stepTransmitter(setSensorFault(afterFaultStep, false), 80, 0.01)
    expect(recovered.quality).toBe('GOOD')
    expect(recovered.rb.deviceStatus).toBe('OK')
    expect(recovered.pvPercent).toBeGreaterThan(s.pvPercent)
    const reSettled = run(recovered, 80, 30) // 15τ
    expect(reSettled.pvPercent).toBeCloseTo(80, 3)
  })

  it('clamping de rango: saturación HIGH/LOW_LIMITED con calidad GOOD', () => {
    let s = createTransmitter({ lrv: 0, urv: 100, tau: 0 })
    s = stepTransmitter(s, 120, DT)
    expect(s.pvPercent).toBe(100)
    expect(s.limitStatus).toBe('HIGH_LIMITED')
    expect(s.quality).toBe('GOOD')
    s = stepTransmitter(s, -5, DT)
    expect(s.pvPercent).toBe(0)
    expect(s.limitStatus).toBe('LOW_LIMITED')
    expect(s.quality).toBe('GOOD')
  })

  it('compensación térmica: la lectura se desvía linealmente con ΔT', () => {
    const config = { lrv: 0, urv: 100, tau: 0, thermalDriftPerDegC: 0.1, referenceTempDegC: 20 }
    const atRef = stepTransmitter(createTransmitter(config), 50, DT, 20)
    expect(atRef.pv).toBeCloseTo(50, 9)
    const at40C = stepTransmitter(createTransmitter(config), 50, DT, 40)
    expect(at40C.pv).toBeCloseTo(50 + 0.1 * 20, 9)
  })
})

describe('REQ-FUN-TRM-02 — autocalibración, re-rango y turndown (vía AMS)', () => {
  it('TC-FUN-TRM-02: setRange(URV = 40 mbar) reescala de 5% a 50.0% (turndown 10:1)', () => {
    let s = run(createTransmitter({ lrv: 0, urv: 400, tau: 0 }), 20, 0.05)
    expect(s.pvPercent).toBeCloseTo(5.0, 12)

    s = setRange(s, 0, 40) // turndown = 400/40 = 10:1, dentro del límite 400:1
    s = stepTransmitter(s, 20, DT)
    expect(s.pvPercent).toBeCloseTo(50.0, 12)
    expect(s.pv).toBeCloseTo(20, 12)
  })

  it('límite de turndown 400:1 y rango inválido se rechazan', () => {
    const tx = createTransmitter({ lrv: 0, urv: 400 })
    // 400:1 exacto es permitido (span mínimo = 1 mbar).
    const ranged = setRange(tx, 0, 1)
    expect(ranged.config.urv).toBe(1)
    // 800:1 supera el límite de configuración.
    expect(() => setRange(tx, 0, 0.5)).toThrow(/turndown/)
    expect(() => setRange(tx, 10, 5)).toThrow(/rango inválido/)
  })

  it('TC-FUN-TRM-02a: zeroTrim corrige el offset del sensor con patrón conocido', () => {
    // Sensor con desviación interna de +2 unidades: a 10 indica 12.
    let s = stepTransmitter(createTransmitter({ lrv: 0, urv: 100, tau: 0, sensorBias: 2 }), 10, DT)
    expect(s.pv).toBeCloseTo(12, 9)
    // Se aplica patrón real de 10 → la indicación queda corregida.
    s = zeroTrim(s, 10)
    s = stepTransmitter(s, 10, DT)
    expect(s.pv).toBeCloseTo(10, 9)
    // La corrección es de offset: a otra presión también compensa el sesgo.
    s = stepTransmitter(s, 60, DT)
    expect(s.pv).toBeCloseTo(60, 9)
  })

  it('TC-FUN-TRM-02b: spanTrim corrige la ganancia con patrón conocido', () => {
    let s = stepTransmitter(createTransmitter({ lrv: 0, urv: 100, tau: 0 }), 0, DT)
    s = zeroTrim(s, 0)
    // A 80 el transmisor lee 80; el patrón dice 72 → ganancia 0.9.
    s = stepTransmitter(s, 80, DT)
    s = spanTrim(s, 72)
    s = stepTransmitter(s, 80, DT)
    expect(s.pv).toBeCloseTo(72, 9)
    // La corrección es de ganancia: punto medio escalado proporcionalmente.
    s = stepTransmitter(s, 40, DT)
    expect(s.pv).toBeCloseTo(36, 9)
  })

})
