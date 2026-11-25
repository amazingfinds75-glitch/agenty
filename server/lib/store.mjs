import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONFIG } from './env.mjs'

const cache = new Map()
const pending = new Map()
const timers = new Map()

async function ensureDir() {
  if (!existsSync(CONFIG.dataDir)) await mkdir(CONFIG.dataDir, { recursive: true })
}

export async function readStore(name, fallback) {
  if (cache.has(name)) return cache.get(name)
  let value = fallback
  try {
    const raw = await readFile(join(CONFIG.dataDir, name), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') value = parsed
  } catch {
    // missing or unreadable data starts fresh
  }
  cache.set(name, value)
  return value
}

export function markStoreDirty(name) {
  const value = cache.get(name)
  if (!value) return
  pending.set(name, value)
  if (timers.has(name)) return
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name)
      void flushStore(name)
    }, 300),
  )
}

export async function flushStore(name) {
  const value = pending.get(name)
  if (!value) return
  pending.delete(name)
  await ensureDir()
  const target = join(CONFIG.dataDir, name)
  const temp = `${target}.tmp`
  try {
    await writeFile(temp, JSON.stringify(value), 'utf8')
    await rename(temp, target)
  } catch (error) {
    console.error(`[store] failed to write ${name}:`, error.message)
  }
}

export async function flushAllStores() {
  await Promise.all([...pending.keys()].map((name) => flushStore(name)))
}
