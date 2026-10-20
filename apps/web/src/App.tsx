import { useEffect, useState } from 'react'
import type { SimSnapshot } from '@sim/shared'
import { createSimulationWorker } from './sim/client'

/** Refresco del readout en pantalla; la simulación corre a 100 Hz en el worker. */
const UI_REFRESH_MS = 250

export default function App() {
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null)

  useEffect(() => {
    const worker = createSimulationWorker()
    let lastUiUpdate = 0
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data
      if (msg.type === 'tick') {
        const now = performance.now()
        if (now - lastUiUpdate >= UI_REFRESH_MS) {
          lastUiUpdate = now
          setSnapshot(msg.snapshot)
        }
      }
    }
    worker.postMessage({ type: 'init', config: {} })
    worker.postMessage({ type: 'start' })
    return () => {
      worker.terminate()
    }
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-neutral-200 p-8 text-neutral-950">
      <h1 className="text-3xl font-bold">Simulador Vaca Muerta</h1>
      <p className="text-lg text-neutral-600">
        Firma de válvulas y calibración de transmisores
      </p>
      <span
        data-testid="app-version"
        className="rounded bg-neutral-300 px-3 py-1 font-mono text-sm"
      >
        v0.4.0
      </span>

      <section
        data-testid="live-readout"
        className="rounded bg-neutral-100 p-4 font-mono text-sm shadow"
      >
        {snapshot ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <dt>Reloj de proceso</dt>
            <dd data-testid="ro-t">{snapshot.t.toFixed(2)} s</dd>
            <dt>SP / PV</dt>
            <dd data-testid="ro-sppv">
              {snapshot.spBar.toFixed(1)} / {snapshot.pvBar.toFixed(1)} bar (
              {snapshot.pvPercent.toFixed(1)}%)
            </dd>
            <dt>Válvula (P_act)</dt>
            <dd data-testid="ro-valve">
              {snapshot.valveOpeningPercent.toFixed(1)}% ({snapshot.pActPsi.toFixed(2)} psi)
            </dd>
            <dt>P1 / P2</dt>
            <dd data-testid="ro-p">
              {snapshot.p1Bar.toFixed(1)} / {snapshot.p2Bar.toFixed(1)} bar
            </dd>
            <dt>Caudal</dt>
            <dd data-testid="ro-flow">{snapshot.flowM3h.toFixed(1)} m³/h</dd>
            <dt>Calidad PV</dt>
            <dd data-testid="ro-quality">{snapshot.quality}</dd>
          </dl>
        ) : (
          <p>Iniciando simulación…</p>
        )}
        {snapshot && snapshot.alarms.length > 0 && (
          <ul data-testid="ro-alarms" className="mt-2 border-t border-neutral-300 pt-2">
            {snapshot.alarms.map((alarm) => (
              <li key={alarm.code}>
                [{prioridadTexto(alarm.priority)}] {alarm.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-xl text-center text-sm text-neutral-600">
        La simulación corre en un worker a 100 Hz (Δt = 10 ms, REQ-GEN-01): el PID acciona el
        actuador neumático (3–15 psi), la válvula estrangula el caudal según IEC 60534-2-1 y el
        transmisor (TB→AI) devuelve el PV con su calidad. EP-04 renderiza el HMI completo.
      </p>
    </main>
  )
}

function prioridadTexto(priority: 1 | 2 | 3): string {
  return priority === 1 ? 'CRÍTICA' : priority === 2 ? 'ALTA' : 'BAJA'
}
