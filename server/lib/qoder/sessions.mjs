// Persistent registry of Qoder Cloud sessions created from the website.
// Only ids and status are stored; the access token never touches this file.

import { randomUUID } from 'node:crypto'
import { markStoreDirty, readStore } from '../store.mjs'

const STORE = 'qoder-sessions.json'
const LIMIT = 50

async function load() {
  const store = await readStore(STORE, { version: 1, sessions: [] })
  if (!Array.isArray(store.sessions)) store.sessions = []
  return store
}

export function newSessionId() {
  return `qsess_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export async function listQoderSessions() {
  const store = await load()
  return store.sessions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function getQoderSession(localId) {
  const store = await load()
  return store.sessions.find((row) => row.id === localId) ?? null
}

export async function saveQoderSession(row) {
  const store = await load()
  const index = store.sessions.findIndex((item) => item.id === row.id)
  if (index >= 0) store.sessions[index] = row
  else store.sessions.unshift(row)
  if (store.sessions.length > LIMIT) store.sessions.length = LIMIT
  markStoreDirty(STORE)
  return row
}
