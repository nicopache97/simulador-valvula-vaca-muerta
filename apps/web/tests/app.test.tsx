import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../src/App'
import { FakeWorker } from './fake-worker'

vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  LineSeries: 'LineSeries',
  createChart: () => ({
    addSeries: () => ({ update: vi.fn() }),
    timeScale: () => ({ fitContent: vi.fn(), applyOptions: vi.fn() }),
    remove: vi.fn(),
  }),
}))

describe('App — ciclo de vida del worker (EP-03/04)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza el título y la versión v0.9.0', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /simulador vaca muerta/i })).toBeInTheDocument()
    expect(screen.getByText('v0.9.0')).toBeInTheDocument()
  })

  it('arranca el worker de simulación con init + start al montar', () => {
    render(<App />)
    const worker = FakeWorker.instances[0]
    expect(worker).toBeDefined()
    expect(worker.url).toBeInstanceOf(URL)
    expect(worker.posted.map((c) => c.type)).toEqual(['init', 'start'])
  })

  it('termina el worker al desmontar', () => {
    const { unmount } = render(<App />)
    const worker = FakeWorker.instances[0]
    unmount()
    expect(worker.terminated).toBe(true)
  })
})
