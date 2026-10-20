/**
 * Tests de las mejoras de UX v0.9.0 (reporte del dueño del producto):
 *  1. Nivel 1: el esquema de planta (pozo → FCV-101 → PT-101 → colector)
 *     muestra qué se está operando y navega al Nivel 2 (corrección sobre
 *     REQ-UI-03, esquema de planta faltante).
 *  2. Tendencia: series con color distinto y consistente + codificación
 *     redundante de grosor/trazo + leyenda visible (corrección sobre
 *     REQ-UI-01: la paleta 100% gris no distinguía las series).
 *  3. El símbolo de la válvula refleja la apertura en vivo y muestra el
 *     distintivo "VÁSTAGO PEGADO" cuando el engine reporta stick-slip
 *     (corrección: el símbolo bowtie era estático).
 *  4. Calibración AMS: cada parámetro tiene un botón (i) que despliega su
 *     explicación con consecuencias de subir/bajar (REQ-UI-06, TC-UI-07).
 * Se verifica DOM/atributos/ARIA, no píxeles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../src/App'
import { TREND_SERIES } from '../src/components/trend-series'
import { FakeWorker, fakeSnapshot, tickEvent } from './fake-worker'

/** Series registradas por el chart mockeado (opciones pasadas a addSeries). */
const chartCtx = vi.hoisted(() => ({ added: [] as Record<string, unknown>[] }))

vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  LineSeries: 'LineSeries',
  createChart: () => ({
    addSeries: (_type: unknown, options: Record<string, unknown>) => {
      chartCtx.added.push(options)
      return { update: vi.fn() }
    },
    timeScale: () => ({ fitContent: vi.fn(), applyOptions: vi.fn() }),
    remove: vi.fn(),
  }),
}))

function renderApp(snapshot = fakeSnapshot()) {
  render(<App />)
  const worker = FakeWorker.instances[0]
  act(() => worker.emit(tickEvent(snapshot)))
  return { worker }
}

function goToSkid() {
  fireEvent.click(screen.getByTestId('card-vm-101'))
}

function openCalibration() {
  fireEvent.click(screen.getByTestId('open-calibration-modal'))
}

describe("Mejora 1 — esquema de planta en el Nivel 1 (corrección v0.9.0)", () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra pozo/cabezal, línea de proceso, FCV-101, PT-101 y colector con los tags', () => {
    renderApp(fakeSnapshot({ p1Bar: 100, p2Bar: 29.8, flowM3h: 150.4, valveOpeningPercent: 43.2 }))
    const schematic = screen.getByTestId('plant-schematic')
    expect(schematic).toHaveAccessibleName(/Esquema de planta/)
    expect(within(schematic).getByTestId('plant-wellhead')).toHaveTextContent('Pozo VM-101')
    expect(within(schematic).getByTestId('plant-fcv-101')).toHaveTextContent('FCV-101')
    expect(within(schematic).getByTestId('plant-pt-101')).toHaveTextContent('PT-101')
    expect(within(schematic).getByTestId('plant-manifold')).toHaveTextContent('Colector')
    // Valores vivos del proceso en el esquema.
    expect(schematic).toHaveTextContent('P1 = 100 bar')
    expect(schematic).toHaveTextContent('P2 = 29.8 bar')
    expect(schematic).toHaveTextContent('apertura 43%')
  })

  it('el esquema es clickeable y navega al Nivel 2 (mismo recorrido que la tarjeta)', () => {
    renderApp()
    fireEvent.click(screen.getByTestId('plant-schematic'))
    expect(screen.getByTestId('pid-diagram')).toBeInTheDocument()
  })
})

describe('Mejora 2 — tendencia con series distinguibles (corrección v0.9.0)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    chartCtx.added = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cada serie usa un color distinto y consistente (paleta Okabe-Ito)', () => {
    renderApp()
    goToSkid()
    expect(chartCtx.added).toHaveLength(TREND_SERIES.length)
    const colors = chartCtx.added.map((opts) => opts.color)
    // 6 colores, todos distintos y no-grises (excepción justificada de REQ-UI-01).
    expect(new Set(colors).size).toBe(TREND_SERIES.length)
    for (const def of TREND_SERIES) {
      expect(colors).toContain(def.color)
    }
  })

  it('la codificación es redundante: grosor y trazo difieren entre series clave', () => {
    renderApp()
    goToSkid()
    const by = (key: string) => chartCtx.added[TREND_SERIES.findIndex((d) => d.key === key)]
    // SP punteada (referencia), PV la más gruesa, P2 punteada fina, caudal sólido grueso.
    expect(by('sp').lineStyle).toBe(2) // Dashed
    expect(by('p2').lineStyle).toBe(1) // Dotted
    expect(by('pv').lineWidth).toBe(3)
    expect(by('pos').lineWidth).toBe(2)
    expect(by('flow').lineWidth).toBe(2)
    // Distinguible en grises: grosor y trazo no coinciden entre pares de series.
    const encodings = chartCtx.added.map(
      (o) => `${o.lineWidth}:${o.lineStyle ?? 0}:${o.color}`,
    )
    expect(new Set(encodings).size).toBe(chartCtx.added.length)
  })

  it('la leyenda visible mapea color↔variable para las 6 series', () => {
    renderApp()
    goToSkid()
    const legend = screen.getByTestId('trend-legend')
    for (const def of TREND_SERIES) {
      expect(within(legend).getByText(def.label)).toBeInTheDocument()
    }
    // 6 swatches con el color de su serie (línea SVG, no span con fondo).
    const swatches = legend.querySelectorAll('li svg line')
    expect(swatches).toHaveLength(TREND_SERIES.length)
    const swatchColors = [...swatches].map((el) => el.getAttribute('stroke'))
    for (const def of TREND_SERIES) {
      expect(swatchColors).toContain(def.color)
    }
  })
})

