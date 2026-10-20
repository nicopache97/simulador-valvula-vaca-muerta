/**
 * Nivel 4 — Diagnóstico (REQ-UI-03): modal con dos pestañas:
 *  · Firma de válvula: plano P_act vs. carrera con ciclo de histéresis
 *    (barrido 3→15→3 psi) y lectura del ancho de histéresis.
 *  · Calibración AMS: LRV/URV (re-rango), damping, Zero Trim y Span Trim del
 *    PT-101. Con el rol Operador el comando se rechaza con ERR_ACCESS_DENIED:
 *    offline el botón queda deshabilitado (validación local); con el backend
 *    EP-06 en línea el botón se habilita y es el servidor quien rechaza con
 *    403 y registra el rechazo en auditoría (REQ-NFUN-SEC-01, ISA/IEC 62443).
 */
import { useState } from 'react'
import { SignatureChart } from './SignatureChart'
import { useSim, type ModalTab } from '../state/sim-context'

function SignatureTab() {
  const { signature, runSignature, snapshot } = useSim()
  return (
    <div className="flex flex-col gap-3">
      <SignatureChart
        cycle={signature}
        livePActPsi={snapshot?.pActPsi ?? null}
        liveTravelPercent={snapshot?.valveOpeningPercent ?? null}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="run-signature"
          onClick={runSignature}
          className="rounded-sm border border-neutral-400 bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-300"
        >
          Ejecutar ciclo de firma (3→15→3 psi)
        </button>
        {signature ? (
          <p data-testid="hysteresis-readout" className="font-mono text-sm text-neutral-900">
            Ancho de histéresis al 50% de carrera: {signature.hysteresisPsi.toFixed(2)} psi
            <span className="text-neutral-500">
              {' '}(esperado 2·F_friction = {(2 * signature.frictionPsi).toFixed(2)} psi)
            </span>
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            Ejecutá el ciclo para trazar el lazo: barrido continuo de P_act a 0.05 psi/s sobre la
            misma física que corre en vivo. La separación entre ramas cuantifica el rozamiento de
            empaquetadura.
          </p>
        )}
      </div>
    </div>
  )
}

function CalibrationTab() {
  const { role, calibrate, calibStatus, serverOnline } = useSim()
  const [lrv, setLrv] = useState('0')
  const [urv, setUrv] = useState('100')
  const [tau, setTau] = useState('0')
  const [zeroTrim, setZeroTrim] = useState('')
  const [spanTrim, setSpanTrim] = useState('')
  const denied = role === 'OPERATOR'
  // Offline el botón queda bloqueado (validación local, TC-UI-02); online se
  // habilita y es el servidor quien rechaza con 403 → ERR_ACCESS_DENIED
  // auditado (TC-NFUN-SEC-01, EP-06).
  const blocked = denied && !serverOnline

  const field =
    'w-32 rounded-sm border border-neutral-400 bg-neutral-50 px-2 py-1 font-mono text-sm text-neutral-900'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-neutral-700">
        Comandos de campo HART/AMS sobre el PT-101 (transmisor vivo). El re-rango es digital: no
        toca la medición física, solo la escala del FB AI (turndown máx. 400:1).
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          LRV (bar)
          <input
            data-testid="calib-lrv"
            type="number"
            value={lrv}
            onChange={(e) => setLrv(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          URV (bar)
          <input
            data-testid="calib-urv"
            type="number"
            value={urv}
            onChange={(e) => setUrv(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Damping τ (s)
          <input
            data-testid="calib-tau"
            type="number"
            min={0}
            step={0.1}
            value={tau}
            onChange={(e) => setTau(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Zero Trim · patrón (bar)
          <input
            data-testid="calib-zero"
            type="number"
            placeholder="vacío = no aplicar"
            value={zeroTrim}
            onChange={(e) => setZeroTrim(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Span Trim · patrón (bar)
          <input
            data-testid="calib-span"
            type="number"
            placeholder="vacío = no aplicar"
            value={spanTrim}
            onChange={(e) => setSpanTrim(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {denied && (
        <p data-testid="calib-denied" className="text-sm font-bold text-alarm-critical" role="alert">
          {serverOnline
            ? 'ERR_ACCESS_DENIED: el rol Operador no puede ejecutar comandos de configuración — el servidor ISA/IEC 62443 rechazará el comando y registrará el rechazo en auditoría.'
            : 'ERR_ACCESS_DENIED: el rol Operador no puede ejecutar comandos de configuración (ISA/IEC 62443). Se requiere rol Técnico o Ingeniero.'}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="calibrate-apply"
          disabled={blocked}
          onClick={() =>
            calibrate({
              type: 'calibrate',
              lrv: Number(lrv),
              urv: Number(urv),
              tau: Number(tau),
              ...(zeroTrim !== '' ? { zeroTrim: Number(zeroTrim) } : {}),
              ...(spanTrim !== '' ? { spanTrim: Number(spanTrim) } : {}),
            })
          }
          className="rounded-sm border border-neutral-400 bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aplicar
        </button>
        {calibStatus && (
          <span className="text-sm text-neutral-700" role="status" aria-live="polite">
            {calibStatus}
          </span>
        )}
      </div>
    </div>
  )
}

const TABS: { id: ModalTab; label: string }[] = [
  { id: 'signature', label: 'Firma de válvula' },
  { id: 'calibration', label: 'Calibración AMS' },
]

export function DiagnosticsModal() {
  const { modal, closeModal, openModal } = useSim()
  if (!modal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diagnóstico Nivel 4"
        className="flex w-full max-w-3xl flex-col gap-3 rounded bg-neutral-200 p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div role="tablist" aria-label="Pestañas de diagnóstico" className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={modal === tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => openModal(tab.id)}
                className={`rounded-sm px-3 py-1.5 text-sm ${
                  modal === tab.id
                    ? 'bg-neutral-800 font-semibold text-neutral-50'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Cerrar diagnóstico"
            onClick={closeModal}
            className="rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-300"
          >
            ✕
          </button>
        </div>
        {modal === 'signature' ? <SignatureTab /> : <CalibrationTab />}
      </div>
    </div>
  )
}
