/**
 * Definición de las series de la tendencia (corrección v0.9.0): color distinto
 * y consistente por variable —Okabe-Ito, segura para daltónicos— con
 * codificación redundante de grosor/trazo (estilo ISA-18.2), de modo que las
 * series sigan siendo distinguibles al imprimirse en escala de grises. Es la
 * única excepción de color de la HMI: el resto sigue en gris ISA-101
 * (REQ-UI-01), donde el color saturado queda reservado a alarmas.
 */
import { LineStyle } from 'lightweight-charts'

export interface SeriesDef {
  readonly key: 'sp' | 'pv' | 'pos' | 'p1' | 'p2' | 'flow'
  readonly label: string
  readonly color: string
  readonly lineWidth: 1 | 2 | 3
  readonly lineStyle?: LineStyle
}

/**
 * Okabe-Ito (colorblind-safe): SP azul #0072B2, PV naranja #E69F00,
 * Posición verde #009E73, P1 magenta #CC79A7, P2 celeste #56B4E9 (punteado),
 * Caudal bermellón #D55E00. Grosor y trazo refuerzan el color.
 */
export const TREND_SERIES: readonly SeriesDef[] = [
  { key: 'sp', label: 'SP', color: '#0072B2', lineWidth: 1, lineStyle: LineStyle.Dashed },
  { key: 'pv', label: 'PV', color: '#E69F00', lineWidth: 3 },
  { key: 'pos', label: 'Posición', color: '#009E73', lineWidth: 2 },
  { key: 'p1', label: 'P1', color: '#CC79A7', lineWidth: 1 },
  { key: 'p2', label: 'P2', color: '#56B4E9', lineWidth: 1, lineStyle: LineStyle.Dotted },
  { key: 'flow', label: 'Caudal', color: '#D55E00', lineWidth: 2 },
]

/** dasharray SVG equivalente al LineStyle de lightweight-charts (leyenda). */
export function dashFor(def: SeriesDef): string | undefined {
  if (def.lineStyle === LineStyle.Dashed) return '6 3'
  if (def.lineStyle === LineStyle.Dotted) return '1 3'
  return undefined
}
