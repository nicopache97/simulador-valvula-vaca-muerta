/**
 * Indicador analógico de barra con bandas (REQ-UI-02, ISA-101): sustituye al
 * "mar de números" — la banda sombreada marca el rango normal de operación y
 * la marca vertical el límite de alarma. El color saturado aparece SOLO cuando
 * la variable está en zona de alarma (REQ-UI-01).
 */
export interface BarIndicatorProps {
  readonly label: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly value: number
  readonly normalMin: number
  readonly normalMax: number
  /** Límite superior de alarma; undefined = sin límite configurado. */
  readonly alarmHigh?: number
  readonly testId?: string
}

function pct(value: number, min: number, max: number): number {
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

export function BarIndicator({
  label,
  unit,
  min,
  max,
  value,
  normalMin,
  normalMax,
  alarmHigh,
  testId,
}: BarIndicatorProps) {
  const inAlarm = alarmHigh !== undefined && value > alarmHigh
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <span className="w-28 shrink-0 text-sm font-medium text-neutral-800">{label}</span>
      <div
        role="meter"
        aria-label={`${label} (${unit})`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        className="relative h-5 flex-1 overflow-hidden rounded-sm bg-neutral-300"
      >
        {/* Banda del rango normal de operación */}
        <div
          data-testid={testId ? `${testId}-normal-band` : undefined}
          className="absolute inset-y-0 bg-neutral-100"
          style={{
            left: `${pct(normalMin, min, max)}%`,
            width: `${pct(normalMax, min, max) - pct(normalMin, min, max)}%`,
          }}
        />
        {/* Zona de alarma (saturada solo acá, es un estado anómalo) */}
        {alarmHigh !== undefined && (
          <div
            data-testid={testId ? `${testId}-alarm-zone` : undefined}
            className="absolute inset-y-0 right-0 bg-alarm-high/30"
            style={{ width: `${100 - pct(alarmHigh, min, max)}%` }}
          />
        )}
        {/* Marca del límite de alarma */}
        {alarmHigh !== undefined && (
          <div
            className="absolute inset-y-0 w-0.5 bg-alarm-high"
            style={{ left: `${pct(alarmHigh, min, max)}%` }}
          />
        )}
        {/* Valor actual */}
        <div
          data-testid={testId ? `${testId}-value` : undefined}
          className={`absolute inset-y-0 left-0 ${inAlarm ? 'bg-alarm-critical' : 'bg-neutral-700'}`}
          style={{ width: `${pct(value, min, max)}%` }}
        />
      </div>
      <span
        className={`w-28 shrink-0 text-right font-mono text-sm tabular-nums ${inAlarm ? 'font-bold text-alarm-critical' : 'text-neutral-900'}`}
      >
        {value.toFixed(1)} {unit}
      </span>
    </div>
  )
}
