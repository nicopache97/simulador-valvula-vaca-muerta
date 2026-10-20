/**
 * Provider de la HMI (EP-04): posee el worker de simulación y publica el
 * snapshot decimado (indicadores), la suscripción de alta frecuencia
 * (tendencias a 20+ FPS), la navegación de niveles 1–4, el rol de usuario
 * y los comandos de campo (exportar, calibrar, ciclo de firma).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  SimCalibrateCommand,
  SimulationScenario,
  SimSnapshot,
  SimSpeed,
  UserRole,
} from '@sim/shared'
import { createSimulationWorker, type SimEvent } from '../sim/client'
import { runSignatureCycle, type SignatureCycle } from '../sim/signature'
import { SimContext, type SimContextValue, type ModalTab, type ViewLevel } from './sim-context'

/** Refresco de indicadores numéricos [ms]; las tendencias van por aparte. */
const INDICATOR_REFRESH_MS = 100

let exportSeq = 0

export function SimProvider({ children }: { children: ReactNode }) {
  const workerRef = useRef<Worker | null>(null)
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null)
  const [running, setRunning] = useState(true)
  const [speed, setSpeedState] = useState<SimSpeed>(1)
  const [role, setRole] = useState<UserRole>('OPERATOR')
  const [view, setView] = useState<ViewLevel>('overview')
  const [modal, setModal] = useState<ModalTab | null>(null)
  const [signature, setSignature] = useState<SignatureCycle | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [calibStatus, setCalibStatus] = useState<string | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const tickListeners = useRef(new Set<(snapshot: SimSnapshot) => void>())
  const lastIndicatorUpdate = useRef(0)

  useEffect(() => {
    const worker = createSimulationWorker()
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<SimEvent>) => {
      const msg = event.data
      if (msg.type === 'tick') {
        tickListeners.current.forEach((cb) => cb(msg.snapshot))
        const now = performance.now()
        if (now - lastIndicatorUpdate.current >= INDICATOR_REFRESH_MS) {
          lastIndicatorUpdate.current = now
          setSnapshot(msg.snapshot)
        }
      } else if (msg.type === 'exported') {
        downloadCsv(msg.csv)
        const rows = msg.csv.split('\n').length - 1
        setExportStatus(`Tendencia exportada: ${rows} filas (tendencia_VM-101.csv)`)
      } else if (msg.type === 'error') {
        setCalibStatus(`ERR: ${msg.message}`)
      }
    }
    worker.postMessage({ type: 'init', config: {} })
    worker.postMessage({ type: 'start' })
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const post = useCallback((cmd: Parameters<Worker['postMessage']>[0]) => {
    workerRef.current?.postMessage(cmd)
  }, [])

  const subscribeTick = useCallback((cb: (snapshot: SimSnapshot) => void) => {
    tickListeners.current.add(cb)
    return () => {
      tickListeners.current.delete(cb)
    }
  }, [])

  const play = useCallback(() => {
    post({ type: 'start' })
    setRunning(true)
  }, [post])

  const pauseSim = useCallback(() => {
    post({ type: 'pause' })
    setRunning(false)
  }, [post])

  const reset = useCallback(() => {
    post({ type: 'reset' })
    setRunning(true)
    setSignature(null)
    setExportStatus(null)
    setCalibStatus(null)
    setResetSeq((n) => n + 1)
  }, [post])

  const setSpeed = useCallback(
    (value: SimSpeed) => {
      post({ type: 'setSpeed', speed: value })
      setSpeedState(value)
    },
    [post],
  )

  const navigate = useCallback((next: ViewLevel) => setView(next), [])

  const openModal = useCallback((tab: ModalTab) => {
    setModal(tab)
    setCalibStatus(null)
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  const setSpPercent = useCallback(
    (percent: number) => post({ type: 'setSp', spBar: percent }),
    [post],
  )

  const setScenario = useCallback(
    (scenario: SimulationScenario) => post({ type: 'setScenario', scenario }),
    [post],
  )

  const requestExport = useCallback(() => {
    exportSeq += 1
    post({ type: 'exportRequest', requestId: `exp-${Date.now()}-${exportSeq}` })
  }, [post])

  const runSignature = useCallback(() => {
    setSignature(runSignatureCycle())
  }, [])

  const calibrate = useCallback(
    (cmd: SimCalibrateCommand) => {
      post(cmd)
      setCalibStatus('Comando AMS enviado al transmisor (aplicado en el próximo tick)')
    },
    [post],
  )

  const value = useMemo<SimContextValue>(
    () => ({
      snapshot,
      running,
      speed,
      role,
      view,
      modal,
      signature,
      exportStatus,
      calibStatus,
      resetSeq,
      subscribeTick,
      play,
      pauseSim,
      reset,
      setSpeed,
      setRole,
      navigate,
      openModal,
      closeModal,
      setSpPercent,
      setScenario,
      requestExport,
      runSignature,
      calibrate,
    }),
    [
      snapshot,
      running,
      speed,
      role,
      view,
      modal,
      signature,
      exportStatus,
      calibStatus,
      resetSeq,
      subscribeTick,
      play,
      pauseSim,
      reset,
      setSpeed,
      navigate,
      openModal,
      closeModal,
      setSpPercent,
      setScenario,
      requestExport,
      runSignature,
      calibrate,
    ],
  )

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>
}

/** Dispara la descarga del CSV en el navegador (no-op en jsdom). */
function downloadCsv(csv: string): void {
  try {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'tendencia_VM-101.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  } catch {
    // Entornos sin DOM completo (tests): la descarga no aplica.
  }
}
