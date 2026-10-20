/**
 * TC-GEN-02 (EP-05) — Carga, metadatos e instanciación de la FMU desde
 * JavaScript/WASM, replicando el caso de prueba del documento fuente:
 *   1. Invocar fmi3InstantiateCoSimulation desde el entorno JS/WASM.
 *   2. Verificar la extracción correcta de las variables de entrada/salida
 *      definidas en modelDescription.xml (valueReferences XML ≡ binario).
 *   3. Ejecutar 100 pasos con fmi3DoStep (dt = 10 ms, rampa de SP).
 * Resultado esperado: fmi3OK en todo, referencias correctas, salidas finitas
 * y consistentes con el engine TS de @sim/physics (< 1e-9 relativo — es el
 * mismo algoritmo en f64).
 */
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { createSimulation, stepSimulation, toSnapshot } from '@sim/physics'
import type { SimulationState } from '@sim/physics'
import type { SimSnapshot } from '@sim/shared'

const FMU_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const FMU_PATH = join(FMU_DIR, 'dist', 'ValvulaTransmisor.fmu')
const SCHEMA_DIR = join(FMU_DIR, 'schema')

const FMI_OK = 0
const FMI_ERROR = 3
const DT = 0.01
const STEPS = 100

// ---------------------------------------------------------------------------
// Carga del paquete .fmu (metadatos + binario) — precondición de TC-GEN-02.
const zip = new AdmZip(FMU_PATH)
const entries = zip.getEntries().map((e) => e.entryName)
const xml = zip.readAsText('modelDescription.xml')
const wasmBytes = zip.readFile('binaries/wasm32/ValvulaTransmisor.wasm')

interface XmlVar {
  type: 'Float64' | 'Int32'
  name: string
  vr: number
  causality: string
  variability: string
  start?: string
}

function parseVariables(xmlText: string): XmlVar[] {
  const vars: XmlVar[] = []
  const re = /<(Float64|Int32)\s+([^>]*?)\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xmlText)) !== null) {
    const attrs: Record<string, string> = {}
    const attrRe = /(\w[\w-]*)="([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(m[2])) !== null) {
      attrs[a[1]] = a[2]
    }
    vars.push({
      type: m[1] as XmlVar['type'],
      name: attrs.name,
      vr: Number(attrs.valueReference),
      causality: attrs.causality ?? 'local',
      variability: attrs.variability ?? 'continuous',
      start: attrs.start,
    })
  }
  return vars
}

const xmlVars = parseVariables(xml)
const byName = new Map(xmlVars.map((v) => [v.name, v]))
const outputs = xmlVars.filter((v) => v.causality === 'output')
const params = xmlVars.filter((v) => v.causality === 'parameter')

// ---------------------------------------------------------------------------
// Loader del binario WASM (FMI instance = índice i32; arrays VR/values por
// memoria lineal en los offsets de scratch exportados, como la C-API con punteros).
interface FmuExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  SCRATCH_VR: WebAssembly.Global
  SCRATCH_F64: WebAssembly.Global
  SCRATCH_I32: WebAssembly.Global
  fmi3InstantiateCoSimulation(): number
  fmi3FreeInstance(instance: number): void
  fmi3EnterInitializationMode(instance: number): number
  fmi3ExitInitializationMode(instance: number): number
  fmi3DoStep(instance: number, communicationStepSize: number): number
  fmi3SetFloat64(i: number, vrPtr: number, nvr: number, valuesPtr: number, n: number): number
  fmi3GetFloat64(i: number, vrPtr: number, nvr: number, valuesPtr: number, n: number): number
  fmi3SetInt32(i: number, vrPtr: number, nvr: number, valuesPtr: number, n: number): number
  fmi3GetInt32(i: number, vrPtr: number, nvr: number, valuesPtr: number, n: number): number
}

