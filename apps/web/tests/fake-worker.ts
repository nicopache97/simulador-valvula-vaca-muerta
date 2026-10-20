/**
 * Worker falso para tests de la HMI: captura los comandos posteados y deja
 * emitir eventos como lo haría el worker real (EP-03/04).
 */
import type { SimCommand, SimEvent, SimSnapshot } from '@sim/shared'

export class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<SimEvent>) => void) | null = null
  posted: SimCommand[] = []
  terminated = false

  constructor(public readonly url: unknown) {
    FakeWorker.instances.push(this)
  }

  postMessage(cmd: SimCommand): void {
    this.posted.push(cmd)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(event: SimEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<SimEvent>)
  }

  commandsOfType<T extends SimCommand['type']>(type: T): Extract<SimCommand, { type: T }>[] {
    return this.posted.filter((c): c is Extract<SimCommand, { type: T }> => c.type === type)
  }
}

export const BASE_SNAPSHOT: SimSnapshot = {
  t: 1.23,
  dt: 0.01,
  spBar: 30,
  pvBar: 29.8,
  pvPercent: 29.8,
  quality: 'GOOD',
  valveOpeningPercent: 43.2,
  valveStuck: false,
  pActPsi: 8.18,
  p1Bar: 100,
  p2Bar: 29.8,
  flowM3h: 150.4,
  choked: false,
  dpChokedBar: 80.98,
  pidOutPercent: 43.2,
  scenario: 'normal',
  alarms: [],
}

export function fakeSnapshot(overrides: Partial<SimSnapshot> = {}): SimSnapshot {
  return { ...BASE_SNAPSHOT, ...overrides }
}

export function tickEvent(snapshot: SimSnapshot): SimEvent {
  return { type: 'tick', snapshot, computeMs: 0.004, avgComputeMs: 0.004 }
}
