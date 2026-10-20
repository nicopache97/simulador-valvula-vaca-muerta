/**
 * Empaqueta la FMU: modelDescription.xml + binaries/wasm32/<modelIdentifier>.wasm
 * → dist/ValvulaTransmisor.fmu (ZIP, convención FMI 3.0; estructura de
 * directorios según la plataforma wasm32 para módulos WASM instanciables
 * desde JavaScript — TC-GEN-02).
 */
import AdmZip from 'adm-zip'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelIdentifier = 'ValvulaTransmisor'
const wasmPath = join(root, 'dist', `${modelIdentifier}.wasm`)
const xmlPath = join(root, 'resources', 'modelDescription.xml')

if (!existsSync(wasmPath)) {
  throw new Error(`falta el binario WASM (${wasmPath}); corré npm run build:wasm`)
}

const zip = new AdmZip()
zip.addFile('modelDescription.xml', readFileSync(xmlPath))
zip.addFile(`binaries/wasm32/${modelIdentifier}.wasm`, readFileSync(wasmPath))

const outDir = join(root, 'dist')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${modelIdentifier}.fmu`)
zip.writeZip(outPath)

console.log(`FMU escrita: ${outPath}`)
