/**
 * Worker de simulación en tiempo real (EP-03): corre el engine a 100 Hz,
 * recibe comandos UI → worker y postea snapshots worker → UI. Delega todo
 * el comportamiento en `createWorkerLoop` (testeable en Node); este archivo
 * solo cablea `onmessage`/`postMessage` del DedicatedWorkerGlobalScope.
 */
import type { SimCommand, SimEvent } from '@sim/shared'
import { createWorkerLoop } from './worker-loop'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SimCommand>) => void) | null
  postMessage(event: SimEvent): void
}

const loop = createWorkerLoop((event) => scope.postMessage(event))

scope.onmessage = (event) => {
  loop.dispatch(event.data)
}
