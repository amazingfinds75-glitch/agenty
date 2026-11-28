// Server-only client for the Qoder Cloud Agents API (Beta).
//
// The access token is read from the server environment and is never returned
// to the browser. When no token is configured every call fails with an
// explicit "not configured" error instead of pretending a session exists.
//
// API surface used here (managed cloud sessions):
//   POST /sessions                         create a session
//   GET  /sessions/:id                     session status
//   POST /sessions/:id/events              send a user.message
//   GET  /sessions/:id/events/stream       SSE event stream
//   GET  /sessions/:id/events              event history (recovery)
//   POST /sessions/:id/cancel              interrupt / cancel
//   GET  /agents, GET /environments        discovery

import '../env.mjs'

const DEFAULT_BASE = 'https://api.qoder.com/api/v1/cloud'
const TOKEN = String(process.env.QODER_ACCESS_TOKEN ?? process.env.QODER_PAT ?? '').trim()
const BASE = String(process.env.QODER_API_BASE_URL ?? process.env.QODER_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, '')
const AGENT_ID = String(process.env.QODER_AGENT_ID ?? '').trim()
const ENVIRONMENT_ID = String(process.env.QODER_ENVIRONMENT_ID ?? '').trim()
const REQUEST_TIMEOUT = 30_000

export class QoderError extends Error {
  constructor(message, status = 500, code = 'qoder_error') {
    super(message)
    this.name = 'QoderError'
    this.status = status
    this.code = code
  }
}

function apiBaseHost() {
  try {
    return new URL(BASE).host
  } catch {
    return 'invalid-url'
  }
}

/** Public, non-secret description of the connector configuration. */
export function qoderPublicConfig() {
  return {
    configured: Boolean(TOKEN),
    tokenEnv: 'QODER_ACCESS_TOKEN',
    apiBaseHost: apiBaseHost(),
    agentConfigured: Boolean(AGENT_ID),
    environmentConfigured: Boolean(ENVIRONMENT_ID),
    agentId: AGENT_ID || null,
    environmentId: ENVIRONMENT_ID || null,
  }
}

function requireToken() {
  if (!TOKEN) {
    throw new QoderError(
      'Qoder Cloud is not configured on the server. Set QODER_ACCESS_TOKEN in the server environment, then restart the backend.',
      503,
      'not_configured',
    )
  }
}

function errorMessage(payload, text, status) {
  const fromJson =
    (payload && typeof payload === 'object' && payload.error && typeof payload.error.message === 'string' && payload.error.message) ||
    (payload && typeof payload === 'object' && typeof payload.message === 'string' && payload.message) ||
    ''
  const message = fromJson || String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (status === 401 || status === 403) {
    return `Qoder Cloud rejected the access token (HTTP ${status}). ${message || 'Check that the token is valid and has Cloud Agents access.'}`
  }
  if (status === 404) {
    return `Qoder Cloud resource not found (HTTP 404). ${message || 'Check the agent, environment or session id.'}`
  }
  if (status === 409) {
    return `Qoder Cloud rejected the request because the session is busy (HTTP 409). ${message || 'Wait for the current turn to finish.'}`
  }
  return `Qoder Cloud request failed (HTTP ${status}). ${message || 'No error detail returned.'}`
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

async function requestJson(path, { method = 'GET', body, timeout = REQUEST_TIMEOUT } = {}) {
  requireToken()
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        accept: 'application/json',
        'user-agent': 'ai-viral-studio-workforce/1.0',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new QoderError(`Qoder Cloud did not respond within ${Math.round(timeout / 1000)}s.`, 504, 'timeout')
    }
    throw new QoderError(`Qoder Cloud is unreachable: ${error?.message ?? 'network error'}`, 502, 'unreachable')
  }
  const payload = await parseBody(response)
  if (!response.ok) {
    throw new QoderError(errorMessage(payload, payload?.raw, response.status), response.status, 'upstream_error')
  }
  return payload
}

function collection(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const key of ['agents', 'environments', 'sessions', 'items', 'results', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = collection(value)
      if (nested.length) return nested
    }
  }
  return []
}

function asString(value, max = 400) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

export function normalizeAgent(row) {
  if (!row || typeof row !== 'object') return null
  const id = asString(row.id, 120)
  if (!id) return null
  return {
    id,
    name: asString(row.name, 160) ?? id,
    description: asString(row.description, 600),
    version: row.version == null ? null : String(row.version).slice(0, 40),
    model: asString(row.model, 100),
    status: asString(row.status, 40),
    createdAt: asString(row.created_at ?? row.createdAt, 60),
    updatedAt: asString(row.updated_at ?? row.updatedAt, 60),
  }
}

export function normalizeSession(row) {
  if (!row || typeof row !== 'object') return null
  const id = asString(row.id, 120)
  if (!id) return null
  return {
    id,
    status: asString(row.status, 40) ?? 'unknown',
    title: asString(row.title, 200),
    agentId: asString(row.agent?.id ?? row.agent_id ?? row.agentId, 120),
    environmentId: asString(row.environment_id ?? row.environmentId, 120),
    createdAt: asString(row.created_at ?? row.createdAt, 60),
    updatedAt: asString(row.updated_at ?? row.updatedAt, 60),
    usage: row.usage && typeof row.usage === 'object' ? row.usage : null,
  }
}

