/**
 * Nivel 3 — Detalle de equipo (REQ-UI-02/03): indicadores analógicos de barra
 * con banda normal y límite de alarma, más el panel de explicación contextual
 * (principio "Con propósito": todo comportamiento invisible en la realidad se
 * explica en pantalla) que aparece SOLO cuando hay algo que explicar.
 */
import { BarIndicator } from '../components/BarIndicator'
import { useSim } from '../state/sim-context'

/** Cv = 50 por default del engine; Kv = Cv / 1.156 (IEC 60534). */
const KV_DEFAULT = 50 / 1.156

export function ValveDetailView() {
  const { snapshot, openModal, navigate } = useSim()

  if (!snapshot) {
    return (
      <section className="p-4 text-neutral-700">Esperando snapshots del worker…</section>
    )
  }

  const sp = snapshot.spBar
  const flowLimit = KV_DEFAULT * Math.sqrt(snapshot.dpChokedBar)

  const explanations: { title: string; body: string; testId: string }[] = []
  if (snapshot.choked) {
    explanations.push({
      testId: 'explain-choked',
      title: 'Cavitación crítica — caudal saturado',
      body:
        `La caída de presión ΔP = P1 − P2 = ${(snapshot.p1Bar - snapshot.p2Bar).toFixed(1)} bar supera el ` +
        `umbral F_L²·(P1 − r_c·P_v) = ${snapshot.dpChokedBar.toFixed(1)} bar: a la entrada del asiento la presión ` +
        'cae por debajo de la presión de vapor y el fluido hierve localmente, formando cavidades de vapor que ' +
        'colapsan aguas abajo. El caudal no puede crecer más: satura en ≈ ' +
        `${flowLimit.toFixed(0)} m³/h aunque la válvula abra más. En Vaca Muerta (P1 alta, drawdown agresivo) ` +
        'es la causa principal de ruido, vibración y picado del asiento. No es una falla del PID: es la física ' +
        'del estrangulamiento (IEC 60534-2-1).',
    })
  }
  if (snapshot.valveStuck) {
    explanations.push({
      testId: 'explain-stuck',
      title: 'Vástago pegado (stick-slip)',
      body:
        'El vástago está quieto porque la fuerza neta no supera el rozamiento estático de la empaquetadura ' +
        '(mayor que el dinámico). Es la zona muerta mecánica en acción: pequeños cambios de consigna no mueven ' +
        'la válvula hasta acumular fuerza suficiente, y al despegar salta de golpe. La firma de válvula (Nivel 4) ' +
        'cuantifica este efecto como ancho de histéresis.',
    })
  }
  if (snapshot.quality === 'BAD_SENSOR_FAILURE') {
    explanations.push({
      testId: 'explain-sensor-fault',
      title: 'TB_Sensor_Fault activo en PT-101',
      body:
        'El Transducer Block reporta falla: AI.PV retiene el último valor válido y marca la calidad ' +
        'BAD_SENSOR_FAILURE. El lazo PID está gobernando con un valor congelado — la desviación SP−PV que ves ' +
        'es consecuencia de la mala medición, no del proceso. Diagnosticá con la calibración AMS (Nivel 4).',
    })
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <nav className="flex items-center gap-2 text-sm text-neutral-600">
        <button type="button" className="hover:underline" onClick={() => navigate('overview')}>
          ← Nivel 1
        </button>
        <span aria-hidden>/</span>
        <button type="button" className="hover:underline" onClick={() => navigate('skid')}>
          VM-101
        </button>
        <span aria-hidden>/</span>
        <span className="font-semibold text-neutral-900">Nivel 3 · FCV-101 Válvula de control</span>
      </nav>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-3 xl:col-span-2">
          <div className="flex flex-col gap-2.5 rounded bg-neutral-100 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-800">
              Indicadores con bandas de operación
            </h3>
            <BarIndicator
              testId="bi-opening"
              label="Posición válvula"
              unit="%"
              min={0}
              max={100}
              value={snapshot.valveOpeningPercent}
              normalMin={0}
              normalMax={100}
            />
            <BarIndicator
              testId="bi-pact"
              label="P_actuador"
              unit="psi"
              min={3}
              max={15}
              value={snapshot.pActPsi}
              normalMin={3}
              normalMax={15}
            />
            <BarIndicator
              testId="bi-flow"
              label="Caudal"
              unit="m³/h"
              min={0}
              max={400}
              value={snapshot.flowM3h}
              normalMin={0}
              normalMax={flowLimit}
              alarmHigh={flowLimit}
            />
            <BarIndicator
              testId="bi-p1"
              label="P1 aguas arriba"
              unit="bar"
              min={0}
              max={180}
              value={snapshot.p1Bar}
              normalMin={80}
              normalMax={120}
            />
            <BarIndicator
              testId="bi-pv"
              label="PV (P2 vasija)"
              unit="bar"
              min={0}
              max={100}
              value={snapshot.pvBar}
              normalMin={sp - 5}
              normalMax={sp + 5}
            />
          </div>

          {explanations.length > 0 && (
            <div
              data-testid="explanation-panel"
              className="flex flex-col gap-3 rounded border-l-4 border-alarm-high bg-neutral-100 p-4 shadow-sm"
            >
              {explanations.map((ex) => (
                <div key={ex.testId} data-testid={ex.testId}>
                  <h3 className="text-sm font-bold text-neutral-900">{ex.title}</h3>
                  <p className="mt-0.5 text-sm text-neutral-700">{ex.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded bg-neutral-100 p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-800">Diagnóstico del equipo</h3>
            <button
              type="button"
              data-testid="open-signature-modal"
              onClick={() => openModal('signature')}
              className="rounded-sm border border-neutral-400 bg-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-300"
            >
              Firma de válvula P_act vs. carrera (Nivel 4)
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
            <h3 className="mb-1 text-sm font-semibold text-neutral-800">Lazo completo</h3>
            <p className="font-mono text-xs leading-relaxed">
              SP → PID (P+I, anti-windup) → posicioner I/P 3–15 psi → vástago (resorte +
              fricción de empaquetadura) → estrangulamiento IEC 60534-2-1 → vasija →
              transmisor TB→AI → PV.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
