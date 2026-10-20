/**
 * Tendencia en vivo (REQ-NFUN-PERF-01, ≥ 20 FPS) con lightweight-charts.
 * El worker tick a ~100 Hz; este componente acumula los puntos y los vuelca
 * a las series como máximo cada 50 ms (20 FPS) para no saturar el render.
 *
 * Las series usan solo grises (REQ-UI-01): se distinguen por tono, grosor y
 * trazo (la consigna SP va punteada, como marca de referencia).
 */
import { useEffect, useRef } from 'react'
import {
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { useSim } from '../state/sim-context'

/** Mínimo intervalo entre volcados de puntos a las series [ms]. */
const FLUSH_MS = 50

interface SeriesDef {
  readonly key: 'sp' | 'pv' | 'p1' | 'p2' | 'flow'
  readonly label: string
  readonly color: string
  readonly lineWidth: 1 | 2
  readonly lineStyle?: LineStyle
}

const SERIES: readonly SeriesDef[] = [
  { key: 'sp', label: 'SP', color: '#95929e', lineWidth: 1, lineStyle: LineStyle.Dashed },
  { key: 'pv', label: 'PV', color: '#1c1c1f', lineWidth: 2 },
  { key: 'p1', label: 'P1', color: '#615e6b', lineWidth: 1 },
  { key: 'p2', label: 'P2', color: '#bab8c1', lineWidth: 1 },
  { key: 'flow', label: 'Caudal', color: '#44424a', lineWidth: 2 },
]

function fmtTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TrendChart() {
  const { subscribeTick } = useSim()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const times: number[] = []
    let pending: { time: number; values: Record<SeriesDef['key'], number> }[] = []
    let lastFlush = 0
    let index = 0

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#f7f7f8' },
        textColor: '#504d57',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#dad9de' },
        horzLines: { color: '#dad9de' },
      },
      rightPriceScale: { borderColor: '#bab8c1' },
      timeScale: {
        borderColor: '#bab8c1',
        timeVisible: false,
        tickMarkFormatter: (time: Time) => fmtTime(times[time as number] ?? 0),
      },
      crosshair: {
        vertLine: { color: '#787582', labelBackgroundColor: '#504d57' },
        horzLine: { color: '#787582', labelBackgroundColor: '#504d57' },
      },
    })

    chart.timeScale().fitContent()

    const seriesByKey = new Map<SeriesDef['key'], ISeriesApi<'Line'>>()
    for (const def of SERIES) {
      seriesByKey.set(
        def.key,
        chart.addSeries(LineSeries, {
          color: def.color,
          lineWidth: def.lineWidth,
          lineStyle: def.lineStyle ?? LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: def.key === 'pv',
        }),
      )
    }

    const unsubscribe = subscribeTick((snapshot) => {
      index += 1
      times.push(snapshot.t)
      pending.push({
        time: index,
        values: {
          sp: snapshot.spBar,
          pv: snapshot.pvBar,
          p1: snapshot.p1Bar,
          p2: snapshot.p2Bar,
          flow: snapshot.flowM3h,
        },
      })
      const now = performance.now()
      if (now - lastFlush < FLUSH_MS) return
      lastFlush = now
      const batch = pending
      pending = []
      for (const point of batch) {
        for (const def of SERIES) {
          seriesByKey.get(def.key)?.update({ time: point.time as Time, value: point.values[def.key] })
        }
      }
    })

    return () => {
      unsubscribe()
      chart.remove()
    }
  }, [subscribeTick])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-4 px-1 text-xs text-neutral-700">
        {SERIES.map((def) => (
          <span key={def.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5"
              style={{
                backgroundColor: def.color,
                borderTop: def.lineStyle === LineStyle.Dashed ? '2px dashed' : undefined,
              }}
            />
            {def.label}
          </span>
        ))}
        <span className="ml-auto text-neutral-500">eje X: tiempo de proceso (mm:ss)</span>
      </div>
      <div ref={containerRef} data-testid="trend-chart" className="h-56 w-full" />
    </div>
  )
}