async function instantiateFmu() {
  const { instance } = await WebAssembly.instantiate(wasmBytes as Uint8Array, {
    env: {
      abort: () => {
        throw new Error('abort en runtime WASM')
      },
    },
  })
  const e = instance.exports as FmuExports
  const mem = new DataView(e.memory.buffer)

  const setF64 = (inst: number, pairs: Array<[number, number]>) => {
    pairs.forEach(([vr, val], i) => {
      mem.setInt32(e.SCRATCH_VR.value + i * 4, vr, true)
      mem.setFloat64(e.SCRATCH_F64.value + i * 8, val, true)
    })
    return e.fmi3SetFloat64(inst, e.SCRATCH_VR.value, pairs.length, e.SCRATCH_F64.value, pairs.length)
  }
  const getF64 = (inst: number, vrs: number[]) => {
    vrs.forEach((vr, i) => mem.setInt32(e.SCRATCH_VR.value + i * 4, vr, true))
    const status = e.fmi3GetFloat64(inst, e.SCRATCH_VR.value, vrs.length, e.SCRATCH_F64.value, vrs.length)
    return { status, values: vrs.map((_, i) => mem.getFloat64(e.SCRATCH_F64.value + i * 8, true)) }
  }
  const setI32 = (inst: number, pairs: Array<[number, number]>) => {
    pairs.forEach(([vr, val], i) => {
      mem.setInt32(e.SCRATCH_VR.value + i * 4, vr, true)
      mem.setInt32(e.SCRATCH_I32.value + i * 4, val, true)
    })
    return e.fmi3SetInt32(inst, e.SCRATCH_VR.value, pairs.length, e.SCRATCH_I32.value, pairs.length)
  }
  const getI32 = (inst: number, vrs: number[]) => {
    vrs.forEach((vr, i) => mem.setInt32(e.SCRATCH_VR.value + i * 4, vr, true))
    const status = e.fmi3GetInt32(inst, e.SCRATCH_VR.value, vrs.length, e.SCRATCH_I32.value, vrs.length)
    return { status, values: vrs.map((_, i) => mem.getInt32(e.SCRATCH_I32.value + i * 4, true)) }
  }
  return { e, setF64, getF64, setI32, getI32 }
}

// Relación nombre de salida XML → campo del snapshot del engine TS.
const OUT_TO_SNAPSHOT: Record<string, keyof SimSnapshot | 'chokedFlag' | 't'> = {
  pvPercent: 'pvPercent',
  valveOpening: 'valveOpeningPercent',
  pAct: 'pActPsi',
  flow: 'flowM3h',
  choked: 'chokedFlag',
  pvBar: 'pvBar',
  p1Bar: 'p1Bar',
  p2Bar: 'p2Bar',
  dpChokedBar: 'dpChokedBar',
  pidOutPercent: 'pidOutPercent',
  time: 't',
}

function snapValue(snap: SimSnapshot, xmlName: string): number {
  const key = OUT_TO_SNAPSHOT[xmlName]
  if (key === 'chokedFlag') return snap.choked ? 1 : 0
  const v = snap[key as keyof SimSnapshot]
  return typeof v === 'number' ? v : NaN
}

