/**
 * App (EP-04): HMI de 4 niveles (ISA-101 / ISA-18.2). El SimProvider posee el
 * worker de simulación; la barra superior es global y la vista activa sigue la
 * jerarquía Nivel 1 (macro) → 2 (patín) → 3 (faceplate) con el diagnóstico en
 * modal (Nivel 4). Cualquier cara operativa queda a ≤ 2 clics del Nivel 1.
 */
import { DiagnosticsModal } from './components/DiagnosticsModal'
import { TopBar } from './components/TopBar'
import { SimProvider } from './state/SimProvider'
import { useSim } from './state/sim-context'
import { OverviewView } from './views/OverviewView'
import { SkidView } from './views/SkidView'
import { ValveDetailView } from './views/ValveDetailView'

function Hmi() {
  const { view } = useSim()
  return (
    <div className="flex min-h-screen flex-col bg-neutral-200 text-neutral-950">
      <TopBar />
      <main className="flex-1">
        {view === 'overview' && <OverviewView />}
        {view === 'skid' && <SkidView />}
        {view === 'valve' && <ValveDetailView />}
      </main>
      <DiagnosticsModal />
      <footer className="border-t border-neutral-400 px-4 py-2 text-xs text-neutral-600">
        Simulador de firma de válvulas y calibración de transmisores · Vaca Muerta ·
        física IEC 60534-2-1 en worker a 100 Hz (Δt = 10 ms)
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <SimProvider>
      <Hmi />
    </SimProvider>
  )
}
