import { Readable } from 'node:stream'
import {
  addAgentMemory,
  approveProduction,
  approveScript,
  artifactFile,
  controlProduction,
  createAgent,
  createProduction,
  decideImprovement,
  feedbackProduction,
  getAgent,
  getEvents,
  getProduction,
  improveProduction,
  listAgentSummaries,
  listImprovements,
  listProductionSummaries,
  readRenderFile,
  requestRevision,
  retireAgent,
  saveRender,
  statusView,
  subscribeEvents,
  testAgent,
  updateAgent,
} from './engine.mjs'
import {
  cancelQoderRuntimeSession,
  createQoderRuntimeSession,
  getRuntimeSession,
  listQoderRuntimeSessions,
  listRuntimeAgents,
  qoderDiscovery,
  qoderRuntimeSessionEvents,
  qoderRuntimeSessionStream,
  refreshQoderRuntimeSession,
  runtimeStatus,
} from './runtime.mjs'

const WRITE_RATE = 'analyze'
const RENDER_RATE = 'video'
const PRODUCTION_ID = /^[A-Za-z0-9_-]{3,64}$/
const SESSION_ID = /^[A-Za-z0-9_-]{3,80}$/

function sendBuffer(req, res, securityHeaders, status, { buffer, mime, filename }, inline = false) {
  const disposition = inline ? 'inline' : 'attachment'
  res.writeHead(
    status,
    securityHeaders(req, {
      'content-type': mime,
      'content-length': buffer.length,
      'cache-control': 'no-store',
      'content-disposition': `${disposition}; filename="${String(filename ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
    }),
  )
  res.end(buffer)
}

async function readRawBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('Render body exceeds the 80 MB limit.')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Handle every /api/workforce route. Returns true when the path was handled.
 */
export async function handleWorkforce(req, res, url, helpers) {
  const { json, securityHeaders, readBody, rateLimited } = helpers
  const pathname = url.pathname
  if (!pathname.startsWith('/api/workforce/')) return false
  const method = req.method ?? 'GET'

  const route = pathname.slice('/api/workforce/'.length)
  const segments = route.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))

  try {
    if (segments[0] === 'events' && segments[1] === 'stream' && method === 'GET') {
      const after = Number(req.headers['last-event-id']) || Number(url.searchParams.get('after')) || 0
      const productionId = url.searchParams.get('productionId') || null
      res.writeHead(
        200,
        securityHeaders(req, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        }),
      )
      res.write('retry: 3000\n\n')
      let lastSeq = after
      let replaying = true
      const buffered = []
      const send = (entry) => {
        if (!entry || entry.seq <= lastSeq) return
        if (productionId && entry.productionId !== productionId) return
        lastSeq = entry.seq
        try {
          res.write(`id: ${entry.seq}\ndata: ${JSON.stringify(entry)}\n\n`)
        } catch {
          // The client disconnected; the close handler cleans up.
        }
      }
      const unsubscribe = subscribeEvents((entry) => {
        if (replaying) buffered.push(entry)
        else send(entry)
      })
      const initial = getEvents({ after, productionId, limit: 500 })
      for (const entry of initial.events) send(entry)
      replaying = false
      for (const entry of buffered) send(entry)
      res.write(`: connected · ${initial.events.length} replayed\n\n`)
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n')
        } catch {
          // ignore; close handler stops the interval
        }
      }, 15_000)
      heartbeat.unref?.()
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        res.end()
      }
      res.on('close', close)
      req.on('error', close)
      req.on('aborted', close)
      return true
    }

    if (segments[0] === 'runtime') {
      if (segments[1] === 'status' && segments.length === 2 && method === 'GET') {
        const probe = ['1', 'true', 'yes'].includes(String(url.searchParams.get('probe') ?? '').toLowerCase())
        json(req, res, 200, await runtimeStatus({ probe }))
        return true
      }
      if (segments[1] === 'agents' && segments.length === 2 && method === 'GET') {
        json(req, res, 200, await listRuntimeAgents())
        return true
      }
      if (segments[1] === 'discovery' && segments.length === 2 && method === 'GET') {
        json(req, res, 200, await qoderDiscovery())
        return true
      }
      if (segments[1] === 'sessions' && segments.length === 2) {
        if (method === 'GET') {
          json(req, res, 200, { ok: true, sessions: await listQoderRuntimeSessions() })
          return true
        }
        if (method === 'POST') {
          if (rateLimited(req, WRITE_RATE)) {
            json(req, res, 429, { ok: false, error: 'Cloud session creation is limited to 8 requests per minute.' })
            return true
          }
          const body = await readBody(req)
          const session = await createQoderRuntimeSession(body)
          json(req, res, 201, { ok: true, session })
          return true
        }
      }
      if (segments[1] === 'sessions' && segments.length >= 3) {
        const sessionId = segments[2]
        if (!SESSION_ID.test(sessionId)) {
          json(req, res, 400, { ok: false, error: 'Invalid session id.' })
          return true
        }
        if (segments.length === 3 && method === 'GET') {
          const refresh = ['1', 'true'].includes(String(url.searchParams.get('refresh') ?? '').toLowerCase())
          const session = refresh ? await refreshQoderRuntimeSession(sessionId) : await getRuntimeSession(sessionId)
          if (!session) return notFound(req, res, json, 'Qoder session not found.')
          json(req, res, 200, { ok: true, session })
          return true
        }
        if (segments.length === 4 && segments[3] === 'cancel' && method === 'POST') {
          const session = await cancelQoderRuntimeSession(sessionId)
          if (!session) return notFound(req, res, json, 'Qoder session not found.')
          json(req, res, 200, { ok: true, session })
          return true
        }
        if (segments.length === 4 && segments[3] === 'events' && method === 'GET') {
          const events = await qoderRuntimeSessionEvents(sessionId, Number(url.searchParams.get('limit')) || 100)
          if (!events) return notFound(req, res, json, 'Qoder session not found.')
          json(req, res, 200, { ok: true, events })
          return true
        }
        if (segments.length === 4 && segments[3] === 'stream' && method === 'GET') {
          const controller = new AbortController()
          const upstream = await qoderRuntimeSessionStream(sessionId, {
            lastEventId: req.headers['last-event-id'],
            signal: controller.signal,
          })
          if (!upstream) return notFound(req, res, json, 'Qoder session not found.')
          if (!upstream.ok) {
            const text = await upstream.text().catch(() => '')
            json(req, res, upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status, {
              ok: false,
              error: `Qoder Cloud stream failed (HTTP ${upstream.status}). ${text.replace(/\s+/g, ' ').slice(0, 300)}`,
            })
            return true
          }
          res.writeHead(
            200,
            securityHeaders(req, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-store, no-transform',
              connection: 'keep-alive',
              'x-accel-buffering': 'no',
            }),
          )
          const close = () => controller.abort()
          req.on('close', close)
          res.on('close', close)
          if (upstream.body) {
            Readable.fromWeb(upstream.body)
              .on('error', () => {
                if (!res.writableEnded) res.end()
              })
              .pipe(res)
          } else {
            res.end()
          }
          return true
        }
      }
    }

    if (segments[0] === 'status' && segments.length === 1 && method === 'GET') {
      json(req, res, 200, statusView())
      return true
    }

    if (segments[0] === 'agents' && segments.length === 1) {
      if (method === 'GET') {
        json(req, res, 200, { ok: true, agents: listAgentSummaries() })
        return true
      }
      if (method === 'POST') {
        if (rateLimited(req, WRITE_RATE)) {
          json(req, res, 429, { ok: false, error: 'Agent creation is limited to 8 requests per minute.' })
          return true
        }
        const body = await readBody(req)
        json(req, res, 201, { ok: true, agent: createAgent(body) })
        return true
      }
    }

    if (segments[0] === 'agents' && segments.length >= 2) {
      const agentId = segments[1]
      if (segments.length === 2) {
        if (method === 'GET') {
          const agent = getAgent(agentId)
          if (!agent) return notFound(req, res, json, 'Agent not found.')
          json(req, res, 200, { ok: true, agent })
          return true
        }
        if (method === 'PATCH') {
          const body = await readBody(req)
          const agent = updateAgent(agentId, body)
          if (!agent) return notFound(req, res, json, 'Agent not found.')
          json(req, res, 200, { ok: true, agent })
          return true
        }
      }
      if (segments.length === 3) {
        const action = segments[2]
        if (action === 'retire' && method === 'POST') {
          const agent = retireAgent(agentId)
          if (!agent) return notFound(req, res, json, 'Agent not found.')
          json(req, res, 200, { ok: true, agent })
          return true
        }
        if (action === 'test' && method === 'POST') {
          if (rateLimited(req, WRITE_RATE)) {
            json(req, res, 429, { ok: false, error: 'Agent tests are limited to 8 requests per minute.' })
            return true
          }
          const body = await readBody(req)
          const test = testAgent(agentId, body)
          if (!test) return notFound(req, res, json, 'Agent not found.')
          json(req, res, 200, { ok: true, test })
          return true
        }
        if (action === 'memory' && method === 'POST') {
          const body = await readBody(req)
          const memory = addAgentMemory(agentId, body)
          if (!memory) return notFound(req, res, json, 'Agent not found.')
          json(req, res, 200, { ok: true, memory })
          return true
        }
      }
    }

    if (segments[0] === 'productions' && segments.length === 1) {
      if (method === 'GET') {
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50))
        json(req, res, 200, { ok: true, productions: listProductionSummaries().slice(0, limit) })
        return true
      }
      if (method === 'POST') {
        if (rateLimited(req, WRITE_RATE)) {
          json(req, res, 429, { ok: false, error: 'Production starts are limited to 8 requests per minute.' })
          return true
        }
        const body = await readBody(req)
        json(req, res, 201, { ok: true, production: createProduction(body) })
        return true
      }
    }

    if (segments[0] === 'productions' && segments.length >= 2) {
      const productionId = segments[1]
      if (!PRODUCTION_ID.test(productionId)) {
        json(req, res, 400, { ok: false, error: 'Invalid production id.' })
        return true
      }
      if (segments.length === 2 && method === 'GET') {
        const production = getProduction(productionId)
        if (!production) return notFound(req, res, json, 'Production not found.')
        json(req, res, 200, { ok: true, production })
        return true
      }
      if (segments.length === 3) {
        const action = segments[2]
        if (['pause', 'resume', 'cancel', 'retry'].includes(action) && method === 'POST') {
          const production = controlProduction(productionId, action)
          if (!production) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, production })
          return true
        }
        if (action === 'approve' && method === 'POST') {
          const body = await readBody(req)
          const production = approveProduction(productionId, body?.approved)
          if (!production) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, production })
          return true
        }
        if (action === 'approve-script' && method === 'POST') {
          const body = await readBody(req)
          const production = approveScript(productionId, body?.approved !== false)
          if (!production) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, production })
          return true
        }
        if (action === 'revision' && method === 'POST') {
          if (rateLimited(req, WRITE_RATE)) {
            json(req, res, 429, { ok: false, error: 'Revision requests are limited to 8 per minute.' })
            return true
          }
          const body = await readBody(req)
          const production = requestRevision(productionId, body)
          if (!production) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, production })
          return true
        }
        if (action === 'feedback' && method === 'POST') {
          const body = await readBody(req)
          const production = feedbackProduction(productionId, body)
          if (!production) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, production })
          return true
        }
        if (action === 'improve' && method === 'POST') {
          if (rateLimited(req, WRITE_RATE)) {
            json(req, res, 429, { ok: false, error: 'Improvement runs are limited to 8 requests per minute.' })
            return true
          }
          const improvements = improveProduction(productionId)
          if (!improvements) return notFound(req, res, json, 'Production not found.')
          json(req, res, 200, { ok: true, improvements })
          return true
        }
        if (action === 'render' && method === 'POST') {
          if (rateLimited(req, RENDER_RATE)) {
            json(req, res, 429, { ok: false, error: 'Render uploads are limited to 6 requests per minute.' })
            return true
          }
          const buffer = await readRawBody(req, 80 * 1024 * 1024)
          const result = await saveRender(
            productionId,
            buffer,
            String(req.headers['x-render-mime'] ?? ''),
            String(req.headers['x-render-duration'] ?? ''),
          )
          if (result.error) {
            json(req, res, result.status ?? 400, { ok: false, error: result.error })
            return true
          }
          json(req, res, 201, { ok: true, ...result })
          return true
        }
      }
      if (segments.length === 4 && segments[2] === 'render' && segments[3] === 'file' && (method === 'GET' || method === 'HEAD')) {
        const file = await readRenderFile(productionId)
        if (!file) return notFound(req, res, json, 'No uploaded render for this production.')
        const range = String(req.headers.range ?? '')
        const total = file.buffer.length
        if (range) {
          const match = range.match(/^bytes=(\d*)-(\d*)$/)
          if (match) {
            const start = match[1] ? Number(match[1]) : 0
            const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1
            if (start >= 0 && end >= start && start < total) {
              const slice = file.buffer.subarray(start, end + 1)
              res.writeHead(
                206,
                securityHeaders(req, {
                  'content-type': file.mime,
                  'content-length': slice.length,
                  'content-range': `bytes ${start}-${end}/${total}`,
                  'accept-ranges': 'bytes',
                  'cache-control': 'no-store',
                  'content-disposition': `inline; filename="${file.filename}"`,
                }),
              )
              res.end(method === 'HEAD' ? undefined : slice)
              return true
            }
          }
        }
        res.writeHead(
          200,
          securityHeaders(req, {
            'content-type': file.mime,
            'content-length': total,
            'accept-ranges': 'bytes',
            'cache-control': 'no-store',
            'content-disposition': `inline; filename="${file.filename}"`,
          }),
        )
        res.end(method === 'HEAD' ? undefined : file.buffer)
        return true
      }
      if (segments.length === 4 && segments[2] === 'artifacts' && method === 'GET') {
        const name = segments[3]
        const file = artifactFile(productionId, name)
        if (!file) return notFound(req, res, json, 'Artifact not available yet.')
        sendBuffer(req, res, securityHeaders, 200, file, name.endsWith('.svg'))
        return true
      }
    }

    if (segments[0] === 'improvements' && segments.length === 1 && method === 'GET') {
      const status = url.searchParams.get('status') ?? ''
      json(req, res, 200, { ok: true, improvements: listImprovements(status || undefined) })
      return true
    }

    if (segments[0] === 'improvements' && segments.length === 3 && method === 'POST') {
      const action = segments[2]
      if (['approve', 'reject', 'rollback'].includes(action)) {
        if (rateLimited(req, WRITE_RATE)) {
          json(req, res, 429, { ok: false, error: 'Improvement decisions are limited to 8 requests per minute.' })
          return true
        }
        const body = await readBody(req)
        const result = decideImprovement(segments[1], action, body)
        if (!result) return notFound(req, res, json, 'Improvement not found.')
        json(req, res, 200, { ok: true, ...result })
        return true
      }
    }

    if (segments[0] === 'events' && segments.length === 1 && method === 'GET') {
      const data = getEvents({
        after: Number(url.searchParams.get('after')) || 0,
        productionId: url.searchParams.get('productionId') || null,
        limit: Number(url.searchParams.get('limit')) || 200,
      })
      json(req, res, 200, { ok: true, ...data })
      return true
    }

    json(req, res, 404, { ok: false, error: 'Unknown workforce API route.' })
    return true
  } catch (error) {
    const status = Number(error?.statusCode ?? error?.status) || 500
    if (status >= 500) console.error('[workforce]', error)
    const message =
      error?.name === 'QoderError' || [400, 401, 403, 404, 409, 429, 502, 503, 504].includes(status)
        ? error?.message ?? 'Request failed.'
        : 'Workforce error: the server could not complete the request.'
    json(req, res, status, { ok: false, error: message })
    return true
  }
}

function notFound(req, res, json, message) {
  json(req, res, 404, { ok: false, error: message })
  return true
}
