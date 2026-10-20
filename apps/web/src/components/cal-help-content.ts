/**
 * Contenido de la ayuda contextual de la Calibración AMS (REQ-UI-06, v0.9.0):
 * por cada parámetro (LRV, URV, damping τ, Zero Trim, Span Trim) explica en
 * lenguaje simple qué es el término, para qué sirve y las consecuencias de
 * subirlo/bajarlo, con datos concretos de Vaca Muerta. Los textos reflejan el
 * comportamiento real implementado en `packages/physics/src/transmitter.ts`:
 * damping de primer orden exacto, trims de offset/ganancia y re-rango digital
 * con límite de turndown 400:1.
 */

export type CalParam = 'lrv' | 'urv' | 'tau' | 'zero' | 'span'

export interface CalHelpDef {
  readonly title: string
  readonly body: string
}

export const CAL_HELP: Record<CalParam, CalHelpDef> = {
  lrv: {
    title: 'LRV — límite inferior del rango (0% de escala)',
    body:
      'Es la presión que el Function Block AI toma como 0% de escala: la indicación se calcula como ' +
      'PV% = (lectura − LRV) / (URV − LRV) · 100. El re-rango es 100% digital: no toca la medición física, ' +
      'solo la escala. SUBIR el LRV (con URV fijo) achica el span ⇒ la indicación gana resolución ' +
      '(cada % vale menos bar), pero si la presión real cae por debajo del LRV el AI se clava en 0% ' +
      '(LOW_LIMITED) y el PID queda ciego ante la caída. Ejemplo Vaca Muerta: gas de baja presión 0–40 mbar ' +
      'medido con un PT de span nominal 0–400 mbar ⇒ LRV = 0, URV = 40: cada 1% vale 0.4 mbar en vez de 4 ' +
      '(turndown 10:1, cómodo dentro del límite del transmisor de 400:1).',
  },
  urv: {
    title: 'URV — límite superior del rango (100% de escala)',
    body:
      'Es la presión que el AI toma como 100% de escala. BAJAR el URV aumenta la resolución de la ' +
      'indicación alrededor del punto de operación, pero si la presión real supera el URV el AI satura en ' +
      '100% (HIGH_LIMITED) y el lazo no ve el exceso — el PID cree que la variable está en consigna. El span ' +
      'no puede ser menor que el span nominal / 400 (turndown máx. 400:1: el transmisor lo rechaza). Ejemplo: ' +
      'el PT-101 del patín VM-101 viene de fábrica 0–100 bar; si el gas opera en 20–40 bar, re-rangear a URV ' +
      '40 convierte 1 bar en 2.5% de escala (mejor resolución), pero con 45 bar reales la indicación se clava ' +
      'en 100% y la alarma de desviación jamás dispara.',
  },
  tau: {
    title: 'Damping τ — constante de tiempo del filtro del AI',
    body:
      'El FB AI aplica un filtro de primer orden con constante de tiempo τ: tras un escalón, la lectura ' +
      'recorre el 63% de la diferencia en τ segundos y ~95% en 3τ (actualización exacta, independiente del ' +
      'paso de integración). SUBIRLO: tendencia estable y sin saltos, pero el PV llega tarde al PID y el lazo ' +
      'responde lento — podés enmascarar un transitorio real. BAJARLO: lectura más viva pero saltarina, y con ' +
      'gas en drawdown pulsante el PID se moverá detrás del ruido. Ejemplo Vaca Muerta: la pulsación típica de ' +
      '1–2 s de compresores en línea de gas desaparece de la tendencia con τ = 2 s; con τ = 0 llega entera al ' +
      'lazo.',
  },
  zero: {
    title: 'Zero Trim — ajuste de cero con patrón (HART cmd 35)',
    body:
      'Corrige un OFFSET: una desviación constante que afecta toda la escala por igual. Aplicás un patrón ' +
      'conocido al proceso (p. ej. una referencia rastreada) y el transmisor recalcula la corrección para que ' +
      'la lectura coincida con él en ese punto; como es de offset, la corrección se propaga a todo el rango. ' +
      'Si el cero queda corrido, TODA la escala indica de más (o de menos) en la misma cantidad: nunca lo ' +
      'dejes pasar antes de un Span Trim. Ejemplo: con el pozo cerrado y la línea venteada, el PT-101 debería ' +
      'leer 0 bar; si marca +0.8 bar, un Zero Trim con patrón 0 borra ese +0.8 en todos los puntos (a 50 bar ' +
      'indicará 50.0, no 50.8).',
  },
  span: {
    title: 'Span Trim — ajuste de span con patrón (HART cmd 36)',
    body:
      'Corrige la GANANCIA (la pendiente de la característica del sensor), no el offset. La corrección es ' +
      'PROPORCIONAL a la lectura: a mitad de escala corrige la mitad, en el cero no corrige nada — de hecho ' +
      'con lectura primaria cero el ajuste es indeterminado y el transmisor lo rechaza. Por eso se hace en el ' +
      'punto alto del rango, después de corregir el cero. Ejemplo: a 100 bar el patrón de referencia dice ' +
      '98.0 ⇒ el trim corrige la ganancia un −2%; a 50 bar corrige −1 bar y a 25 bar −0.5. Un error de span ' +
      'crece con la presión: cuanto más drawdown, más barres.',
  },
}
