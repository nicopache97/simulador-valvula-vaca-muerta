/**
 * Barra superior global (EP-04): controles de simulación (▶/⏸/⏮ + velocidad),
 * reloj de tiempo de proceso, campana de alarmas ISA-18.2 con contador y
 * selector de usuario/rol (Operador / Técnico / Ingeniero).
 */
import { SIMULATION_SCENARIOS, USER_ROLES, type SimSpeed } from '@sim/shared'
import { useSim } from '../state/sim-context'

const SPEED_OPTIONS: readonly SimSpeed[] = [1, 2, 5]

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Operador',
  TECHNICIAN: 'Técnico',
  ENGINEER: 'Ingeniero',
}

const SCENARIO_LABELS: Record<string, string> = {
  normal: 'Normal',
  cavitacion: 'Cavitación',
  falla_sensor: 'Falla de sensor',
  transitorio_p1: 'Transitorio P1',
}

function fmtClock(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Selectores operativos (escenario, velocidad) comparten estilo ISA-101. */
function selectClass(): string {
  return 'rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm text-neutral-900'
}

export function TopBar() {
  const {
    snapshot,
    running,
    speed,
    role,
    setRole,
    play,
    pauseSim,
    reset,
    setSpeed,
    setScenario,
    requestExport,
    exportStatus,
    serverOnline,
    view,
  } = useSim()
  const alarmCount = snapshot?.alarms.length ?? 0

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-400 bg-neutral-200 px-4 py-2">
      <div className="flex items-baseline gap-2">
        <h1 className="text-base font-bold text-neutral-950">Simulador Vaca Muerta</h1>
        <span className="rounded bg-neutral-300 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
          v0.8.0
        </span>
      </div>

      {/* Controles de simulación */}
      <div className="flex items-center gap-1">
        {running ? (
          <button
            type="button"
            aria-label="Pausar simulación"
            onClick={pauseSim}
            className="rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-300"
          >
            ⏸
          </button>
        ) : (
          <button
            type="button"
            aria-label="Reanudar simulación"
            onClick={play}
            className="rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-300"
          >
            ▶
          </button>
        )}
        <button
          type="button"
          aria-label="Reiniciar simulación"
          onClick={reset}
          className="rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-300"
        >
          ⏮
        </button>
        <label className="ml-1 flex items-center gap-1 text-sm text-neutral-700">
          Velocidad
          <select
            aria-label="Velocidad de simulación"
            data-testid="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as SimSpeed)}
            className={selectClass()}
          >
            {SPEED_OPTIONS.map((v) => (
              <option key={v} value={v}>
                ×{v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Reloj de proceso */}
      <span
        data-testid="process-clock"
        className="rounded-sm bg-neutral-800 px-2 py-1 font-mono text-sm tabular-nums text-neutral-50"
        aria-label="Tiempo de proceso"
      >
        {fmtClock(snapshot?.t ?? 0)}
      </span>

      {/* Campana de alarmas ISA-18.2 */}
      <span className="relative inline-flex" aria-live="polite">
        <span
          role="img"
          aria-label={alarmCount > 0 ? `${alarmCount} alarmas activas` : 'Sin alarmas activas'}
          data-testid="alarm-bell"
          className="px-1 text-lg"
        >
          🔔
        </span>
        {alarmCount > 0 && (
          <span
            data-testid="alarm-count"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alarm-critical px-1 font-mono text-[10px] font-bold text-white"
          >
            {alarmCount}
          </span>
        )}
      </span>

      {/* Usuario / rol */}
      <label className="ml-auto flex items-center gap-1 text-sm text-neutral-700">
        Usuario
        <select
          aria-label="Rol de usuario"
          data-testid="role-select"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className={selectClass()}
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <span
        data-testid="server-status"
        title="Estado de la sesión con el backend (RBAC + auditoría, REQ-NFUN-SEC-01)"
        className="text-xs text-neutral-600"
      >
        {serverOnline
          ? '● servidor en línea — comandos auditados'
          : '○ modo offline — validación local de rol'}
      </span>

      {/* Escenario y exportación (operación de la cara visible) */}
      {view !== 'overview' && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-neutral-700">
            Escenario
            <select
              aria-label="Escenario de proceso"
              data-testid="scenario-select"
              value={snapshot?.scenario ?? 'normal'}
              onChange={(e) => setScenario(e.target.value as (typeof SIMULATION_SCENARIOS)[number])}
              className={selectClass()}
            >
              {SIMULATION_SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {SCENARIO_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={requestExport}
            className="rounded-sm border border-neutral-400 bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-300"
          >
            Exportar tendencia CSV
          </button>
          {exportStatus && (
            <span className="text-xs text-neutral-600" role="status">
              {exportStatus}
            </span>
          )}
        </div>
      )}
    </header>
  )
}
