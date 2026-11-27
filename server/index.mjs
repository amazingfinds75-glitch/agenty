import http from 'node:http'
import os from 'node:os'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { CONFIG, ROOT, VERSION } from './lib/env.mjs'
import { flushAllStores } from './lib/store.mjs'
import { getCacheSummary, getLiveTrends, getSignalHistory, getSourceStatuses } from './lib/sources.mjs'
import { getAIStatus, runAnalysis } from './lib/ai.mjs'
import { createVideoJob, getVideoJob, getVideoStatus, listVideoJobs } from './lib/video.mjs'
import { initWorkforce, statusView, workforceBootLog } from './lib/workforce/engine.mjs'
import { handleWorkforce } from './lib/workforce/api.mjs'
import { clamp, truncate } from './lib/util.mjs'

const startTime = Date.now()
const DIST = join(ROOT, 'dist')
const API_TOKEN = (process.env.API_TOKEN ?? '').trim()
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '').trim()

// The bundled SPA ships no remote scripts. Inline styles are required because
// components set React style attributes; everything else stays same-origin.
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const RATE_LIMITS = {
  // The workforce dashboard polls several read endpoints every few seconds;
  // the cap leaves room for a few tabs while still bounding abuse.
  api: { windowMs: 60_000, max: 600 },
  analyze: { windowMs: 60_000, max: 8 },
  video: { windowMs: 60_000, max: 6 },
}
const rateBuckets = new Map()
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function clientIp(req) {
  return req.socket.remoteAddress ?? 'local'
}

function rateLimited(req, name) {
  const spec = RATE_LIMITS[name]
  const key = `${name}:${clientIp(req)}`
  const now = Date.now()
  const hits = (rateBuckets.get(key) ?? []).filter((at) => now - at < spec.windowMs)
  if (hits.length >= spec.max) {
    rateBuckets.set(key, hits)
    return true
  }
  hits.push(now)
  rateBuckets.set(key, hits)
  if (rateBuckets.size > 2000) pruneBuckets(now)
  return false
}

function pruneBuckets(now) {
  for (const [key, hits] of rateBuckets) {
    const spec = RATE_LIMITS[key.slice(0, key.indexOf(':'))]
    if (!hits.some((at) => now - at < (spec?.windowMs ?? 60_000))) rateBuckets.delete(key)
  }
}

function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest()
  const right = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(left, right)
}

