import http from 'node:http'
import os from 'node:os'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { CONFIG, ROOT, VERSION } from './lib/env.mjs'
import { flushAllStores } from './lib/store.mjs'
import { getCacheSummary, getLiveTrends, getSignalHistory, getSourceStatuses } from './lib/sources.mjs'
import { getAIStatus, runAnalysis } from './lib/ai.mjs'
import { createVideoJob, getVideoJob, getVideoStatus, listVideoJobs } from './lib/video.mjs'
import { truncate } from './lib/util.mjs'

const startTime = Date.now()
const DIST = join(ROOT, 'dist')
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
const analysisHits = new Map()

function headers(extra = {}) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(process.env.CORS_ORIGIN ? { 'access-control-allow-origin': process.env.CORS_ORIGIN } : {}),
    ...extra,
  }
}

function json(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, headers({ 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) }))
  res.end(body)
}

async function readBody(req) {
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    throw error
  }
}

function limitAnalysis(req) {
  const key = req.socket.remoteAddress ?? 'local'
  const now = Date.now()
  const hits = (analysisHits.get(key) ?? []).filter((at) => now - at < 60_000)
  if (hits.length >= 8) return false
  hits.push(now)
  analysisHits.set(key, hits)
  return true
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
    json(res, 400, { ok: false, error: 'Malformed path' })
    return
  }
  let file = resolve(DIST, relative)
  const inside = file === DIST || file.startsWith(`${DIST}${sep}`)
  if (!inside) {
    json(res, 403, { ok: false, error: 'Forbidden' })
    return
  }
  try {
    const info = await stat(file)
    if (info.isDirectory()) file = join(file, 'index.html')
  } catch {
    if (relative.startsWith('assets/') || relative.includes('.')) {
      json(res, 404, { ok: false, error: 'Not found' })
      return
    }
    file = join(DIST, 'index.html')
  }
  if (!existsSync(file)) {
    json(res, 503, {
      ok: false,
      error: 'The app bundle is not built yet. Run "npm run build" and restart the server, or use "npm run dev" with the API server running.',
    })
    return
  }
  const extension = extname(file).toLowerCase()
  const immutable = file.includes(`${sep}assets${sep}`)
  res.writeHead(200, {
    'content-type': MIME[extension] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const pathname = url.pathname
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers({ 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }))
      res.end()
      return
    }

    if (pathname === '/api' && req.method === 'GET') {
      json(res, 200, {
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
        ],
        note: 'Scores, analysis and chart history are computed locally. Publishing is not implemented.',
      })
      return
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      const ai = getAIStatus()
      const video = getVideoStatus()
      const summary = getCacheSummary()
      json(res, 200, {
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
        note: 'Live sources are fetched from public feeds. Scores are heuristic. AI calls only run when configured and requested.',
      })
      return
    }

    if ((pathname === '/api/live/trends' || pathname === '/api/trends/live') && req.method === 'GET') {
      const geoParam = (url.searchParams.get('geo') ?? '').toUpperCase()
      const geo = /^[A-Z]{2}$/.test(geoParam) ? geoParam : CONFIG.geo
      const force = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'
      const data = await getLiveTrends({ geo, force })
      json(res, data.ok ? 200 : 502, data)
      return
    }

    if ((pathname === '/api/live/history' || pathname === '/api/trends/history') && req.method === 'GET') {
      const key = url.searchParams.get('key') ?? ''
      const geoParam = (url.searchParams.get('geo') ?? '').toUpperCase()
      const geo = /^[A-Z]{2}$/.test(geoParam) ? geoParam : CONFIG.geo
      const hours = numberOrNull(url.searchParams.get('hours')) ?? 24
      const history = await getSignalHistory(key, { geo, hours })
      if (!history) {
        json(res, 404, { ok: false, error: 'No history recorded for that signal yet.' })
        return
      }
      json(res, 200, history)
      return
    }

    if ((pathname === '/api/live/analyze' || pathname === '/api/ai/analyze' || pathname === '/api/trends/analyze') && req.method === 'POST') {
      if (!limitAnalysis(req)) {
        json(res, 429, { ok: false, error: 'Analysis is limited to 8 requests per minute.' })
        return
      }
      const body = await readBody(req)
      const input = analysisInput(body)
      if (!input.topic) {
        json(res, 400, { ok: false, error: 'A topic is required.' })
        return
      }
      const result = await runAnalysis(input)
      json(res, 200, { ok: true, ...result })
      return
    }

    if (pathname === '/api/video/jobs' && req.method === 'GET') {
      json(res, 200, { ok: true, video: getVideoStatus(), jobs: await listVideoJobs() })
      return
    }

    if (pathname === '/api/video/jobs' && req.method === 'POST') {
      const body = await readBody(req)
      try {
        const job = await createVideoJob({ prompt: body?.prompt, aspectRatio: body?.aspectRatio })
        json(res, 202, { ok: true, job })
      } catch (error) {
        json(res, error.statusCode ?? 500, {
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
        json(res, 404, { ok: false, error: 'Video job not found.' })
        return
      }
      json(res, 200, { ok: true, job })
      return
    }

    if (pathname.startsWith('/api/')) {
      json(res, 404, { ok: false, error: 'Unknown API route.' })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, pathname)
      return
    }

    json(res, 405, { ok: false, error: 'Method not allowed.' })
  } catch (error) {
    const status = error?.statusCode ?? 500
    if (status >= 500) console.error('[api]', error)
    if (!res.headersSent) json(res, status, { ok: false, error: error?.message ?? 'Server error' })
    else res.end()
  }
})

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

server.listen(CONFIG.port, CONFIG.host, () => {
  const ai = getAIStatus()
  const video = getVideoStatus()
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
    if (ai.configured || video.configured) {
      console.log('  note: the API has no login. Use a trusted network only while keys are configured.')
    }
  } else {
    console.log('  local only. Set HOST=0.0.0.0 in .env to open it from another device on your network.')
  }
  console.log(`  live sources: Google Trends RSS, Hacker News${process.env.YOUTUBE_API_KEY?.trim() ? ', YouTube charts' : ' (YouTube key not set)'}`)
  console.log(`  AI analysis: ${ai.configured ? `${ai.provider} · ${ai.model}` : 'heuristic only (no AI key)'}`)
  console.log(`  AI video: ${video.configured ? `${video.provider} · ${video.model}` : 'not configured (local canvas renderer remains verified)'}`)
  console.log(`  data: ${CONFIG.dataDir}`)
})

async function shutdown() {
  await flushAllStores()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
