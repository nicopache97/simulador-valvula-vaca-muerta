/**
 * Símbolo de alarma ISA-18.2 (REQ-UI-04): codificación redundante
 * color + forma geométrica + número de prioridad, distinguible en escala
 * de grises solo por la forma (cuadrado / triángulo / círculo).
 */
const SYMBOLS = {
  1: {
    label: 'Alarma prioridad 1 (crítica)',
    svg: (
      <rect x="2" y="2" width="20" height="20" rx="1" fill="#ed113b" />
    ),
    textFill: '#ffffff',
  },
  2: {
    label: 'Alarma prioridad 2 (alta)',
    svg: <polygon points="12,2 22,21 2,21" fill="#e7ac0b" />,
    textFill: '#1c1c1f',
  },
  3: {
    label: 'Alarma prioridad 3 (baja)',
    svg: <circle cx="12" cy="12" r="10" fill="#006bcb" />,
    textFill: '#ffffff',
  },
} as const

export function AlarmSymbol({ priority }: { priority: 1 | 2 | 3 }) {
  const symbol = SYMBOLS[priority]
  return (
    <svg
      role="img"
      aria-label={symbol.label}
      data-testid={`alarm-symbol-${priority}`}
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
    >
      {symbol.svg}
      <text
        x="12"
        y={priority === 2 ? 19 : 16.5}
        textAnchor="middle"
        fontSize="12"
        fontWeight="bold"
        fill={symbol.textFill}
      >
        {priority}
      </text>
    </svg>
  )
}