/* --------------------------------- status --------------------------------- */

let probeCache = { at: 0, value: null }

export async function qoderStatus({ force = false } = {}) {
  const config = qoderPublicConfig()
  if (!config.configured) {
    return {
      configured: false,
      reachable: null,
      authorized: null,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      detail: 'No Qoder Cloud token on the server. Set QODER_ACCESS_TOKEN (and optionally QODER_AGENT_ID / QODER_ENVIRONMENT_ID) to enable Cloud sessions. IDE-local agents are not callable from a website.',
      ...config,
    }
  }
  if (!force && probeCache.value && Date.now() - probeCache.at < 30_000) return probeCache.value
  const started = Date.now()
  let value
  try {
    const payload = await requestJson('/agents?limit=1', { timeout: 12_000 })
    value = {
      configured: true,
      reachable: true,
      authorized: true,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      agentCountVisible: collection(payload).length,
      detail: `Qoder Cloud answered on ${apiBaseHost()}. ${config.agentConfigured ? 'A default agent id is configured.' : 'Set QODER_AGENT_ID or provide an agent id per session.'} ${config.environmentConfigured ? 'A default environment id is configured.' : 'Set QODER_ENVIRONMENT_ID or provide one per session.'}`,
      ...config,
    }
  } catch (error) {
    value = {
      configured: true,
      reachable: error?.code !== 'timeout' && error?.code !== 'unreachable',
      authorized: false,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail: error?.message ?? 'Qoder Cloud check failed.',
      ...config,
    }
  }
  probeCache = { at: Date.now(), value }
  return value
}

/* -------------------------------- discovery ------------------------------- */

export async function listQoderAgents(limit = 50) {
  requireToken()
  const payload = await requestJson(`/agents?limit=${Math.max(1, Math.min(100, Number(limit) || 50))}`)
  return collection(payload).map(normalizeAgent).filter(Boolean)
}

export async function listQoderEnvironments(limit = 50) {
  requireToken()
  const payload = await requestJson(`/environments?limit=${Math.max(1, Math.min(100, Number(limit) || 50))}`)
  return collection(payload)
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const id = asString(row.id, 120)
      if (!id) return null
      return {
        id,
        name: asString(row.name, 160) ?? id,
        status: asString(row.status, 40),
        createdAt: asString(row.created_at ?? row.createdAt, 60),
      }
    })
    .filter(Boolean)
}

/* --------------------------------- sessions ------------------------------- */

export async function createRemoteSession({ agentId, environmentId, title }) {
  requireToken()
  const agent = String(agentId ?? '').trim()
  const environment = String(environmentId ?? '').trim()
  if (!agent) throw new QoderError('An agent id is required to create a Qoder Cloud session.', 400, 'missing_agent')
  if (!environment) {
    throw new QoderError(
      'An environment id (env_…) is required to create a Qoder Cloud session. Set QODER_ENVIRONMENT_ID on the server or pass environmentId.',
      400,
      'missing_environment',
    )
  }
  const payload = await requestJson('/sessions', {
    method: 'POST',
    body: {
      agent: { id: agent, type: 'agent' },
      environment_id: environment,
      ...(title ? { title: String(title).slice(0, 200) } : {}),
    },
  })
  const session = normalizeSession(payload?.session ?? payload?.data ?? payload)
  if (!session?.id) throw new QoderError('Qoder Cloud created a session but returned no session id.', 502, 'bad_response')
  return session
}

export async function getRemoteSession(sessionId) {
  requireToken()
  const payload = await requestJson(`/sessions/${encodeURIComponent(sessionId)}`)
  const session = normalizeSession(payload?.session ?? payload?.data ?? payload)
  if (!session?.id) throw new QoderError('Qoder Cloud returned no session data.', 502, 'bad_response')
  return session
}

export async function sendUserMessage(sessionId, text) {
  requireToken()
  const message = String(text ?? '').trim()
  if (!message) throw new QoderError('A message is required.', 400, 'empty_message')
  return requestJson(`/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: 'POST',
    body: {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: message.slice(0, 8000) }],
        },
      ],
    },
  })
}

export async function cancelRemoteSession(sessionId) {
  requireToken()
  return requestJson(`/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST', body: {} })
}

export async function listRemoteEvents(sessionId, limit = 100) {
  requireToken()
  const payload = await requestJson(`/sessions/${encodeURIComponent(sessionId)}/events?limit=${Math.max(1, Math.min(200, Number(limit) || 100))}`)
  return collection(payload)
}

export function openRemoteEventStream(sessionId, { lastEventId, signal } = {}) {
  requireToken()
  return fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/events/stream`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
      'user-agent': 'ai-viral-studio-workforce/1.0',
      ...(lastEventId ? { 'last-event-id': String(lastEventId).slice(0, 200) } : {}),
    },
    signal,
  })
}
