/**
 * Persistencia del backend EP-06 (REQ-NFUN-SEC-01): SQLite vía better-sqlite3.
 * Schema creado al iniciar (sin migraciones) y semilla de los 3 perfiles
 * ISA/IEC 62443 (OPERATOR / TECHNICIAN / ENGINEER). Credenciales demo:
 * usuario = nombre del rol en minúsculas, contraseña `vaca2026`.
 */
import { createHash, randomBytes } from 'node:crypto'
import Database from 'better-sqlite3'
import type { UserRole } from '@sim/shared'

/** Contraseña demo compartida por los tres perfiles sembrados. */
export const DEMO_PASSWORD = 'vaca2026'

export interface UserRow {
  readonly username: string
  readonly role: UserRole
}

export interface AuditRow {
  readonly id: number
  readonly ts: string
  readonly user: string
  readonly role: string
  readonly action: string
  readonly detail: string
  readonly result: string
}

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex')
}

export function createDb(path = ':memory:'): Database.Database {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('OPERATOR', 'TECHNICIAN', 'ENGINEER')),
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      user TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('OK', 'DENIED'))
    );
  `)

  const seed = db.prepare(
    'INSERT OR IGNORE INTO users (username, role, salt, password_hash) VALUES (?, ?, ?, ?)',
  )
  const profiles: readonly (readonly [string, UserRole])[] = [
    ['operator', 'OPERATOR'],
    ['technician', 'TECHNICIAN'],
    ['engineer', 'ENGINEER'],
  ]
  for (const [username, role] of profiles) {
    const salt = randomBytes(8).toString('hex')
    seed.run(username, role, salt, hashPassword(DEMO_PASSWORD, salt))
  }
  return db
}

export function verifyUser(db: Database.Database, username: string, password: string): UserRow | null {
  const row = db
    .prepare('SELECT username, role, salt, password_hash FROM users WHERE username = ?')
    .get(username) as { username: string; role: UserRole; salt: string; password_hash: string } | undefined
  if (!row) return null
  const given = Buffer.from(hashPassword(password, row.salt), 'hex')
  const expected = Buffer.from(row.password_hash, 'hex')
  if (given.length !== expected.length || !given.equals(expected)) return null
  return { username: row.username, role: row.role }
}

export function insertAudit(
  db: Database.Database,
  entry: Omit<AuditRow, 'id' | 'ts'>,
): void {
  db.prepare(
    'INSERT INTO audit_log (ts, user, role, action, detail, result) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(new Date().toISOString(), entry.user, entry.role, entry.action, entry.detail, entry.result)
}

export function listAudit(db: Database.Database): AuditRow[] {
  return db
    .prepare('SELECT id, ts, user, role, action, detail, result FROM audit_log ORDER BY id DESC')
    .all() as AuditRow[]
}
