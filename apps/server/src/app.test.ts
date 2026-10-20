/**
 * Tests de integración del backend EP-06 (TC-NFUN-SEC-01 completo, RBAC,
 * auditoría y exportación REQ-NFUN-PORT-01) sobre SQLite en memoria.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import type { SimSnapshot, UserRole } from '@sim/shared'
import { createApp } from './app.js'
import { createDb, DEMO_PASSWORD, listAudit } from './db.js'

let app: Hono
let db: ReturnType<typeof createDb>

beforeEach(() => {
  db = createDb() // ':memory:' — DB fresca por test
  app = createApp(db)
})

async function login(username: string, password = DEMO_PASSWORD): Promise<string> {
  const res = await app.request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { token: string; role: UserRole }
  return body.token
}

function authed(token: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }
}

describe('GET /api/health', () => {
  it('responde 200 con status ok', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })
})

describe('POST /api/login', () => {
  it('rechaza credenciales inválidas con 401', async () => {
    const res = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'mala' }),
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'ERR_INVALID_CREDENTIALS' })
  })

  it('los 3 perfiles sembrados autentican y devuelven su rol', async () => {
    for (const [username, role] of [
      ['operator', 'OPERATOR'],
      ['technician', 'TECHNICIAN'],
      ['engineer', 'ENGINEER'],
    ] as const) {
      const res = await app.request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: DEMO_PASSWORD }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { token: string; role: string }
      expect(body.role).toBe(role)
      expect(body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    }
  })
})

describe('TC-NFUN-SEC-01 — OPERATOR intenta modificar URV (REQ-NFUN-SEC-01)', () => {
  it('login OPERATOR → POST /api/calibrate → 403 ERR_ACCESS_DENIED → registro DENIED en audit_log', async () => {
    const token = await login('operator')

    const res = await app.request('/api/calibrate', authed(token, { type: 'calibrate', urv: 40 }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'ERR_ACCESS_DENIED' })

    const entries = listAudit(db)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      user: 'operator',
      role: 'OPERATOR',
      action: 'calibrate',
      result: 'DENIED',
    })
    expect(entries[0].detail).toContain('"urv":40')
  })

  it('sin token → 401 ERR_UNAUTHORIZED (y sin registro de auditoría)', async () => {
    const res = await app.request('/api/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urv: 40 }),
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'ERR_UNAUTHORIZED' })
    expect(listAudit(db)).toHaveLength(0)
  })
})

describe('RBAC — TECHNICIAN y ENGINEER calibran y quedan auditados', () => {
  it('TECHNICIAN calibra OK y el OK queda en el log', async () => {
    const token = await login('technician')
    const res = await app.request(
      '/api/calibrate',
      authed(token, { type: 'calibrate', lrv: 0, urv: 40, tau: 2 }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })

    const entries = listAudit(db)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ user: 'technician', role: 'TECHNICIAN', result: 'OK' })
  })

  it('ENGINEER calibra OK', async () => {
    const token = await login('engineer')
    const res = await app.request('/api/calibrate', authed(token, { urv: 100 }))
    expect(res.status).toBe(200)
  })
})

describe('GET /api/audit — solo ENGINEER', () => {
  it('ENGINEER lee el log; OPERATOR y TECHNICIAN reciben 403', async () => {
    const techToken = await login('technician')
    await app.request('/api/calibrate', authed(techToken, { urv: 40 }))
    const opToken = await login('operator')
    await app.request('/api/calibrate', authed(opToken, { urv: 40 }))

    const engToken = await login('engineer')
    const res = await app.request('/api/audit', {
      headers: { Authorization: `Bearer ${engToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      entries: { role: string; result: string; action: string }[]
    }
    expect(body.entries).toHaveLength(2)
    expect(body.entries.map((e) => e.result)).toEqual(['DENIED', 'OK']) // más reciente primero

    for (const token of [opToken, techToken]) {
      const denied = await app.request('/api/audit', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(denied.status).toBe(403)
      await expect(denied.json()).resolves.toEqual({ error: 'ERR_ACCESS_DENIED' })
    }
  })

  it('sin token → 401', async () => {
    const res = await app.request('/api/audit')
    expect(res.status).toBe(401)
  })
})

describe('TC-NFUN-PORT-01 — POST /api/export (CSV/JSON de tendencias)', () => {
  const snapshots: SimSnapshot[] = [
    {
      t: 0,
      dt: 0.01,
      spBar: 30,
      pvBar: 30.1,
      pvPercent: 30.1,
      txLrvBar: 0,
      txUrvBar: 100,
      quality: 'GOOD',
      valveOpeningPercent: 40,
      valveStuck: false,
      pActPsi: 7.8,
      p1Bar: 100,
      p2Bar: 30,
      flowM3h: 150.2,
      choked: false,
      dpChokedBar: 64.8,
      pidOutPercent: 40,
      scenario: 'normal',
      alarms: [],
    },
    {
      t: 0.01,
      dt: 0.01,
      spBar: 30,
      pvBar: 30.1,
      pvPercent: 30.1,
      txLrvBar: 0,
      txUrvBar: 100,
      quality: 'GOOD',
      valveOpeningPercent: 40,
      valveStuck: false,
      pActPsi: 7.8,
      p1Bar: 100,
      p2Bar: 30,
      flowM3h: 150.2,
      choked: false,
      dpChokedBar: 64.8,
      pidOutPercent: 40,
      scenario: 'normal',
      alarms: [],
    },
  ]

  it('CSV: 200 text/csv con cabecera de columnas y una fila por snapshot', async () => {
    const res = await app.request('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'csv', snapshots }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const csv = await res.text()
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3) // cabecera + 2 filas
    expect(lines[0].split(',')).toEqual(Object.keys(snapshots[0]))
    expect(lines[1].startsWith('0,0.01,30,30.1')).toBe(true)
  })

  it('JSON: 200 con los snapshots idénticos al pedido', async () => {
    const res = await app.request('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', snapshots }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { snapshots: SimSnapshot[] }
    expect(body.snapshots).toEqual(snapshots)
  })

  it('rechaza pedido sin snapshots con 400', async () => {
    const res = await app.request('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'csv', snapshots: [] }),
    })
    expect(res.status).toBe(400)
  })
})
