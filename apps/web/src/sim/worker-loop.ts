/**
 * Loop del worker de simulación (EP-03): orquesta el engine puro de
 * `@sim/physics` a la frecuencia configurada (default 100 Hz) y postea
 * snapshots. El scheduling usa `setInterval` (no existe rAF en workers);
 * sin compensación de deriva por simplicidad — el reloj de proceso se
 * acumula de los dt físicos, no del wall-clock, así que la deriva del timer
 * nunca corrompe la física (solo añade jitter a la cadencia de ticks).
 *
 * Reloj y `post` se inyectan: el engine sigue siendo el mismo en Node
 * (testeable sin DOM ni Worker real) y solo este módulo conoce timers.
 */
import {
  createSimulation,
  setRange,
  spanTrim,
  stepSimulation,
  toSnapshot,
  zeroTrim,
  type SimulationState,
} from '@sim/physics'
import type {
  SimCalibrateCommand,
  SimCommand,
  SimEvent,
  SimulationConfig,
  SimulationScenario,
  SimSnapshot,
  SimSpeed,
} from '@sim/shared'

/** Reloj inyectable (el worker pasa setInterval/performance.now). */
export interface WorkerClock {
  now(): number
  setInterval(cb: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

export const defaultClock: WorkerClock = {
  now: () => performance.now(),
  setInterval: (cb, ms) => setInterval(cb, ms),
  clearInterval: (handle) => clearInterval(handle as Parameters<typeof clearInterval>[0]),
}

/** Snapshots retenidos para exportación (~100 s de tendencia a 100 Hz). */
export const SNAPSHOT_BUFFER_SIZE = 10_000

const CSV_HEADER =
  't,spBar,pvBar,pvPercent,quality,valveOpeningPercent,pActPsi,p1Bar,p2Bar,flowM3h,choked,pidOutPercent,scenario'

function snapshotRow(s: SimSnapshot): string {
  return [
    s.t,
    s.spBar,
    s.pvBar,
    s.pvPercent,
    s.quality,
    s.valveOpeningPercent,
    s.pActPsi,
    s.p1Bar,
    s.p2Bar,
    s.flowM3h,
    s.choked ? 1 : 0,
    s.pidOutPercent,
    s.scenario,
  ].join(',')
}

export interface WorkerLoop {
  dispatch(cmd: SimCommand): void
  /** Detiene el intervalo (cleanup al cerrar el worker). */
  dispose(): void
}

export function createWorkerLoop(
  post: (event: SimEvent) => void,
  clock: WorkerClock = defaultClock,
): WorkerLoop {
  let config: SimulationConfig = {}
  let state: SimulationState = createSimulation(config)
  let running = false
  let handle: unknown
  let speed: SimSpeed = 1
  let pendingSp: number | undefined
  let pendingScenario: SimulationScenario | undefined
  let tickCount = 0
  let avgComputeMs = 0
  const buffer: SimSnapshot[] = []

  function tick(): void {
    const t0 = clock.now()
    state = stepSimulation(
      state,
      { spBar: pendingSp, scenario: pendingScenario },
      state.config.dt,
    )
    pendingSp = undefined
    pendingScenario = undefined
    const computeMs = clock.now() - t0
    tickCount += 1
    avgComputeMs += (computeMs - avgComputeMs) / tickCount

    const snapshot = toSnapshot(state)
    buffer.push(snapshot)
    if (buffer.length > SNAPSHOT_BUFFER_SIZE) buffer.shift()
    post({ type: 'tick', snapshot, computeMs, avgComputeMs })
  }

  function start(): void {
    if (running) return
    running = true
    handle = clock.setInterval(tick, (state.config.dt * 1000) / speed)
  }

  /** Re-programa el intervalo con la velocidad actual (si está corriendo). */
  function reschedule(): void {
    if (!running) return
    clock.clearInterval(handle)
    handle = clock.setInterval(tick, (state.config.dt * 1000) / speed)
  }

  /** Aplica los comandos AMS/HART al transmisor vivo del estado. */
  function calibrate(cmd: SimCalibrateCommand): void {
    try {
      let tx = state.tx
      if (cmd.zeroTrim !== undefined) tx = zeroTrim(tx, cmd.zeroTrim)
      if (cmd.spanTrim !== undefined) tx = spanTrim(tx, cmd.spanTrim)
      if (cmd.lrv !== undefined || cmd.urv !== undefined) {
        tx = setRange(tx, cmd.lrv ?? tx.config.lrv, cmd.urv ?? tx.config.urv)
      }
      if (cmd.tau !== undefined) tx = { ...tx, config: { ...tx.config, tau: cmd.tau } }
      state = { ...state, tx }
    } catch (error) {
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  function pause(): void {
    if (!running) return
    running = false
    clock.clearInterval(handle)
  }

  function reset(): void {
    state = createSimulation(config)
    buffer.length = 0
    tickCount = 0
    avgComputeMs = 0
    pendingSp = undefined
    pendingScenario = undefined
  }

  function dispatch(cmd: SimCommand): void {
    switch (cmd.type) {
      case 'init':
        config = cmd.config
        reset()
        post({ type: 'ready' })
        break
      case 'start':
        start()
        break
      case 'pause':
        pause()
        break
      case 'reset':
        reset()
        break
      case 'setSp':
        pendingSp = cmd.spBar
        break
      case 'setScenario':
        pendingScenario = cmd.scenario
        break
      case 'exportRequest':
        post({
          type: 'exported',
          requestId: cmd.requestId,
          csv: [CSV_HEADER, ...buffer.map(snapshotRow)].join('\n'),
        })
        break
      case 'setSpeed':
        speed = cmd.speed
        reschedule()
        break
      case 'calibrate':
        calibrate(cmd)
        break
    }
  }

  return { dispatch, dispose: pause }
}
