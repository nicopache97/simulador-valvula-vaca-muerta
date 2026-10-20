/**
 * Tests del protocolo de mensajes del worker (EP-03) sobre `createWorkerLoop`
 * con reloj manual: init/start/pause/reset/setSp/setScenario/exportRequest.
 * El mismo loop corre en el DedicatedWorkerGlobalScope real.
 */
import { describe, expect, it } from 'vitest'
import type { SimEvent } from '@sim/shared'
import { createWorkerLoop, SNAPSHOT_BUFFER_SIZE, type WorkerClock } from './worker-loop'

/** Reloj manual: each now() avanza 5 µs (computeMs determinista por tick). */
function createManualClock() {
  let t = 0
  let callback: (() => void) | null = null
  let liveHandles = 0
  let intervalMs = 0
  const clock: WorkerClock = {
    now: () => {
      const r = t
      t += 0.005
      return r
    },
    setInterval: (cb, ms) => {
      callback = cb
      intervalMs = ms
      liveHandles += 1
      return liveHandles
    },
    clearInterval: () => {
      liveHandles -= 1
    },
  }
  return {
    clock,
    get intervalMs() {
      return intervalMs
    },
    /** Ejecuta un tick como lo haría el timer del worker. */
    fire(): void {
      if (liveHandles <= 0) throw new Error('no hay intervalo activo')
      callback?.()
    },
    get running(): boolean {
      return liveHandles > 0
    },
  }
}

function setup() {
  const manual = createManualClock()
  const events: SimEvent[] = []
  const loop = createWorkerLoop((event) => events.push(event), manual.clock)
  const ticks = events.filter((e) => e.type === 'tick')
  return { manual, events, loop, ticks }
}

describe('WorkerLoop — protocolo worker↔UI (EP-03)', () => {
  it('init postea ready; start instala el intervalo a dt = 10 ms y cada tick postea un snapshot', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'init', config: {} })
    expect(events).toContainEqual({ type: 'ready' })

    loop.dispatch({ type: 'start' })
    expect(manual.intervalMs).toBeCloseTo(10, 6)
    manual.fire()
    manual.fire()
    const ticks = events.filter((e) => e.type === 'tick')
    expect(ticks).toHaveLength(2)
    expect(ticks[1].type === 'tick' && ticks[1].snapshot.t).toBeCloseTo(0.02, 6)
  })

  it('registra métricas de cálculo por paso (computeMs y media)', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    manual.fire()
    const tick = events.find((e) => e.type === 'tick')
    expect(tick).toBeDefined()
    if (tick?.type !== 'tick') return
    expect(tick.computeMs).toBeCloseTo(0.005, 6) // 2 llamadas a now() × 5 µs
    expect(tick.avgComputeMs).toBeCloseTo(0.005, 6)
  })

  it('setSp se aplica en el próximo tick sin reset', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    manual.fire()
    loop.dispatch({ type: 'setSp', spBar: 62 })
    manual.fire()
    const ticks = events.filter((e) => e.type === 'tick')
    const last = ticks[ticks.length - 1]
    if (last.type !== 'tick') throw new Error('tick esperado')
    expect(last.snapshot.spBar).toBe(62)
    expect(last.snapshot.t).toBeCloseTo(0.02, 6) // el reloj de proceso no se reinicia
  })

  it('setScenario se aplica en el próximo tick', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    loop.dispatch({ type: 'setScenario', scenario: 'falla_sensor' })
    manual.fire()
    const tick = events.find((e) => e.type === 'tick')
    if (tick?.type !== 'tick') throw new Error('tick esperado')
    expect(tick.snapshot.scenario).toBe('falla_sensor')
  })

  it('pause detiene el intervalo (no hay más ticks) y start reanuda', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    manual.fire()
    loop.dispatch({ type: 'pause' })
    expect(manual.running).toBe(false)
    expect(() => manual.fire()).toThrow()
    loop.dispatch({ type: 'start' })
    manual.fire()
    const ticks = events.filter((e) => e.type === 'tick')
    expect(ticks).toHaveLength(2)
  })

  it('reset reinicia el reloj de proceso y limpia el buffer de exportación', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    manual.fire()
    manual.fire()
    loop.dispatch({ type: 'reset' })
    manual.fire()
    const ticks = events.filter((e) => e.type === 'tick')
    const last = ticks[ticks.length - 1]
    if (last.type !== 'tick') throw new Error('tick esperado')
    expect(last.snapshot.t).toBeCloseTo(0.01, 6)

    loop.dispatch({ type: 'exportRequest', requestId: 'r1' })
    const exported = events.find((e) => e.type === 'exported')
    if (exported?.type !== 'exported') throw new Error('exported esperado')
    expect(exported.requestId).toBe('r1')
    expect(exported.csv.split('\n')).toHaveLength(2) // header + 1 fila
  })

  it('exportRequest devuelve CSV con header y una fila por tick en buffer', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    for (let i = 0; i < 3; i++) manual.fire()
    loop.dispatch({ type: 'exportRequest', requestId: 'r2' })
    const exported = events.find((e) => e.type === 'exported')
    if (exported?.type !== 'exported') throw new Error('exported esperado')
    const lines = exported.csv.split('\n')
    expect(lines[0]).toBe(
      't,spBar,pvBar,pvPercent,quality,valveOpeningPercent,pActPsi,p1Bar,p2Bar,flowM3h,choked,pidOutPercent,scenario',
    )
    expect(lines).toHaveLength(4)
    expect(lines[1].startsWith('0.01,')).toBe(true)
  })

  it(`el buffer de exportación se recorta a ${SNAPSHOT_BUFFER_SIZE} snapshots`, () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    for (let i = 0; i < SNAPSHOT_BUFFER_SIZE + 10; i++) {
      manual.fire()
    }
    loop.dispatch({ type: 'exportRequest', requestId: 'r3' })
    const exported = events.find((e) => e.type === 'exported')
    if (exported?.type !== 'exported') throw new Error('exported esperado')
    const lines = exported.csv.split('\n')
    expect(lines).toHaveLength(SNAPSHOT_BUFFER_SIZE + 1) // header + buffer lleno
    // El buffer conserva los ticks más recientes (el primero es el tick 11):
    expect(Number(lines[1].split(',')[0])).toBeCloseTo(0.11, 6)
  })
})

