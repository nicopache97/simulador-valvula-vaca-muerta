import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createDb } from './db.js'

const dbPath = process.env.SIM_DB ?? 'data/sim.db'
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
const db = createDb(dbPath)
const app = createApp(db)

const port = Number(process.env.PORT ?? 3001)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`)
})
