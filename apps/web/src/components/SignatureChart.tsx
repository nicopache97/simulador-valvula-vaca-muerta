/**
 * Firma de válvula: gráfico X-Y P_act (psi) vs. carrera (%). Es un plano de
 * fase, no una serie temporal: las dos ramas del lazo de histéresis comparten
 * el eje X y el punto operativo en vivo se mueve en cualquier dirección, así
 * que se dibuja en SVG directo en lugar de lightweight-charts (que solo
 * soporta series temporales con tiempo monótono creciente).
 *
 * Rama de apertura: trazo sólido oscuro; rama de cierre: punteado claro; la
 * banda gris es el corredor del resorte ± rozamiento dinámico. Todo en grises
 * (REQ-UI-01): el color saturado queda reservado a alarmas.
 */
import type { SignatureCycle } from '../sim/signature'

const W = 460
const H = 320
const PAD = { left: 46, right: 12, top: 12, bottom: 42 }
const P_MIN = 3
const P_MAX = 15

function xOf(travelPercent: number): number {
  return PAD.left + (travelPercent / 100) * (W - PAD.left - PAD.right)
}
function yOf(pActPsi: number): number {
  return PAD.top + ((P_MAX - pActPsi) / (P_MAX - P_MIN)) * (H - PAD.top - PAD.bottom)
}
function toPath(points: readonly { pActPsi: number; travelPercent: number }[]): string {
  return points.map((p) => `${xOf(p.travelPercent).toFixed(1)},${yOf(p.pActPsi).toFixed(1)}`).join(' ')
}

export interface SignatureChartProps {
  readonly cycle: SignatureCycle | null
  readonly livePActPsi: number | null
  readonly liveTravelPercent: number | null
}

export function SignatureChart({ cycle, livePActPsi, liveTravelPercent }: SignatureChartProps) {
  const friction = cycle?.frictionPsi ?? 1.2
  // Corredor del resorte: P_resorte(x) = 5 + 8·x ± F_dinámica [psi, x en 0..1]
  const bandTop = Array.from({ length: 26 }, (_, i) => {
    const x = i / 25
    return `${xOf(x * 100).toFixed(1)},${yOf(5 + 8 * x + friction).toFixed(1)}`
  }).join(' ')
  const bandBottom = Array.from({ length: 26 }, (_, i) => {
    const x = (25 - i) / 25
    return `${xOf(x * 100).toFixed(1)},${yOf(5 + 8 * x - friction).toFixed(1)}`
  }).join(' ')
  const springLine = Array.from({ length: 26 }, (_, i) => {
    const x = i / 25
    return `${xOf(x * 100).toFixed(1)},${yOf(5 + 8 * x).toFixed(1)}`
  }).join(' ')

  return (
    <svg
      role="img"
      aria-label="Firma de válvula: presión de actuador versus carrera"
      data-testid="signature-chart"
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
    >
      {/* Grilla y ejes */}
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={`x${t}`}>
          <line
            x1={xOf(t)} y1={PAD.top} x2={xOf(t)} y2={H - PAD.bottom}
            stroke="#dad9de" strokeWidth="1"
          />
          <text x={xOf(t)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="#615e6b">
            {t}%
          </text>
        </g>
      ))}
      {[3, 6, 9, 12, 15].map((p) => (
        <g key={`y${p}`}>
          <line
            x1={PAD.left} y1={yOf(p)} x2={W - PAD.right} y2={yOf(p)}
            stroke="#dad9de" strokeWidth="1"
          />
          <text x={PAD.left - 8} y={yOf(p) + 4} textAnchor="end" fontSize="11" fill="#615e6b">
            {p}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="#504d57">
        Carrera del vástago (%)
      </text>
      <text
        x={14} y={H / 2} textAnchor="middle" fontSize="12" fill="#504d57"
        transform={`rotate(-90 14 ${H / 2})`}
      >
        P_act (psi)
      </text>

      {/* Corredor del resorte ± rozamiento */}
      <polygon points={`${bandTop} ${bandBottom}`} fill="#dad9de" opacity="0.55" />
      <polyline
        points={springLine} fill="none" stroke="#95929e" strokeWidth="1"
        strokeDasharray="4 3"
      />

      {/* Lazo de histéresis del ciclo ejecutado */}
      {cycle && (
        <>
          <polyline
            data-testid="signature-branch-up"
            points={toPath(cycle.up)}
            fill="none" stroke="#44424a" strokeWidth="1.6"
          />
          <polyline
            data-testid="signature-branch-down"
            points={toPath(cycle.down)}
            fill="none" stroke="#95929e" strokeWidth="1.4" strokeDasharray="3 2.5"
          />
        </>
      )}

      {/* Punto operativo en vivo */}
      {livePActPsi !== null && liveTravelPercent !== null && (
        <circle
          data-testid="signature-live-point"
          cx={xOf(liveTravelPercent)}
          cy={yOf(livePActPsi)}
          r="4.5"
          fill="#f7f7f8"
          stroke="#1c1c1f"
          strokeWidth="2"
        />
      )}
    </svg>
  )
}
