/**
 * Token de sesión firmado HMAC-SHA256 (formato `base64url(payload).sig`,
 * análogo a un JWT mínimo sin dependencias externas, EP-06). La clave sale de
 * `SIM_SECRET` (default demo para desarrollo).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { UserRole } from '@sim/shared'

const SECRET = process.env.SIM_SECRET ?? 'sim-vaca-muerta-demo-secret'
/** Duración de la sesión: 8 h (turno de operación). */
export const SESSION_TTL_MS = 8 * 3_600_000

export interface SessionPayload {
  readonly username: string
  readonly role: UserRole
  readonly exp: number
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = createHmac('sha256', SECRET).update(body).digest()
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (
      typeof payload.username !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now()
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
