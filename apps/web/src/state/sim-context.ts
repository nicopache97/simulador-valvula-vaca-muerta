/**
 * Contexto global de la HMI (EP-04): estado del worker, navegación de niveles
 * 1–4, rol de usuario y comandos de campo. Separado del provider para que
 * cada archivo exporte un solo componente (react-refresh).
 */
import { createContext, useContext } from 'react'
import type {
  SimCalibrateCommand,
  SimulationScenario,
  SimSnapshot,
  SimSpeed,
  UserRole,
} from '@sim/shared'
import type { SignatureCycle } from '../sim/signature'

export type ViewLevel = 'overview' | 'skid' | 'valve'
export type ModalTab = 'signature' | 'calibration'

export interface SimContextValue {
  readonly snapshot: SimSnapshot | null
  readonly running: boolean
  readonly speed: SimSpeed
  readonly role: UserRole
  readonly view: ViewLevel
  readonly modal: ModalTab | null
  readonly signature: SignatureCycle | null
  readonly exportStatus: string | null
  readonly calibStatus: string | null
  /**
   * true cuando el backend EP-06 responde y la sesión del rol activo está
   * autenticada; false ⇒ modo offline con validación local de rol.
   */
  readonly serverOnline: boolean
  /** Se incrementa en cada reset (para reiniciar estado local de vistas). */
  readonly resetSeq: number
  /** Alta frecuencia: se invoca en cada tick del worker (~100 Hz). */
  subscribeTick(cb: (snapshot: SimSnapshot) => void): () => void
  play(): void
  pauseSim(): void
  reset(): void
  setSpeed(speed: SimSpeed): void
  setRole(role: UserRole): void
  navigate(view: ViewLevel): void
  openModal(tab: ModalTab): void
  closeModal(): void
  /** Consigna del PID en % del rango del transmisor (0–100 ⇒ 0–100 bar). */
  setSpPercent(percent: number): void
  setScenario(scenario: SimulationScenario): void
  requestExport(): void
  runSignature(): void
  calibrate(cmd: SimCalibrateCommand): void
}

export const SimContext = createContext<SimContextValue | null>(null)

export function useSim(): SimContextValue {
  const ctx = useContext(SimContext)
  if (!ctx) throw new Error('useSim debe usarse dentro de <SimProvider>')
  return ctx
}
