/**
 * Nivel 2 — Unidad de control: P&ID gris ISA-101 del patín VM-101 (REQ-UI-01:
 * proceso/equipos en gris de baja saturación; el color saturado solo marca
 * estados anómalos). FCV-101 abre el faceplate (Nivel 3); PT-101 abre la
 * calibración AMS (Nivel 4). Incluye consigna SP, tendencia en vivo y
 * acceso directo al diagnóstico.
 */
import { useState } from 'react'
import { AlarmSymbol } from '../components/AlarmSymbol'
import { TrendChart } from '../components/TrendChart'
import { useSim } from '../state/sim-context'

function PidPanel() {
  const { snapshot, navigate, openModal } = useSim()
  const stuck = snapshot?.valveStuck ?? false
  const sensorFault = snapshot?.quality === 'BAD_SENSOR_FAILURE'

  return (
    <svg
      role="img"
      aria-label="P&ID del patín VM-101"
      data-testid="pid-diagram"
      viewBox="0 0 640 270"
      className="w-full rounded bg-neutral-50"
    >
      {/* Manifold de producción aguas arriba */}
      <line x1="16" y1="100" x2="270" y2="100" stroke="#44424a" strokeWidth="3" />
      <text x="16" y="88" fontSize="12" fill="#504d57" fontFamily="monospace">
        Manifold de producción · P1 = {snapshot?.p1Bar.toFixed(0) ?? '—'} bar
      </text>

      {/* FCV-101: válvula de control (bowtie) */}
      <g
        role="button"
        tabIndex={0}
        aria-label="FCV-101 válvula de control — abrir faceplate"
        data-testid="pid-fcv-101"
        onClick={() => navigate('valve')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('valve')}
        style={{ cursor: 'pointer' }}
      >
        <polygon points="270,82 270,118 305,100" fill="#dad9de" stroke={stuck ? '#ed113b' : '#44424a'} strokeWidth="2" />
        <polygon points="340,82 340,118 305,100" fill="#dad9de" stroke={stuck ? '#ed113b' : '#44424a'} strokeWidth="2" />
        <line x1="305" y1="100" x2="305" y2="52" stroke="#44424a" strokeWidth="2" />
        <text x="305" y="44" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#504d57" fontFamily="monospace">
          FCV-101
        </text>
        <text x="305" y="140" textAnchor="middle" fontSize="11" fill="#615e6b" fontFamily="monospace">
          {snapshot ? `${snapshot.valveOpeningPercent.toFixed(0)}% · ${snapshot.pActPsi.toFixed(1)} psi` : ''}
        </text>
      </g>

      {/* Línea a la vasija controlada */}
      <line x1="340" y1="100" x2="420" y2="100" stroke="#44424a" strokeWidth="3" />

      {/* Vasija / colector (P2) */}
      <path
        d="M 420 60 h 150 v 110 a 20 20 0 0 1 -20 20 h -110 a 20 20 0 0 1 -20 -20 z"
        fill="#efeef0"
        stroke="#44424a"
        strokeWidth="2"
      />
      <text x="495" y="120" textAnchor="middle" fontSize="12" fill="#504d57" fontFamily="monospace">
        Vasija / colector
      </text>
      <text x="495" y="140" textAnchor="middle" fontSize="12" fill="#504d57" fontFamily="monospace">
        P2 = {snapshot?.p2Bar.toFixed(1) ?? '—'} bar
      </text>

      {/* PT-101: transmisor de presión en la vasija */}
      <g
        role="button"
        tabIndex={0}
        aria-label="PT-101 transmisor de presión — abrir calibración AMS"
        data-testid="pid-pt-101"
        onClick={() => openModal('calibration')}
        onKeyDown={(e) => e.key === 'Enter' && openModal('calibration')}
        style={{ cursor: 'pointer' }}
      >
        <line x1="495" y1="190" x2="495" y2="218" stroke="#44424a" strokeWidth="2" />
        <circle cx="495" cy="235" r="17" fill="#efeef0" stroke={sensorFault ? '#ed113b' : '#44424a'} strokeWidth="2" />
        <text x="495" y="240" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#504d57" fontFamily="monospace">
          PT
        </text>
        <text x="495" y="268" textAnchor="middle" fontSize="12" fill="#504d57" fontFamily="monospace">
          PT-101
        </text>
      </g>
      {sensorFault && (
        <svg x="516" y="212" width="24" height="24" viewBox="0 0 24 24">
          <AlarmSymbol priority={1} />
        </svg>
      )}
    </svg>
  )
}

/** Consigna SP: el operador es el único escritor; el reset restaura con `key`. */
function SpSlider() {
  const { setSpPercent } = useSim()
  const [sp, setSp] = useState(30)
  return (
    <div className="rounded bg-neutral-100 p-3 shadow-sm">
      <label htmlFor="sp-slider" className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-800">
          Consigna SP del PID (0–100% del rango del transmisor)
        </span>
        <span data-testid="sp-value" className="font-mono tabular-nums text-neutral-900">
          {sp.toFixed(0)}% ≈ {sp.toFixed(0)} bar
        </span>
      </label>
      <input
        id="sp-slider"
        data-testid="sp-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={sp}
        onChange={(e) => {
          const value = Number(e.target.value)
          setSp(value)
          setSpPercent(value)
        }}
        className="mt-1 w-full accent-neutral-700"
      />
    </div>
  )
}

export function SkidView() {
  const { openModal, navigate, resetSeq } = useSim()

  return (
    <section className="flex flex-col gap-4 p-4">
      <nav className="flex items-center gap-2 text-sm text-neutral-600">
        <button type="button" className="hover:underline" onClick={() => navigate('overview')}>
          ← Nivel 1 · Yacimiento
        </button>
        <span aria-hidden>/</span>
        <span className="font-semibold text-neutral-900">Nivel 2 · VM-101 Patín de medición</span>
      </nav>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-3 xl:col-span-2">
          <PidPanel />
          <SpSlider key={resetSeq} />

          <div className="rounded bg-neutral-100 p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-neutral-800">
              Tendencia en vivo (≥ 20 FPS)
            </h3>
            <TrendChart />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded bg-neutral-100 p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-800">Diagnóstico</h3>
            <button
              type="button"
              data-testid="open-valve-faceplate"
              onClick={() => navigate('valve')}
              className="rounded-sm border border-neutral-400 bg-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-300"
            >
              Faceplate válvula (Nivel 3)
            </button>
            <button
              type="button"
              data-testid="open-signature-modal"
              onClick={() => openModal('signature')}
              className="rounded-sm border border-neutral-400 bg-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-300"
            >
              Firma de válvula (Nivel 4)
            </button>
            <button
              type="button"
              data-testid="open-calibration-modal"
              onClick={() => openModal('calibration')}
              className="rounded-sm border border-neutral-400 bg-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-300"
            >
              Calibración AMS del PT-101 (Nivel 4)
            </button>
          </div>

          <div className="rounded bg-neutral-100 p-3 text-sm text-neutral-700 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-neutral-800">Qué estás operando</h3>
            <p>
              El PID acciona el actuador neumático de FCV-101 (3–15 psi) para llevar la presión
              de la vasija al SP. El drawdown agresivo de Vaca Muerta tensiona el lazo: si P1
              sube demasiado, la válvula entra en cavitación crítica y el caudal satura — la
              tendencia lo muestra como un meseta, no como una falla del PID.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
