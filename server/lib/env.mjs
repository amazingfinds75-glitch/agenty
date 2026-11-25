import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function loadEnvFile() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return
  const raw = readFileSync(file, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile()

const refreshMinutes = Number(process.env.REFRESH_MINUTES)

export const CONFIG = {
  port: Number(process.env.PORT) || 8787,
  host: (process.env.HOST || '127.0.0.1').trim(),
  geo: (process.env.TRENDS_GEO || 'US').toUpperCase(),
  refreshMinutes: Number.isFinite(refreshMinutes) && refreshMinutes >= 2 ? Math.min(refreshMinutes, 60) : 5,
  minRefreshMs: 60_000,
  snapshotRetention: 288,
  dataDir: resolve(ROOT, 'server', 'data'),
}

export const VERSION = '0.1.0-live'
