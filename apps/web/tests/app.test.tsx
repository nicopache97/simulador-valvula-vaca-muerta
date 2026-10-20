import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from '../src/App'
import type { SimCommand, SimEvent, SimSnapshot } from '@sim/shared'

class FakeWorker {
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
}

const FAKE_SNAPSHOT: SimSnapshot = {
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

describe('App', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza el título y la versión v0.4.0', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /simulador vaca muerta/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('v0.4.0')).toBeInTheDocument()
  })

  it('arranca el worker de simulación con init + start al montar (EP-03)', () => {
    render(<App />)
    const worker = FakeWorker.instances[0]
    expect(worker).toBeDefined()
    expect(worker.url).toBeInstanceOf(URL)
    expect(worker.posted.map((c) => c.type)).toEqual(['init', 'start'])
  })

  it('muestra el snapshot recibido por tick y termina el worker al desmontar', () => {
    const { unmount } = render(<App />)
    const worker = FakeWorker.instances[0]
    act(() => {
      worker.emit({
        type: 'tick',
        snapshot: FAKE_SNAPSHOT,
        computeMs: 0.004,
        avgComputeMs: 0.004,
      })
    })
    expect(screen.getByTestId('ro-t').textContent).toBe('1.23 s')
    expect(screen.getByTestId('ro-sppv').textContent).toContain('30.0 / 29.8 bar')

    unmount()
    expect(worker.terminated).toBe(true)
  })
})
