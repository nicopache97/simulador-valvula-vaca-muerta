/**
 * Provider de la HMI (EP-04): posee el worker de simulación y publica el
 * snapshot decimado (indicadores), la suscripción de alta frecuencia
 * (tendencias a 20+ FPS), la navegación de niveles 1–4, el rol de usuario
 * y los comandos de campo (exportar, calibrar, ciclo de firma).
 *
 * EP-06 (REQ-NFUN-SEC-01): al cambiar de rol se autentica contra el backend
 * (`POST /api/login`, usuarios demo `operator`/`technician`/`engineer`).
 * El comando de calibración pasa primero por `POST /api/calibrate`: un 403
 * se muestra como ERR_ACCESS_DENIED (rechazo auditado en servidor). Si el
 * server no responde (modo offline) se recae en la validación local de rol
 * sin romper la simulación.
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
  const [serverAuth, setAuth] = useState<{ token: string; role: UserRole } | null>(null)
  /** Sesión válida solo si corresponde al rol activo. */
  const serverOnline = serverAuth !== null && serverAuth.role === role
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

  /**
   * Autentica el rol activo contra el backend; sin server ⇒ modo offline.
   * La sesión lleva su rol: si cambia el usuario antes de reautenticar, el
   * token viejo queda descartado (serverOnline se deriva de la coincidencia).
   */
  useEffect(() => {
    let cancelled = false
    const username = role.toLowerCase()
    try {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'vaca2026' }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`login ${res.status}`)
          return res.json() as Promise<{ token: string }>
        })
        .then((body) => {
          if (!cancelled) setAuth({ token: body.token, role })
        })
        .catch(() => {
          if (!cancelled) setAuth(null)
        })
    } catch {
      // fetch no disponible (p. ej. entornos de test): cae a offline.
      queueMicrotask(() => {
        if (!cancelled) setAuth(null)
      })
    }
    return () => {
      cancelled = true
    }
  }, [role])

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

  /** Modo offline: validación local de rol (fallback, no rompe la simulación). */
  const calibrateOffline = useCallback(
    (cmd: SimCalibrateCommand) => {
      if (role === 'OPERATOR') {
        setCalibStatus('ERR_ACCESS_DENIED: modo offline — validación local (rol Operador sin permiso de configuración, ISA/IEC 62443)')
        return
      }
      post(cmd)
      setCalibStatus('Comando AMS enviado al transmisor (aplicado en el próximo tick)')
    },
    [post, role],
  )

  const calibrate = useCallback(
    (cmd: SimCalibrateCommand) => {
      const token = serverOnline ? serverAuth.token : null
      if (!token) {
        calibrateOffline(cmd)
        return
      }
      try {
        fetch('/api/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(cmd),
        })
          .then(async (res) => {
            if (res.status === 403) {
              const body = (await res.json()) as { error?: string }
              setCalibStatus(
                `${body.error ?? 'ERR_ACCESS_DENIED'}: el servidor rechazó el comando (rol sin permiso de configuración, ISA/IEC 62443). Rechazo registrado en auditoría.`,
              )
              return
            }
            if (!res.ok) throw new Error(`calibrate ${res.status}`)
            post(cmd)
            setCalibStatus(
              'Comando AMS autorizado por el servidor, enviado al transmisor y registrado en auditoría',
            )
          })
          .catch(() => calibrateOffline(cmd))
      } catch {
        calibrateOffline(cmd)
      }
    },
    [post, calibrateOffline, serverOnline, serverAuth],
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
      serverOnline,
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
      serverOnline,
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