describe('Mejora 3 — válvula con posición en vivo y stick-slip visible (corrección v0.9.0)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el taco del vástago refleja valveOpeningPercent del snapshot y se actualiza en vivo', async () => {
    const { worker } = renderApp(fakeSnapshot({ valveOpeningPercent: 43.2 }))
    goToSkid()
    const plug = screen.getByTestId('valve-plug')
    expect(plug).toHaveAttribute('data-travel', '43.2')
    const y1 = plug.getAttribute('y')
    // Los indicadores se deciman a 100 ms en el provider: esperar el refresh.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120))
    })
    act(() => worker.emit(tickEvent(fakeSnapshot({ valveOpeningPercent: 80.4 }))))
    expect(screen.getByTestId('valve-plug')).toHaveAttribute('data-travel', '80.4')
    expect(screen.getByTestId('valve-plug').getAttribute('y')).not.toBe(y1)
  })

  it('con vástago libre no hay distintivo de pegado', () => {
    renderApp(fakeSnapshot({ valveStuck: false }))
    goToSkid()
    expect(screen.queryByTestId('valve-stuck-badge')).not.toBeInTheDocument()
    expect(screen.getByTestId('pid-fcv-101')).toHaveAccessibleName(/FCV-101 válvula de control/)
  })

  it('con valveStuck=true aparece el distintivo "VÁSTAGO PEGADO" y el aria lo nombra', () => {
    renderApp(fakeSnapshot({ valveStuck: true }))
    goToSkid()
    expect(screen.getByTestId('valve-stuck-badge')).toHaveTextContent('VÁSTAGO PEGADO')
    expect(screen.getByTestId('pid-fcv-101')).toHaveAccessibleName(/vástago pegado/)
  })
})

describe('Mejora 4 — ayuda contextual en Calibración AMS (REQ-UI-06, TC-UI-07)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const PARAMS = ['lrv', 'urv', 'tau', 'zero', 'span'] as const

  it('cada parámetro expone su botón (i) con aria-expanded', () => {
    renderApp()
    goToSkid()
    openCalibration()
    for (const p of PARAMS) {
      const btn = screen.getByTestId(`help-${p}`)
      expect(btn).toHaveAccessibleName(/^Ayuda:/)
      expect(btn).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('(i) de damping explica qué es τ y las consecuencias de subirlo/bajarlo', () => {
    renderApp()
    goToSkid()
    openCalibration()
    fireEvent.click(screen.getByTestId('help-tau'))
    const panel = screen.getByTestId('help-tau-panel')
    expect(panel).toHaveTextContent(/primer orden/)
    expect(panel).toHaveTextContent(/SUBIRLO: tendencia estable/)
    expect(panel).toHaveTextContent(/BAJARLO: lectura más viva/)
    // Dato concreto de Vaca Muerta.
    expect(panel).toHaveTextContent(/pulsación típica/)
  })

  it('(i) de LRV/URV explica el re-rango digital y el riesgo de saturación (LOW/HIGH_LIMITED)', () => {
    renderApp()
    goToSkid()
    openCalibration()
    fireEvent.click(screen.getByTestId('help-lrv'))
    expect(screen.getByTestId('help-lrv-panel')).toHaveTextContent(/LOW_LIMITED/)
    expect(screen.getByTestId('help-lrv-panel')).toHaveTextContent(/turndown 10:1/)
    fireEvent.click(screen.getByTestId('help-urv'))
    expect(screen.getByTestId('help-urv-panel')).toHaveTextContent(/HIGH_LIMITED/)
    expect(screen.getByTestId('help-urv-panel')).toHaveTextContent(/400:1/)
    // Un solo panel abierto a la vez.
    expect(screen.queryByTestId('help-lrv-panel')).not.toBeInTheDocument()
  })

  it('(i) de Zero/Span Trim distingue offset constante vs ganancia proporcional', () => {
    renderApp()
    goToSkid()
    openCalibration()
    fireEvent.click(screen.getByTestId('help-zero'))
    const zero = screen.getByTestId('help-zero-panel')
    expect(zero).toHaveTextContent(/OFFSET/)
    expect(zero).toHaveTextContent(/HART cmd 35/)
    expect(zero).toHaveTextContent(/\+0\.8/)
    fireEvent.click(screen.getByTestId('help-span'))
    const span = screen.getByTestId('help-span-panel')
    expect(span).toHaveTextContent(/GANANCIA/)
    expect(span).toHaveTextContent(/HART cmd 36/)
    expect(span).toHaveTextContent(/PROPORCIONAL/)
    expect(screen.queryByTestId('help-zero-panel')).not.toBeInTheDocument()
  })

  it('volver a clickear el (i) cierra el panel', () => {
    renderApp()
    goToSkid()
    openCalibration()
    fireEvent.click(screen.getByTestId('help-tau'))
    expect(screen.getByTestId('help-tau-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('help-tau'))
    expect(screen.queryByTestId('help-tau-panel')).not.toBeInTheDocument()
  })
})
