/**
 * Esquema de planta simplificado del Nivel 1 (corrección v0.9.0): de un
 * vistazo muestra QUÉ se está operando — pozo/cabezal de Vaca Muerta → línea
 * de proceso → válvula de control FCV-101 → transmisor PT-101 → colector —
 * con los valores vivos del snapshot. Clickeable: abre el Nivel 2 (mismo
 * recorrido que la tarjeta VM-101). Paleta gris ISA-101 (REQ-UI-01).
 */
import { useSim } from '../state/sim-context'

const INK = '#44424a'
const INK_SOFT = '#504d57'
const INK_FAINT = '#615e6b'
const FILL = '#efeef0'
const FILL_SOFT = '#dad9de'

export function PlantSchematic() {
  const { snapshot, navigate } = useSim()
  const opening = snapshot?.valveOpeningPercent ?? null

  // Vástago de FCV-101 con posición en vivo: el taco (plug) se levanta de la
  // línea de proceso a medida que crece la carrera (0% = asentado).
  const plugTop = opening === null ? 78 : 92 - 36 * (opening / 100)

  return (
    <svg
      role="button"
      tabIndex={0}
      aria-label="Esquema de planta: pozo VM-101 → FCV-101 → PT-101 → colector — abrir patín de medición (Nivel 2)"
      data-testid="plant-schematic"
      onClick={() => navigate('skid')}
      onKeyDown={(e) => e.key === 'Enter' && navigate('skid')}
      viewBox="0 0 640 210"
      className="w-full cursor-pointer rounded bg-neutral-50 hover:bg-neutral-100"
    >
      {/* Cabezal / pozo (shale gas Vaca Muerta) */}
      <g data-testid="plant-wellhead">
        <path d="M 20 96 l 14 -22 h 20 l 14 22 z" fill={FILL} stroke={INK} strokeWidth="2" />
        <line x1="30" y1="74" x2="58" y2="74" stroke={INK} strokeWidth="2" />
        <text x="44" y="118" textAnchor="middle" fontSize="11" fill={INK_SOFT} fontFamily="monospace">
          Pozo VM-101
        </text>
        <text x="44" y="132" textAnchor="middle" fontSize="10" fill={INK_FAINT} fontFamily="monospace">
          shale gas
        </text>
      </g>

      {/* Línea de proceso desde el cabezal */}
      <line x1="68" y1="96" x2="240" y2="96" stroke={INK} strokeWidth="3" />
      <text x="150" y="84" textAnchor="middle" fontSize="11" fill={INK_FAINT} fontFamily="monospace">
        línea de proceso · P1 = {snapshot?.p1Bar.toFixed(0) ?? '—'} bar
      </text>

      {/* FCV-101: válvula de control (bowtie) con vástago en vivo */}
      <g data-testid="plant-fcv-101">
        <polygon points="240,78 240,114 275,96" fill={FILL_SOFT} stroke={INK} strokeWidth="2" />
        <polygon points="310,78 310,114 275,96" fill={FILL_SOFT} stroke={INK} strokeWidth="2" />
        <line x1="275" y1="48" x2="275" y2={plugTop} stroke={INK} strokeWidth="2" />
        <rect
          x="268"
          y={plugTop}
          width="14"
          height="8"
          fill={FILL}
          stroke={INK}
          strokeWidth="2"
          data-testid="plant-valve-plug"
          data-travel={opening === null ? '' : opening.toFixed(1)}
        />
        <text x="275" y="40" textAnchor="middle" fontSize="12" fontWeight="bold" fill={INK_SOFT} fontFamily="monospace">
          FCV-101
        </text>
        <text x="275" y="138" textAnchor="middle" fontSize="11" fill={INK_FAINT} fontFamily="monospace">
          {opening === null ? '' : `apertura ${opening.toFixed(0)}%`}
        </text>
      </g>

      {/* Tramo aguas abajo de la válvula */}
      <line x1="310" y1="96" x2="392" y2="96" stroke={INK} strokeWidth="3" />
      <text x="352" y="84" textAnchor="middle" fontSize="11" fill={INK_FAINT} fontFamily="monospace">
        {snapshot ? `${snapshot.flowM3h.toFixed(0)} m³/h` : ''}
      </text>

      {/* PT-101: transmisor de presión sobre la línea */}
      <g data-testid="plant-pt-101">
        <line x1="352" y1="96" x2="352" y2="122" stroke={INK} strokeWidth="2" />
        <circle cx="352" cy="138" r="15" fill={FILL} stroke={INK} strokeWidth="2" />
        <text x="352" y="142" textAnchor="middle" fontSize="10" fontWeight="bold" fill={INK_SOFT} fontFamily="monospace">
          PT
        </text>
        <text x="352" y="170" textAnchor="middle" fontSize="11" fill={INK_SOFT} fontFamily="monospace">
          PT-101
        </text>
      </g>

      {/* Colector de producción */}
      <g data-testid="plant-manifold">
        <path d="M 392 76 h 150 a 16 16 0 0 1 16 16 v 4 a 16 16 0 0 1 -16 16 h -150 a 16 16 0 0 1 -16 -16 v -4 a 16 16 0 0 1 16 -16 z" fill={FILL} stroke={INK} strokeWidth="2" transform="translate(0 -6)" />
        <text x="474" y="92" textAnchor="middle" fontSize="11" fill={INK_SOFT} fontFamily="monospace">
          Colector
        </text>
        <text x="474" y="108" textAnchor="middle" fontSize="11" fill={INK_SOFT} fontFamily="monospace">
          P2 = {snapshot?.p2Bar.toFixed(1) ?? '—'} bar
        </text>
      </g>
      <text x="620" y="200" textAnchor="end" fontSize="10" fill={INK_FAINT} fontFamily="monospace">
        clic para operar el patín →
      </text>
    </svg>
  )
}