describe('WorkerLoop — velocidad y calibración (EP-04)', () => {
  it('setSpeed reprograma el intervalo a dt/speed sin tocar la física (dt intacto)', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    expect(manual.intervalMs).toBeCloseTo(10, 6)

    loop.dispatch({ type: 'setSpeed', speed: 5 })
    expect(manual.intervalMs).toBeCloseTo(2, 6)
    manual.fire()
    const tick = events.filter((e) => e.type === 'tick').at(-1)
    if (tick?.type !== 'tick') throw new Error('tick esperado')
    expect(tick.snapshot.dt).toBeCloseTo(0.01, 6) // el paso físico no cambia
    expect(tick.snapshot.t).toBeCloseTo(0.01, 6)

    // En pausa no reprograma nada, pero conserva la velocidad al reanudar.
    loop.dispatch({ type: 'pause' })
    loop.dispatch({ type: 'setSpeed', speed: 2 })
    expect(manual.running).toBe(false)
    loop.dispatch({ type: 'start' })
    expect(manual.intervalMs).toBeCloseTo(5, 6)
  })

  it('calibrate con setRange(0,40) recalcula pvPercent con la nueva escala (turndown 10:1)', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    for (let i = 0; i < 10; i++) manual.fire()
    const before = events.filter((e) => e.type === 'tick').at(-1)
    if (before?.type !== 'tick') throw new Error('tick esperado')
    const pv0 = before.snapshot.pvBar
    loop.dispatch({ type: 'calibrate', urv: 40 })
    manual.fire()
    manual.fire()
    const after = events.filter((e) => e.type === 'tick').at(-1)
    if (after?.type !== 'tick') throw new Error('tick esperado')
    // El re-rango es digital: la medición física sigue siendo la de la vasija
    // y la escala del FB AI pasa de pv/100 a pv/40 (×2.5).
    expect(after.snapshot.pvPercent).toBeCloseTo((after.snapshot.pvBar / 40) * 100, 6)
    expect(after.snapshot.pvPercent).toBeGreaterThan((pv0 / 100) * 100 * 2) // escalado × >2
  })

  it('calibrate rechaza un rango con turndown superado y postea error (sin mutar el estado)', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    for (let i = 0; i < 3; i++) manual.fire()
    loop.dispatch({ type: 'calibrate', lrv: 0, urv: 0.05 }) // 2000:1 ≫ 400:1
    const err = events.find((e) => e.type === 'error')
    expect(err?.type).toBe('error')
    if (err?.type !== 'error') throw new Error('error esperado')
    expect(err.message).toMatch(/turndown/i)
    manual.fire()
    const tick = events.filter((e) => e.type === 'tick').at(-1)
    if (tick?.type !== 'tick') throw new Error('tick esperado')
    expect(tick.snapshot.pvPercent).toBeLessThanOrEqual(100) // escala original intacta
  })

  it('calibrate aplica damping (τ): el PV se aproxima de a primer orden, sin saltos', () => {
    const { manual, loop, events } = setup()
    loop.dispatch({ type: 'start' })
    for (let i = 0; i < 10; i++) manual.fire() // asentado en ≈ 30%
    loop.dispatch({ type: 'calibrate', tau: 2 })
    loop.dispatch({ type: 'setSp', spBar: 60 }) // forzamos un transitorio
    manual.fire()
    manual.fire()
    const ticks = events.filter((e) => e.type === 'tick').slice(-2)
    const [a, b] = ticks
    if (a?.type !== 'tick' || b?.type !== 'tick') throw new Error('ticks esperados')
    // Respuesta amortiguada: el PV se mueve mucho menos que el escalón SP.
    expect(Math.abs(b.snapshot.pvBar - a.snapshot.pvBar)).toBeLessThan(1)
  })
})
