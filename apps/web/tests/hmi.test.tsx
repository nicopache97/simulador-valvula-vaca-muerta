/**
 * Tests de la HMI de 4 niveles (EP-04, REQ-UI-01..04): render de niveles,
 * navegación a ≤ 2 clics, bloqueo de calibración por rol Operador,
 * símbolos de alarma con forma + código (ISA-18.2) y panel de explicación
 * contextual. Se testea DOM/ARIA/estados, no píxeles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../src/App'
import type { SimAlarm } from '@sim/shared'
import { fakeSnapshot, FakeWorker, tickEvent } from './fake-worker'

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

const ALARMS: readonly SimAlarm[] = [
  { code: 'SENSOR_FAULT', priority: 1, message: 'TB_Sensor_Fault activo' },
  { code: 'CAVITACION_CRITICA', priority: 2, message: 'Caudal saturado por cavitación' },
  { code: 'DESVIACION_SP', priority: 3, message: 'PV fuera de banda' },
]

function renderApp(snapshot = fakeSnapshot()) {
  render(<App />)
  const worker = FakeWorker.instances[0]
  act(() => worker.emit(tickEvent(snapshot)))
  return { worker }
}

function goToSkid() {
  fireEvent.click(screen.getByTestId('card-vm-101'))
}

describe('HMI EP-04 — barra superior global', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra controles ▶/⏮ (o ⏸ si corre), reloj de proceso, campana y selector de rol', () => {
    renderApp()
    expect(screen.getByLabelText('Pausar simulación')).toBeInTheDocument()
    expect(screen.getByLabelText('Reiniciar simulación')).toBeInTheDocument()
    expect(screen.getByTestId('process-clock')).toHaveTextContent('00:01')
    expect(screen.getByTestId('alarm-bell')).toHaveAccessibleName('Sin alarmas activas')
    expect(screen.getByLabelText('Rol de usuario')).toHaveValue('OPERATOR')
    expect(screen.getByLabelText('Velocidad de simulación')).toHaveValue('1')
  })

  it('▶/⏸/⏮ y velocidad postean los comandos del protocolo', () => {
    const { worker } = renderApp()
    fireEvent.click(screen.getByLabelText('Pausar simulación'))
    expect(worker.commandsOfType('pause')).toHaveLength(1)
    expect(screen.getByLabelText('Reanudar simulación')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Reanudar simulación'))
    expect(worker.commandsOfType('start')).toHaveLength(2) // montaje + reanudar
    fireEvent.click(screen.getByLabelText('Reiniciar simulación'))
    expect(worker.commandsOfType('reset')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Velocidad de simulación'), { target: { value: '5' } })
    expect(worker.commandsOfType('setSpeed')[0]).toEqual({ type: 'setSpeed', speed: 5 })
  })

  it('la campana lleva contador de alarmas activas (aria-live)', () => {
    renderApp(fakeSnapshot({ alarms: [...ALARMS] }))
    expect(screen.getByTestId('alarm-count')).toHaveTextContent('3')
    expect(screen.getByTestId('alarm-bell')).toHaveAccessibleName('3 alarmas activas')
  })

  it('sin backend responde "modo offline" en el indicador de servidor', () => {
    renderApp()
    expect(screen.getByTestId('server-status')).toHaveTextContent('modo offline')
  })
})

describe('HMI EP-04 — Nivel 1 (macro yacimiento)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza KPIs, tarjeta del patín y resumen de alarmas', () => {
    renderApp(fakeSnapshot({ flowM3h: 150.4, alarms: [...ALARMS] }))
    expect(screen.getByTestId('kpi-flow')).toHaveTextContent('150 m³/h')
    expect(screen.getByTestId('kpi-alarms')).toHaveTextContent('3')
    expect(screen.getByTestId('card-vm-101')).toBeInTheDocument()
    expect(screen.getByTestId('alarm-summary')).toBeInTheDocument()
  })

  it('codifica alarmas con forma + número ISA-18.2 (REQ-UI-04)', () => {
    renderApp(fakeSnapshot({ alarms: [...ALARMS] }))
    const p1 = screen.getByTestId('alarm-symbol-1')
    const p2 = screen.getByTestId('alarm-symbol-2')
    const p3 = screen.getByTestId('alarm-symbol-3')
    expect(p1).toHaveAccessibleName(/prioridad 1/)
    expect(p2).toHaveAccessibleName(/prioridad 2/)
    expect(p3).toHaveAccessibleName(/prioridad 3/)
    // Formas distintas: distinguibles en escala de grises por la geometría.
    expect(p1.querySelector('rect')).not.toBeNull() // cuadrado
    expect(p2.querySelector('polygon')).not.toBeNull() // triángulo
    expect(p3.querySelector('circle')).not.toBeNull() // círculo
    expect(within(p1).getByText('1')).toBeInTheDocument()
    expect(within(p2).getByText('2')).toBeInTheDocument()
    expect(within(p3).getByText('3')).toBeInTheDocument()
  })
})

describe('HMI EP-04 — navegación de 4 niveles (REQ-UI-03)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Nivel 2 accesible en 1 clic desde la pantalla principal', () => {
    renderApp()
    goToSkid()
    expect(screen.getByTestId('pid-diagram')).toBeInTheDocument()
    expect(screen.getByLabelText(/FCV-101 válvula de control/)).toBeInTheDocument()
    expect(screen.getByLabelText(/PT-101 transmisor de presión/)).toBeInTheDocument()
  })

  it('Nivel 3 accesible en 2 clics (tarjeta → FCV-101) y vuelve atrás', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByLabelText(/FCV-101 válvula de control/))
    expect(screen.getByText(/Nivel 3 · FCV-101/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'VM-101' }))
    expect(screen.getByTestId('pid-diagram')).toBeInTheDocument()
  })

  it('Nivel 4 accesible en 2 clics (tarjeta → botón de diagnóstico)', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByTestId('open-signature-modal'))
    expect(screen.getByRole('dialog', { name: 'Diagnóstico Nivel 4' })).toBeInTheDocument()
    expect(screen.getByTestId('tab-signature')).toHaveAttribute('aria-selected', 'true')
  })

  it('PT-101 abre el Nivel 4 directo en la pestaña de calibración', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByLabelText(/PT-101 transmisor de presión/))
    expect(screen.getByRole('dialog', { name: 'Diagnóstico Nivel 4' })).toBeInTheDocument()
    expect(screen.getByTestId('tab-calibration')).toHaveAttribute('aria-selected', 'true')
  })
})

describe('HMI EP-04 — Nivel 2 (operación del patín)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el slider de consigna postea setSp y el selector de escenario postea setScenario', () => {
    const { worker } = renderApp()
    goToSkid()
    fireEvent.change(screen.getByTestId('sp-slider'), { target: { value: '62' } })
    expect(worker.commandsOfType('setSp').at(-1)).toEqual({ type: 'setSp', spBar: 62 })
    fireEvent.change(screen.getByLabelText('Escenario de proceso'), {
      target: { value: 'cavitacion' },
    })
    expect(worker.commandsOfType('setScenario').at(-1)).toEqual({
      type: 'setScenario',
      scenario: 'cavitacion',
    })
  })

  it('exportar tendencia postea exportRequest y muestra el estado al recibir el CSV', () => {
    const { worker } = renderApp()
    goToSkid()
    fireEvent.click(screen.getByRole('button', { name: 'Exportar tendencia CSV' }))
    const requests = worker.commandsOfType('exportRequest')
    expect(requests).toHaveLength(1)
    act(() =>
      worker.emit({
        type: 'exported',
        requestId: requests[0].requestId,
        csv: 'h1,h2\n1,2\n',
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Tendencia exportada: 2 filas')
  })
})

describe('HMI EP-04 — Nivel 3 (indicadores con bandas y explicación contextual)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('los indicadores de barra exponen rango normal y límite de alarma (REQ-UI-02)', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByLabelText(/FCV-101 válvula de control/))
    const flowMeter = screen.getByRole('meter', { name: /Caudal/ })
    expect(flowMeter).toHaveAttribute('aria-valuenow', '150.4')
    expect(screen.getByTestId('bi-flow-normal-band')).toBeInTheDocument()
    expect(screen.getByTestId('bi-flow-alarm-zone')).toBeInTheDocument()
  })

  it('sin condiciones anómalas no hay panel de explicación', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByLabelText(/FCV-101 válvula de control/))
    expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument()
  })

  it('con cavitación crítica aparece el panel con la condición F_L²·(P1 − r_c·P_v)', () => {
    renderApp(fakeSnapshot({ choked: true, alarms: [ALARMS[1]] }))
    goToSkid()
    fireEvent.click(screen.getByLabelText(/FCV-101 válvula de control/))
    const panel = screen.getByTestId('explanation-panel')
    expect(panel).toBeInTheDocument()
    expect(screen.getByTestId('explain-choked')).toHaveTextContent(/F_L²·\(P1 − r_c·P_v\)/)
  })

  it('con vástago pegado o sensor en falla explica stick-slip o TB_Sensor_Fault', () => {
    renderApp(fakeSnapshot({ valveStuck: true, quality: 'BAD_SENSOR_FAILURE' }))
    goToSkid()
    fireEvent.click(screen.getByLabelText(/FCV-101 válvula de control/))
    expect(screen.getByTestId('explain-stuck')).toBeInTheDocument()
    expect(screen.getByTestId('explain-sensor-fault')).toBeInTheDocument()
  })
})

describe('HMI EP-04 — Nivel 4 (firma de válvula y calibración AMS)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el ciclo de firma traza el lazo y reporta el ancho de histéresis', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByTestId('open-signature-modal'))
    expect(screen.getByTestId('signature-chart')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('run-signature'))
    expect(screen.getByTestId('signature-branch-up')).toBeInTheDocument()
    expect(screen.getByTestId('signature-branch-down')).toBeInTheDocument()
    const readout = screen.getByTestId('hysteresis-readout')
    expect(readout).toHaveTextContent(/Ancho de histéresis al 50%/)
    expect(readout).toHaveTextContent(/2\.4\d psi/)
  })

  it('la pestaña Calibración muestra la indicación viva del FB AI (% de escala, bar y calidad)', () => {
    renderApp(fakeSnapshot({ pvPercent: 29.8, pvBar: 29.8, quality: 'GOOD' }))
    goToSkid()
    fireEvent.click(screen.getByTestId('open-calibration-modal'))
    const readout = screen.getByTestId('tx-readout')
    expect(readout).toHaveTextContent('29.8 % de escala')
    expect(readout).toHaveTextContent('29.8 bar')
    expect(readout).toHaveTextContent('rango 0–100 bar')
    expect(readout).toHaveTextContent('calidad GOOD')
  })

  it('rol Operador: Aplicar deshabilitado con ERR_ACCESS_DENIED (REQ-NFUN-SEC-01)', () => {
    renderApp()
    goToSkid()
    fireEvent.click(screen.getByTestId('open-calibration-modal'))
    expect(screen.getByTestId('calibrate-apply')).toBeDisabled()
    expect(screen.getByTestId('calib-denied')).toHaveTextContent('ERR_ACCESS_DENIED')
  })

  it('rol Técnico: Aplicar envía el comando calibrate con los campos del formulario', () => {
    const { worker } = renderApp()
    goToSkid()
    fireEvent.change(screen.getByLabelText('Rol de usuario'), { target: { value: 'TECHNICIAN' } })
    fireEvent.click(screen.getByTestId('open-calibration-modal'))
    fireEvent.change(screen.getByTestId('calib-urv'), { target: { value: '40' } })
    fireEvent.change(screen.getByTestId('calib-tau'), { target: { value: '2' } })
    const apply = screen.getByTestId('calibrate-apply')
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(worker.commandsOfType('calibrate').at(-1)).toEqual({
      type: 'calibrate',
      lrv: 0,
      urv: 40,
      tau: 2,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Comando AMS enviado')
  })

  it('un rechazo del transmisor (p. ej. turndown) se muestra como ERR en pantalla', () => {
    const { worker } = renderApp()
    goToSkid()
    fireEvent.change(screen.getByLabelText('Rol de usuario'), { target: { value: 'ENGINEER' } })
    fireEvent.click(screen.getByTestId('open-calibration-modal'))
    fireEvent.click(screen.getByTestId('calibrate-apply'))
    act(() => worker.emit({ type: 'error', message: 'turndown 2000.0:1 supera el límite' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'ERR: turndown 2000.0:1 supera el límite',
    )
  })
})

describe('HMI EP-06 — calibración contra el backend (REQ-NFUN-SEC-01)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Stubea fetch: /api/login siempre OK; /api/calibrate responde `calibrateStatus`. */
  function stubServer(calibrateStatus: number) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/login') {
        const body = JSON.parse(String(init?.body)) as { username: string }
        return {
          status: 200,
          ok: true,
          json: async () => ({ token: `tok-${body.username}`, username: body.username }),
        }
      }
      if (url === '/api/calibrate') {
        return {
          status: calibrateStatus,
          ok: calibrateStatus < 300,
          json: async () =>
            calibrateStatus === 403 ? { error: 'ERR_ACCESS_DENIED' } : { status: 'ok' },
        }
      }
      throw new Error(`fetch inesperado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('con server online, Operador puede clickear Aplicar pero el 403 se muestra como ERR_ACCESS_DENIED y no llega comando al worker', async () => {
    stubServer(403)
    const { worker } = renderApp()
    goToSkid()
    fireEvent.click(screen.getByTestId('open-calibration-modal'))

    // El botón se habilita una vez autenticado el rol contra el backend.
    await waitFor(() => expect(screen.getByTestId('calibrate-apply')).toBeEnabled())
    fireEvent.click(screen.getByTestId('calibrate-apply'))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('ERR_ACCESS_DENIED'),
    )
    expect(worker.commandsOfType('calibrate')).toHaveLength(0)
  })

  it('con server online, Técnico calibra: comando al worker y estado "autorizado por el servidor"', async () => {
    stubServer(200)
    const { worker } = renderApp()
    goToSkid()
    fireEvent.change(screen.getByLabelText('Rol de usuario'), { target: { value: 'TECHNICIAN' } })
    fireEvent.click(screen.getByTestId('open-calibration-modal'))

    await waitFor(() => expect(screen.getByTestId('calibrate-apply')).toBeEnabled())
    fireEvent.change(screen.getByTestId('calib-urv'), { target: { value: '40' } })
    fireEvent.click(screen.getByTestId('calibrate-apply'))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('autorizado por el servidor'),
    )
    expect(worker.commandsOfType('calibrate').at(-1)).toMatchObject({ type: 'calibrate', urv: 40 })
  })
})
