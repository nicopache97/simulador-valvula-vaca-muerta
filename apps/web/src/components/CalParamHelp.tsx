/**
 * Ayuda contextual de la Calibración AMS (REQ-UI-06, v0.9.0): botón (i) por
 * parámetro que despliega su explicación (contenido en `./cal-help-content`).
 */
import { CAL_HELP, type CalParam } from './cal-help-content'

/**
 * Botón (i) con panel desplegable de ayuda para un parámetro de calibración.
 * Un solo panel abierto por pestaña: el estado vive en el padre.
 */
export function CalParamInfo({
  param,
  open,
  onToggle,
}: {
  param: CalParam
  open: boolean
  onToggle: () => void
}) {
  const help = CAL_HELP[param]
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        data-testid={`help-${param}`}
        aria-expanded={open}
        aria-label={`Ayuda: ${help.title.split('—')[0].trim()}`}
        onClick={onToggle}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-neutral-400 bg-neutral-50 text-[10px] font-bold text-neutral-600 hover:bg-neutral-300"
      >
        i
      </button>
      {open && (
        <span
          role="note"
          data-testid={`help-${param}-panel`}
          className="absolute left-0 top-6 z-10 block w-80 rounded-sm border border-neutral-400 bg-neutral-50 p-2 text-xs font-normal normal-case leading-snug tracking-normal text-neutral-700 shadow-lg"
        >
          <strong className="mb-1 block text-neutral-900">{help.title}</strong>
          {help.body}
        </span>
      )}
    </span>
  )
}