function expectClose(actual: number, expected: number, ctx: string) {
  const tol = 1e-9 * Math.max(1, Math.abs(expected))
  expect(Math.abs(actual - expected), `${ctx}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol)
}

const QUALITY_CODE: Record<string, number> = {
  GOOD: 0,
  UNCERTAIN: 1,
  BAD_SENSOR_FAILURE: 2,
}

const hasXmllint = (() => {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

// ---------------------------------------------------------------------------
describe('TC-GEN-02 — paquete .fmu y metadatos (modelDescription.xml)', () => {
  it('la FMU existe con el layout wasm32 exigido (modelDescription.xml + binaries/wasm32/*.wasm)', () => {
    expect(existsSync(FMU_PATH)).toBe(true)
    expect(entries).toContain('modelDescription.xml')
    expect(entries).toContain('binaries/wasm32/ValvulaTransmisor.wasm')
  })

  it('atributos raíz requeridos por FMI 3.0.2 y CoSimulation con modelIdentifier', () => {
    expect(xml).toContain('fmiVersion="3.0.2"')
    expect(xml).toMatch(/modelName="ValvulaTransmisor"/)
    expect(xml).toMatch(/instantiationToken="\{[0-9a-f-]+\}"/)
    expect(xml).toMatch(/<CoSimulation\s[^>]*modelIdentifier="ValvulaTransmisor"/)
    expect(xml).toContain('canHandleVariableCommunicationStepSize="true"')
  })

  it('valueReferences únicos y ModelStructure ⊆ variables declaradas', () => {
    const vrs = xmlVars.map((v) => v.vr)
    expect(new Set(vrs).size).toBe(vrs.length)
    const declared = new Set(vrs)
    const structRe = /<Output\s+valueReference="(\d+)"/g
    let m: RegExpExecArray | null
    const structVrs: number[] = []
    while ((m = structRe.exec(xml)) !== null) structVrs.push(Number(m[1]))
    expect(structVrs.length).toBeGreaterThan(0)
    for (const vr of structVrs) {
      expect(declared.has(vr), `ModelStructure referencia vr ${vr} no declarado`).toBe(true)
    }
    // Toda salida declarada debe figurar en ModelStructure (y viceversa).
    expect(new Set(structVrs)).toEqual(new Set(outputs.map((o) => o.vr)))
  })

  it('variables de entrada/salida requeridas por TC-GEN-02 con causalidad correcta', () => {
    for (const name of ['spBar', 'scenario']) {
      expect(byName.get(name)?.causality, `${name} debe ser input`).toBe('input')
    }
    for (const name of [
      'pvPercent',
      'valveOpening',
      'pAct',
      'flow',
      'choked',
      'quality',
      'pvBar',
      'p1Bar',
      'p2Bar',
      'dpChokedBar',
      'pidOutPercent',
    ]) {
      expect(byName.get(name)?.causality, `${name} debe ser output`).toBe('output')
    }
    for (const p of params) {
      expect(['fixed', 'tunable']).toContain(p.variability)
      expect(p.start, `parámetro ${p.name} debe tener start`).toBeDefined()
    }
  })

  it.skipIf(!hasXmllint || !existsSync(join(SCHEMA_DIR, 'fmi3ModelDescription.xsd')))(
    'modelDescription.xml válido contra el esquema XSD oficial FMI 3.0.2 (xmllint)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'fmu-xsd-'))
      const xmlPath = join(dir, 'modelDescription.xml')
      writeFileSync(xmlPath, xml)
      // xmllint imprime "validates" en stderr y sale con código 0.
      const res = spawnSync('xmllint', [
        '--noout',
        '--schema',
        join(SCHEMA_DIR, 'fmi3ModelDescription.xsd'),
        xmlPath,
      ])
      expect(res.status, (res.stderr ?? '').toString()).toBe(0)
      expect((res.stderr ?? '').toString()).toContain('validates')
    },
  )
})

// ---------------------------------------------------------------------------
describe('TC-GEN-02 — instanciación y 100 pasos fmi3DoStep desde JS/WASM', () => {
  it('fmi3InstantiateCoSimulation + lifecycle devuelven fmi3OK', async () => {
    const { e } = await instantiateFmu()
    const inst = e.fmi3InstantiateCoSimulation()
    expect(inst).toBeGreaterThanOrEqual(0)
    expect(e.fmi3EnterInitializationMode(inst)).toBe(FMI_OK)
    expect(e.fmi3ExitInitializationMode(inst)).toBe(FMI_OK)
    e.fmi3FreeInstance(inst)
  })

  it('las valueReferences del XML leen/escriben en el binario (parámetros con su start)', async () => {
    const fmu = await instantiateFmu()
    const inst = fmu.e.fmi3InstantiateCoSimulation()
    fmu.e.fmi3ExitInitializationMode(inst)

    // Cada parámetro Float64 del XML: get devuelve su start declarado.
    for (const p of params) {
      if (p.type !== 'Float64') continue
      const { status, values } = fmu.getF64(inst, [p.vr])
      expect(status, `get ${p.name}`).toBe(FMI_OK)
      expectClose(values[0], Number(p.start), `start de ${p.name}`)
    }
    // Cada salida del XML: get finito y status OK.
    for (const o of outputs) {
      if (o.type === 'Float64') {
        const { status, values } = fmu.getF64(inst, [o.vr])
        expect(status, `get ${o.name}`).toBe(FMI_OK)
        expect(Number.isFinite(values[0]), `${o.name} finito`).toBe(true)
      } else {
        const { status, values } = fmu.getI32(inst, [o.vr])
        expect(status, `get ${o.name}`).toBe(FMI_OK)
        expect(values[0]).toBeGreaterThanOrEqual(0)
      }
    }
    fmu.e.fmi3FreeInstance(inst)
  })

  it('100 pasos con rampa de SP: todos fmi3OK, salidas finitas y ≡ engine TS (< 1e-9)', async () => {
    const fmu = await instantiateFmu()
    const inst = fmu.e.fmi3InstantiateCoSimulation()
    fmu.e.fmi3EnterInitializationMode(inst)
    fmu.e.fmi3ExitInitializationMode(inst)

    // Motor de referencia: mismos defaults y misma rampa de consigna.
    let sim: SimulationState = createSimulation({})
    const f64Outputs = outputs.filter((o) => o.type === 'Float64')
    const outVrs = f64Outputs.map((o) => o.vr)
    const outNames = f64Outputs.map((o) => o.name)

    for (let i = 0; i < STEPS; i++) {
      const spBar = 30 + 0.05 * i // rampa 30 → 34.95 bar
      expect(fmu.setF64(inst, [[byName.get('spBar')!.vr, spBar]]), `setSp paso ${i}`).toBe(FMI_OK)
      expect(fmu.e.fmi3DoStep(inst, DT), `DoStep paso ${i}`).toBe(FMI_OK)
      sim = stepSimulation(sim, { spBar }, DT)

      const { status, values } = fmu.getF64(inst, outVrs)
      expect(status).toBe(FMI_OK)
      const snap = toSnapshot(sim)
      values.forEach((value, k) => {
        expect(Number.isFinite(value), `${outNames[k]} finito en paso ${i}`).toBe(true)
        expectClose(value, snapValue(snap, outNames[k]), `${outNames[k]} paso ${i}`)
      })
      // quality (Int32) también coincide con el snapshot del engine.
      const q = fmu.getI32(inst, [byName.get('quality')!.vr])
      expect(q.values[0]).toBe(QUALITY_CODE[snap.quality])
    }
    expect(toSnapshot(sim).t).toBeCloseTo(STEPS * DT, 9)
    fmu.e.fmi3FreeInstance(inst)
  })

  it('escenario falla_sensor vía Int32: quality → BAD_SENSOR_FAILURE y PV retenido, ≡ engine', async () => {
    const fmu = await instantiateFmu()
    const inst = fmu.e.fmi3InstantiateCoSimulation()
    fmu.e.fmi3EnterInitializationMode(inst)
    // Parámetros del escenario antes de salir de inicialización.
    expect(
      fmu.setF64(inst, [[byName.get('faultAtSec')!.vr, 0.05]]),
    ).toBe(FMI_OK)
    expect(fmu.setI32(inst, [[byName.get('scenario')!.vr, 2]])).toBe(FMI_OK) // falla_sensor
    fmu.e.fmi3ExitInitializationMode(inst)

    let sim = createSimulation({ scenario: 'falla_sensor', faultAtSec: 0.05 })
    for (let i = 0; i < 10; i++) {
      expect(fmu.e.fmi3DoStep(inst, DT)).toBe(FMI_OK)
      sim = stepSimulation(sim, {}, DT)
    }
    const snap = toSnapshot(sim)
    expect(snap.quality).toBe('BAD_SENSOR_FAILURE')
    const { values: pv } = fmu.getF64(inst, [byName.get('pvBar')!.vr])
    const { values: pct } = fmu.getF64(inst, [byName.get('pvPercent')!.vr])
    const { values: quality } = fmu.getI32(inst, [byName.get('quality')!.vr])
    expectClose(pv[0], snap.pvBar, 'pvBar con falla')
    expectClose(pct[0], snap.pvPercent, 'pvPercent con falla')
    expect(quality[0]).toBe(QUALITY_CODE[snap.quality])
    fmu.e.fmi3FreeInstance(inst)
  })

  it('fmi3FreeInstance: operar la instancia liberada devuelve fmi3Error', async () => {
    const fmu = await instantiateFmu()
    const inst = fmu.e.fmi3InstantiateCoSimulation()
    fmu.e.fmi3FreeInstance(inst)
    expect(fmu.e.fmi3DoStep(inst, DT)).toBe(FMI_ERROR)
    expect(fmu.e.fmi3EnterInitializationMode(inst)).toBe(FMI_ERROR)
    const { status } = fmu.getF64(inst, [41])
    expect(status).toBe(FMI_ERROR)
  })

  it('VR desconocido en set devuelve fmi3Error (referencias validadas)', async () => {
    const fmu = await instantiateFmu()
    const inst = fmu.e.fmi3InstantiateCoSimulation()
    expect(fmu.setF64(inst, [[999, 1]])).toBe(FMI_ERROR)
    fmu.e.fmi3FreeInstance(inst)
  })
})
