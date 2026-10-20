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
