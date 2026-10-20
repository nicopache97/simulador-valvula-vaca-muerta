/**
 * TC-E2E-01 — Recorrido e2e único (EP-07, REQ-E2E-01; principio "Con
 * propósito" de AGENTS.md): UN solo test de navegador real (Chromium) que
 * ejercita la lógica completa del simulador en una pasada:
 *
 *   login como TÉCNICO → Nivel 1 → Nivel 2 → ▶ iniciar simulación → mover SP
 *   → Nivel 3 (faceplate, indicadores vivos) → Nivel 4 Firma (ancho de
 *   histéresis ≈ 2.4 psi) → escenario falla_sensor (alarma ISA-18.2 + calidad
 *   BAD + panel de auto-explicación) → Calibración AMS (re-rango URV 40,
 *   comando autorizado por el servidor) → indicación ≈ 50 % de la nueva escala
 *   → logout/login como OPERADOR → calibrar ⇒ ERR_ACCESS_DENIED
 *   → exportar tendencia CSV y verificar la descarga.
 *
 * Selectores por rol ARIA / testid / texto accesible (la UI ya expone roles
 * ARIA en indicadores, p. ej. `meter` con aria-valuenow). Se verifica
 * contenido, no píxeles. El backend y el dev server los levanta
 * `playwright.config.ts` (webServer).
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** Mueve el slider de consigna (input[type=range] no admite `fill`). */
async function setSpSlider(page: Page, value: string): Promise<void> {
  await page.getByTestId('sp-slider').evaluate((el: HTMLInputElement, v: string) => {
    // El descriptor nativo evita el value-tracker de React: si se asigna
    // `el.value` directo, el evento `input` sintético se ignora.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    if (!setter?.set) throw new Error('HTMLInputElement.prototype.value sin setter')
    setter.set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function meterValue(page: Page, name: RegExp): Promise<number> {
  const raw = await page.getByRole('meter', { name }).getAttribute('aria-valuenow')
  return Number(raw ?? Number.NaN)
}

test('TC-E2E-01 — recorrido único: operar → diagnosticar → calibrar → exportar', async ({
  page,
}) => {
  // ── Arranque + login como TÉCNICO (el selector de rol autentica contra
  //    POST /api/login; el indicador de servidor confirma la sesión) ──────
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Simulador Vaca Muerta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Nivel 1 · Yacimiento/ })).toBeVisible()
  await page.getByLabel('Rol de usuario').selectOption('TECHNICIAN')
  await expect(page.getByTestId('server-status')).toContainText('servidor en línea')

  // ── Nivel 2: patín VM-101 ──────────────────────────────────────────────
  await page.getByTestId('card-vm-101').click()
  await expect(page.getByTestId('pid-diagram')).toBeVisible()
  await expect(page.getByLabel(/FCV-101 válvula de control/)).toBeVisible()

  // ▶ Iniciar simulación: se ejercita el botón de reanudar (la app arranca
  //   el worker al montar — pausar y reanudar hace el paso explícito).
  await page.getByLabel('Pausar simulación').click()
  await expect(page.getByLabel('Reanudar simulación')).toBeVisible()
  await page.getByLabel('Reanudar simulación').click()
  await expect(page.getByLabel('Pausar simulación')).toBeVisible()
  await page.getByLabel('Velocidad de simulación').selectOption('2')

  // Mover la consigna SP a 20 % del rango (≈ 20 bar) para que, tras el
  // re-rango a URV 40, la indicación quede ≈ 50 % de escala (TC-FUN-TRM-02).
  await setSpSlider(page, '20')
  await expect(page.getByTestId('sp-value')).toHaveText(/20%/)

  // ── Nivel 3: faceplate de FCV-101; los indicadores de barra se actualizan
  //    entre dos polls (valores distintos de aria-valuenow) ───────────────
  await page.getByLabel(/FCV-101 válvula de control/).click()
  await expect(page.getByText(/Nivel 3 · FCV-101/)).toBeVisible()
  const pvMeterName = /PV \(P2 vasija\)/
  await expect.poll(() => meterValue(page, pvMeterName)).not.toBe(30)
  const first = await meterValue(page, pvMeterName)
  await page.waitForTimeout(400)
  const second = await meterValue(page, pvMeterName)
  expect(second).not.toBe(first)
  // El lazo se asienta cerca de SP = 20 bar.
  await expect
    .poll(() => meterValue(page, pvMeterName), { timeout: 30_000 })
    .toBeGreaterThan(18)
  await expect
    .poll(() => meterValue(page, pvMeterName), { timeout: 30_000 })
    .toBeLessThan(22)

  // ── Nivel 4 · Firma: ciclo 3→15→3 psi y ancho de histéresis ≈ 2.4 psi ──
  await page.getByTestId('open-signature-modal').click()
  await expect(page.getByRole('dialog', { name: 'Diagnóstico Nivel 4' })).toBeVisible()
  await page.getByTestId('run-signature').click()
  const readout = page.getByTestId('hysteresis-readout')
  await expect(readout).toContainText(/Ancho de histéresis al 50% de carrera/)
  await expect(readout).toContainText(/2\.4\d psi/)
  await page.getByLabel('Cerrar diagnóstico').click()

  // ── Escenario falla_sensor: alarma ISA-18.2 (forma + código), calidad
  //    BAD y panel de auto-explicación ────────────────────────────────────
  await page.getByLabel('Escenario de proceso').selectOption('falla_sensor')
  // Auto-explicación (REQ-UI-05): el panel contextual nombra la causa.
  const explain = page.getByTestId('explain-sensor-fault')
  await expect(explain).toBeVisible()
  await expect(explain).toContainText(/BAD_SENSOR_FAILURE/)
  await expect(explain).toContainText(/último valor válido/)
  // Alarma prioridad 1 visible en el resumen del Nivel 1 con forma y código.
  await page.getByRole('button', { name: '← Nivel 1' }).click()
  const p1 = page.getByTestId('alarm-symbol-1')
  await expect(p1).toBeVisible()
  await expect(p1).toHaveAccessibleName(/Alarma prioridad 1/)
  await expect(p1.locator('rect')).toHaveCount(1) // cuadrado = crítica
  await expect(p1).toContainText('1')
  await expect(page.getByTestId('alarm-bell')).toHaveAccessibleName(/1 alarma/)

  // ── Nivel 4 · Calibración: re-rango URV 40 autorizado por el servidor ──
  await page.getByTestId('card-vm-101').click()
  await page.getByTestId('open-calibration-modal').click()
  const txReadout = page.getByTestId('tx-readout')
  await expect(txReadout).toContainText('calidad BAD_SENSOR_FAILURE')
  await page.getByTestId('calib-urv').fill('40')
  await page.getByTestId('calibrate-apply').click()
  await expect(page.getByRole('status')).toContainText(/autorizado por el servidor/)

  // Con la falla activa el AI retiene el último valor: al restaurar el
  // escenario normal la calidad vuelve a GOOD y el mismo valor físico
  // (~20 bar) se expresa como ~50 % de la nueva escala 0–40 bar.
  await page.getByLabel('Cerrar diagnóstico').click()
  await page.getByLabel('Escenario de proceso').selectOption('normal')
  await page.getByTestId('open-calibration-modal').click()
  await expect(txReadout).toContainText('calidad GOOD')
  await expect(txReadout).toContainText(/4[5-9]\.\d % de escala|5[0-4]\.\d % de escala/)
  await expect(txReadout).toContainText('rango 0–40 bar')

  // ── Logout/login como OPERADOR: calibrar ⇒ ERR_ACCESS_DENIED (auditable) ─
  await page.getByLabel('Cerrar diagnóstico').click()
  await page.getByLabel('Rol de usuario').selectOption('OPERATOR')
  await expect(page.getByTestId('server-status')).toContainText('servidor en línea')
  await page.getByTestId('open-calibration-modal').click()
  await expect(page.getByTestId('calib-denied')).toContainText('ERR_ACCESS_DENIED')
  await page.getByTestId('calibrate-apply').click()
  await expect(page.getByRole('status')).toContainText(/ERR_ACCESS_DENIED: el servidor rechazó/)

  // ── Exportar tendencia CSV: descarga real, con cabecera y filas ────────
  await page.getByLabel('Cerrar diagnóstico').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar tendencia CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('tendencia_VM-101.csv')
  const csv = readFileSync(await download.path(), 'utf-8')
  const lines = csv.trim().split('\n')
  expect(lines[0]).toBe(
    't,spBar,pvBar,pvPercent,quality,valveOpeningPercent,pActPsi,p1Bar,p2Bar,flowM3h,choked,pidOutPercent,scenario',
  )
  expect(lines.length).toBeGreaterThan(2) // cabecera + al menos 2 filas
  await expect(page.getByRole('status')).toContainText(/Tendencia exportada/)
})
