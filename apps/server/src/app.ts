/**
 * API REST del backend EP-06 (Hono):
 *  · POST /api/login      — auth mínima (usuario+rol sembrados en SQLite).
 *  · POST /api/calibrate  — comando AMS/HART; OPERATOR ⇒ 403 ERR_ACCESS_DENIED
 *                           (REQ-NFUN-SEC-01, TC-NFUN-SEC-01), todo queda en
 *                           el log de auditoría.
 *  · GET  /api/audit      — log de auditoría, solo ENGINEER.
 *  · POST /api/export     — snapshots → CSV/JSON con cabecera (REQ-NFUN-PORT-01).
 *  · GET  /api/health     — liveness (existente).
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type Database from 'better-sqlite3'
import { SESSION_TTL_MS, signSession, verifySession, type SessionPayload } from './auth.js'
import { insertAudit, listAudit, verifyUser } from './db.js'

type SnapshotRow = Record<string, unknown>

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return csvCell(JSON.stringify(value))
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: readonly SnapshotRow[]): string {
  const header = Object.keys(rows[0])
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => csvCell(row[key])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function createApp(db: Database.Database): Hono {
  const app = new Hono()

  /** Resuelve la sesión del header `Authorization: Bearer …` o null. */
  const authenticate = (c: Context): SessionPayload | null => {
    const header = c.req.header('Authorization') ?? ''
    if (!header.startsWith('Bearer ')) return null
    const payload = verifySession(header.slice('Bearer '.length).trim())
    if (!payload) return null
    const exists = db
      .prepare('SELECT username FROM users WHERE username = ?')
      .get(payload.username)
    return exists ? payload : null
  }

  app.get('/api/health', (c) => c.json({ status: 'ok' }))

  app.post('/api/login', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const username = typeof body?.username === 'string' ? body.username : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const user = verifyUser(db, username, password)
    if (!user) return c.json({ error: 'ERR_INVALID_CREDENTIALS' }, 401)
    const token = signSession({
      username: user.username,
      role: user.role,
      exp: Date.now() + SESSION_TTL_MS,
    })
    return c.json({ token, username: user.username, role: user.role })
  })

  app.post('/api/calibrate', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const user = authenticate(c)
    if (!user) return c.json({ error: 'ERR_UNAUTHORIZED' }, 401)
    const detail = JSON.stringify({ command: body })
    if (user.role === 'OPERATOR') {
      insertAudit(db, {
        user: user.username,
        role: user.role,
        action: 'calibrate',
        detail,
        result: 'DENIED',
      })
      return c.json({ error: 'ERR_ACCESS_DENIED' }, 403)
    }
    insertAudit(db, {
      user: user.username,
      role: user.role,
      action: 'calibrate',
      detail,
      result: 'OK',
    })
    return c.json({ status: 'ok' })
  })

  app.get('/api/audit', (c) => {
    const user = authenticate(c)
    if (!user) return c.json({ error: 'ERR_UNAUTHORIZED' }, 401)
    if (user.role !== 'ENGINEER') return c.json({ error: 'ERR_ACCESS_DENIED' }, 403)
    return c.json({ entries: listAudit(db) })
  })

  app.post('/api/export', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const snapshots = body?.snapshots
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return c.json({ error: 'ERR_INVALID_EXPORT_REQUEST' }, 400)
    }
    const rows = snapshots as SnapshotRow[]
    if (body?.format === 'json') {
      return c.json({ snapshots: rows })
    }
    return c.text(toCsv(rows), 200, { 'Content-Type': 'text/csv; charset=utf-8' })
  })

  return app
}
