import {
  addAgentMemory,
  approveProduction,
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
  retireAgent,
  saveRender,
  statusView,
  testAgent,
  updateAgent,
} from './engine.mjs'

const WRITE_RATE = 'analyze'
const RENDER_RATE = 'video'
const PRODUCTION_ID = /^[A-Za-z0-9_-]{3,64}$/

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
  const segments = route.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })

  try {
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
    const status = Number(error?.statusCode) || 500
    if (status >= 500) console.error('[workforce]', error)
    json(req, res, status, { ok: false, error: status >= 500 ? 'Workforce error: the server could not complete the request.' : error?.message ?? 'Request failed.' })
    return true
  }
}

function notFound(req, res, json, message) {
  json(req, res, 404, { ok: false, error: message })
  return true
}