function writeAuthorized(req) {
  if (!API_TOKEN) return true
  const header = String(req.headers.authorization ?? '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return Boolean(match) && safeEqual(match[1].trim(), API_TOKEN)
}

function securityHeaders(req, extra = {}) {
  const secure = Boolean(req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https'
  return {
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-dns-prefetch-control': 'off',
    ...(secure ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
    ...(CORS_ORIGIN ? { 'access-control-allow-origin': CORS_ORIGIN, vary: 'Origin' } : {}),
    ...extra,
  }
}

function json(req, res, status, data, extra = {}) {
  const body = JSON.stringify(data)
  res.writeHead(
    status,
    securityHeaders(req, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      ...extra,
    }),
  )
  res.end(body)
}

async function readBody(req) {
  const type = String(req.headers['content-type'] ?? '')
  if (!/^application\/json\b/i.test(type)) {
    const error = new Error('Content-Type must be application/json')
    error.statusCode = 415
    throw error
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 65_536) {
      const error = new Error('Request body too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    throw error
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error('JSON body must be an object')
    error.statusCode = 400
    throw error
  }
  return parsed
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function analysisInput(body) {
  const topic = truncate(String(body?.topic ?? '').trim(), 200)
  const signal = body?.signal && typeof body.signal === 'object' ? body.signal : {}
  return {
    topic,
    source: truncate(String(signal.source ?? ''), 80),
    sourceId: truncate(String(signal.sourceId ?? ''), 40),
    rank: numberOrNull(signal.rank),
    score: numberOrNull(signal.score),
    growth: numberOrNull(signal.growth),
    metricLabel: truncate(String(signal.metricLabel ?? ''), 80),
    samples: numberOrNull(signal.samples),
    bestRank: numberOrNull(signal.bestRank),
    recent: Array.isArray(signal.recent) ? signal.recent.map((n) => numberOrNull(n)).filter((n) => n != null).slice(-10) : [],
  }
}

async function serveStatic(req, res, pathname) {
  let relative
  try {
    relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  } catch {
    json(req, res, 400, { ok: false, error: 'Malformed path' })
    return
  }
  let file = resolve(DIST, relative)
  const inside = file === DIST || file.startsWith(`${DIST}${sep}`)
  if (!inside) {
    json(req, res, 403, { ok: false, error: 'Forbidden' })
    return
  }
  try {
    const info = await stat(file)
    if (info.isDirectory()) file = join(file, 'index.html')
  } catch {
    if (relative.startsWith('assets/') || relative.includes('.')) {
      json(req, res, 404, { ok: false, error: 'Not found' })
      return
    }
    file = join(DIST, 'index.html')
  }
  if (!existsSync(file)) {
    json(req, res, 503, {
      ok: false,
      error: 'The app bundle is not built yet. Run "npm run build" and restart the server, or use "npm run dev" with the API server running.',
    })
    return
  }
  const extension = extname(file).toLowerCase()
  const immutable = file.includes(`${sep}assets${sep}`)
  res.writeHead(
    200,
    securityHeaders(req, {
      'content-type': MIME[extension] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    }),
  )
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  let pathname = '/'
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    pathname = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(
        204,
        securityHeaders(req, {
          'cache-control': 'no-store',
          ...(CORS_ORIGIN
            ? { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type, authorization' }
            : {}),
        }),
      )
      res.end()
      return
    }

    if (pathname.startsWith('/api/') || pathname === '/api') {
      if (rateLimited(req, 'api')) {
        json(req, res, 429, { ok: false, error: 'Too many requests. Slow down and retry shortly.' })
        return
      }
      if (WRITE_METHODS.has(req.method) && !writeAuthorized(req)) {
        json(req, res, 401, { ok: false, error: 'Missing or invalid API token.' }, { 'www-authenticate': 'Bearer' })
        return
      }
    }

    if (pathname.startsWith('/api/workforce/')) {
      const handled = await handleWorkforce(req, res, url, { json, securityHeaders, readBody, rateLimited })
      if (handled) return
    }

    if (pathname === '/api' && req.method === 'GET') {
      json(req, res, 200, {
        ok: true,
        name: 'AI Viral Studio live backend',
        version: VERSION,
        endpoints: [
          'GET /api/health',
          'GET /api/live/trends?refresh=1',
          'GET /api/live/history?key=...&hours=24',
          'POST /api/live/analyze',
          'POST /api/video/jobs',
          'GET /api/video/jobs',
          'GET /api/video/jobs/:id',
          'GET /api/workforce/status',
          'GET /api/workforce/agents',
          'POST /api/workforce/agents',
          'GET /api/workforce/agents/:id',
          'PATCH /api/workforce/agents/:id',
          'POST /api/workforce/agents/:id/retire',
          'POST /api/workforce/agents/:id/test',
          'POST /api/workforce/agents/:id/memory',
          'GET /api/workforce/productions',
          'POST /api/workforce/productions',
          'GET /api/workforce/productions/:id',
          'POST /api/workforce/productions/:id/pause|resume|cancel|retry|approve|feedback|improve',
          'POST /api/workforce/productions/:id/render',
          'GET /api/workforce/productions/:id/render/file',
          'GET /api/workforce/productions/:id/artifacts/:name',
          'GET /api/workforce/improvements',
          'POST /api/workforce/improvements/:id/approve|reject|rollback',
          'GET /api/workforce/events?after=...',
        ],
        note: 'Scores, analysis and chart history are computed locally. Publishing is not implemented. The workforce runs real background tasks; model calls require a configured key.',
        auth: API_TOKEN ? 'Write endpoints require "Authorization: Bearer <API_TOKEN>".' : 'No API token configured; keep this server on a trusted network.',
      })
      return
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      const ai = getAIStatus()
      const video = getVideoStatus()
      const summary = getCacheSummary()
      json(req, res, 200, {
        ok: true,
        name: 'AI Viral Studio live backend',
        version: VERSION,
        time: new Date().toISOString(),
        uptimeSec: Math.round((Date.now() - startTime) / 1000),
        trends: {
          geo: CONFIG.geo,
          refreshSeconds: CONFIG.refreshMinutes * 60,
          fetchedAt: summary.fetchedAt,
          count: summary.count,
          cacheAgeSec: summary.ageSec,
        },
        sources: getSourceStatuses(),
        ai: {
          configured: ai.configured,
          provider: ai.provider,
          model: ai.model,
          detail: ai.detail,
        },
        video: {
          configured: video.configured,
          provider: video.provider,
          model: video.model,
          detail: video.detail,
          note: video.note,
        },
        publishing: {
          configured: false,
          detail: 'Publishing integrations are not implemented. Approve, download and upload manually.',
        },
        workforce: {
          enabled: true,
          ...workforceBootLog(),
          detail: 'Persistent agent workforce. Model calls run only when a key is configured and the agent is permitted.',
        },
        note: 'Live sources are fetched from public feeds. Scores are heuristic. AI calls only run when configured and requested.',
      })
      return
    }

    if ((pathname === '/api/live/trends' || pathname === '/api/trends/live') && req.method === 'GET') {
      const geoParam = (url.searchParams.get('geo') ?? '').toUpperCase()
      const geo = /^[A-Z]{2}$/.test(geoParam) ? geoParam : CONFIG.geo
      const force = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'
      const data = await getLiveTrends({ geo, force })
      json(req, res, data.ok ? 200 : 502, data)
      return
    }

    if ((pathname === '/api/live/history' || pathname === '/api/trends/history') && req.method === 'GET') {
      const key = url.searchParams.get('key') ?? ''
      const geoParam = (url.searchParams.get('geo') ?? '').toUpperCase()
      const geo = /^[A-Z]{2}$/.test(geoParam) ? geoParam : CONFIG.geo
      const hours = clamp(numberOrNull(url.searchParams.get('hours')) ?? 24, 1, 168)
      const history = await getSignalHistory(key, { geo, hours })
      if (!history) {
        json(req, res, 404, { ok: false, error: 'No history recorded for that signal yet.' })
        return
      }
      json(req, res, 200, history)
      return
    }

    if ((pathname === '/api/live/analyze' || pathname === '/api/ai/analyze' || pathname === '/api/trends/analyze') && req.method === 'POST') {
      if (rateLimited(req, 'analyze')) {
        json(req, res, 429, { ok: false, error: 'Analysis is limited to 8 requests per minute.' })
        return
      }
      const body = await readBody(req)
      const input = analysisInput(body)
      if (!input.topic) {
        json(req, res, 400, { ok: false, error: 'A topic is required.' })
        return
      }
      const result = await runAnalysis(input)
      json(req, res, 200, { ok: true, ...result })
      return
    }

    if (pathname === '/api/video/jobs' && req.method === 'GET') {
      json(req, res, 200, { ok: true, video: getVideoStatus(), jobs: await listVideoJobs() })
      return
    }

    if (pathname === '/api/video/jobs' && req.method === 'POST') {
      if (rateLimited(req, 'video')) {
        json(req, res, 429, { ok: false, error: 'Video jobs are limited to 6 requests per minute.' })
        return
      }
      const body = await readBody(req)
      try {
        const job = await createVideoJob({ prompt: body?.prompt, aspectRatio: body?.aspectRatio })
        json(req, res, 202, { ok: true, job })
      } catch (error) {
        json(req, res, error.statusCode ?? 500, {
          ok: false,
          error: error.message,
          ...(error.payload ?? {}),
        })
      }
      return
    }

    const jobMatch = pathname.match(/^\/api\/video\/jobs\/([a-z0-9_]+)$/)
    if (jobMatch && req.method === 'GET') {
      const job = await getVideoJob(jobMatch[1])
      if (!job) {
        json(req, res, 404, { ok: false, error: 'Video job not found.' })
        return
      }
      json(req, res, 200, { ok: true, job })
      return
    }

    if (pathname.startsWith('/api/')) {
      json(req, res, 404, { ok: false, error: 'Unknown API route.' })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, pathname)
      return
    }

    json(req, res, 405, { ok: false, error: 'Method not allowed.' })
  } catch (error) {
    const status = Number(error?.statusCode) || 500
    if (status >= 500) console.error('[api]', error)
    if (!res.headersSent) json(req, res, status, { ok: false, error: status >= 500 ? 'Server error' : error?.message ?? 'Request failed' })
    else res.end()
  }
})

server.headersTimeout = 15_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 5_000
server.maxHeadersCount = 100

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address)
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${CONFIG.port} is already in use. Stop the other process or set PORT in .env.`)
  } else {
    console.error(error)
  }
  process.exit(1)
})

try {
  await initWorkforce()
} catch (error) {
  console.error('[workforce] failed to initialise:', error)
}

server.listen(CONFIG.port, CONFIG.host, () => {
  const ai = getAIStatus()
  const video = getVideoStatus()
  const workforce = workforceBootLog()
  const workforceStatus = statusView()
  const exposed = !['127.0.0.1', 'localhost', '::1'].includes(CONFIG.host)
  console.log(`AI Viral Studio live backend v${VERSION}`)
  console.log(`  API + app: http://localhost:${CONFIG.port}`)
  if (exposed) {
    const addresses = lanAddresses()
    if (addresses.length) {
      console.log('  on your network (phones, tablets, other computers):')
      for (const address of addresses) console.log(`    http://${address}:${CONFIG.port}`)
    } else {
      console.log('  bound to all interfaces, but no LAN address was found.')
    }
    if (API_TOKEN) {
      console.log('  write endpoints require "Authorization: Bearer <API_TOKEN>".')
    } else {
      console.log('  warning: no API_TOKEN set. Anyone on this network can create video jobs and run analysis.')
    }
  } else {
    console.log('  local only. Set HOST=0.0.0.0 in .env to open it from another device on your network.')
  }
  console.log(`  live sources: Google Trends RSS, Hacker News${process.env.YOUTUBE_API_KEY?.trim() ? ', YouTube charts' : ' (YouTube key not set)'}`)
  console.log(`  AI analysis: ${ai.configured ? `${ai.provider} · ${ai.model}` : 'heuristic only (no AI key)'}`)
  console.log(`  AI video: ${video.configured ? `${video.provider} · ${video.model}` : 'not configured (local canvas renderer remains verified)'}`)
  console.log(`  workforce: ${workforce.agents} agents · ${workforce.productions} productions · ${workforce.llm.configured ? `${workforce.llm.provider} model engine` : 'local directive engine (no model key)'}`)
  console.log(`  workforce queue: ${workforceStatus.counts.tasks.pending} pending · ${workforceStatus.counts.tasks.running} running · ${workforceStatus.counts.improvements.pending} improvements awaiting approval`)
  console.log(`  data: ${CONFIG.dataDir}`)
})

async function shutdown() {
  await flushAllStores()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
