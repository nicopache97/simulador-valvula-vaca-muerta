/**
 * Nivel 1 — Macro yacimiento (REQ-UI-03): KPIs del proceso, resumen global
 * de alarmas ISA-18.2 y tarjeta de acceso al patín de medición VM-101.
 */
import { AlarmSymbol } from '../components/AlarmSymbol'
import { useSim } from '../state/sim-context'

function fmtClock(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded bg-neutral-100 p-3 shadow-sm" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="font-mono text-xl tabular-nums text-neutral-950">{value}</p>
    </div>
  )
}

export function OverviewView() {
  const { snapshot, running, speed, navigate } = useSim()
  const alarms = snapshot?.alarms ?? []

  return (
    <section className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold text-neutral-900">
        Nivel 1 · Yacimiento Vaca Muerta — visión general
      </h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Estado"
          testId="kpi-state"
          value={snapshot ? (running ? `RUN ×${speed}` : 'PAUSA') : '—'}
        />
        <Kpi label="Tiempo proceso" testId="kpi-time" value={snapshot ? fmtClock(snapshot.t) : '—'} />
        <Kpi
          label="Caudal"
          testId="kpi-flow"
          value={snapshot ? `${snapshot.flowM3h.toFixed(0)} m³/h` : '—'}
        />
        <Kpi
          label="P1 / P2"
          testId="kpi-pressure"
          value={snapshot ? `${snapshot.p1Bar.toFixed(0)} / ${snapshot.p2Bar.toFixed(1)} bar` : '—'}
        />
        <Kpi
          label="Apertura FCV-101"
          testId="kpi-opening"
          value={snapshot ? `${snapshot.valveOpeningPercent.toFixed(0)}%` : '—'}
        />
        <Kpi label="Alarmas activas" testId="kpi-alarms" value={String(alarms.length)} />
      </div>

      <div className="rounded bg-neutral-100 p-3 shadow-sm" data-testid="alarm-summary">
        <h3 className="mb-2 text-sm font-semibold text-neutral-800">Resumen de alarmas (ISA-18.2)</h3>
        {alarms.length === 0 ? (
          <p className="text-sm text-neutral-600">Sin alarmas activas.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {alarms.map((alarm) => (
              <li key={alarm.code} className="flex items-center gap-2 text-sm text-neutral-900">
                <AlarmSymbol priority={alarm.priority} />
                <span className="font-mono text-xs text-neutral-500">{alarm.code}</span>
                <span>{alarm.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        data-testid="card-vm-101"
        onClick={() => navigate('skid')}
        className="flex items-center justify-between rounded bg-neutral-100 p-4 text-left shadow-sm hover:bg-neutral-300"
      >
        <span>
          <span className="block text-base font-semibold text-neutral-900">
            Patín de medición VM-101
          </span>
          <span className="block text-sm text-neutral-600">
            FCV-101 (válvula de control) + PT-101 (transmisor de presión) · gas/condensado,
            drawdown agresivo Vaca Muerta
          </span>
        </span>
        <span aria-hidden className="text-2xl text-neutral-500">›</span>
      </button>

      <p className="max-w-2xl text-sm text-neutral-600">
        Recorrido: operá la planta en el patín (Nivel 2), abrí el faceplate de la válvula
        (Nivel 3) y diagnosticá la firma o calibrá el transmisor (Nivel 4). Todo en el mismo
        lazo: cada ajuste se ve de inmediato en la tendencia y en las alarmas.
      </p>
    </section>
  )
}
