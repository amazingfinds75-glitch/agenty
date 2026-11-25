import { CONFIG } from './env.mjs'
import { markStoreDirty, readStore } from './store.mjs'
import {
  clamp,
  decodeXml,
  fetchJson,
  fetchWithTimeout,
  formatCompact,
  hashKey,
  keywordSet,
  parseDate,
  truncate,
} from './util.mjs'

const NOTE =
  'Live headlines are fetched from public feeds. Opportunity scores are a local heuristic, not platform analytics.'

const statuses = {
  'google-trends': {
    id: 'google-trends',
    name: 'Google Trends RSS',
    enabled: true,
    status: 'idle',
    detail: 'Daily search trends feed. No key required.',
    lastFetch: null,
    lastError: null,
    count: 0,
  },
  'hacker-news': {
    id: 'hacker-news',
    name: 'Hacker News',
    enabled: true,
    status: 'idle',
    detail: 'Public top-stories API. No key required.',
    lastFetch: null,
    lastError: null,
    count: 0,
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube most-popular chart',
    enabled: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    status: process.env.YOUTUBE_API_KEY?.trim() ? 'idle' : 'not-configured',
    detail: process.env.YOUTUBE_API_KEY?.trim()
      ? 'YouTube Data API key detected.'
      : 'Set YOUTUBE_API_KEY in .env to include chart data.',
    lastFetch: null,
    lastError: null,
    count: 0,
  },
}

let cache = null
let lastAttempt = 0

export function getSourceStatuses() {
  return Object.values(statuses).map((source) => ({ ...source }))
}

export function getCacheSummary() {
  if (!cache) {
    return { geo: CONFIG.geo, fetchedAt: null, count: 0, ageSec: null }
  }
  return {
    geo: cache.geo,
    fetchedAt: cache.data.fetchedAt,
    count: cache.data.signals.length,
    ageSec: Math.round((Date.now() - cache.at) / 1000),
  }
}

function markStatus(id, patch) {
  Object.assign(statuses[id], patch)
}

function pickTag(chunk, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = chunk.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, 'i'))
  return match ? decodeXml(match[1]).trim() : ''
}

function trafficNumber(label) {
  const match = label.match(/[\d,]+/)
  return match ? Number(match[0].replace(/,/g, '')) || 0 : 0
}

async function fetchGoogleTrends(geo) {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`
  const response = await fetchWithTimeout(url, { headers: { accept: 'application/rss+xml, application/xml' } })
  const xml = await response.text()
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15)
  return items
    .map((match, index) => {
      const chunk = match[1]
      const title = pickTag(chunk, 'title')
      if (!title) return null
      const trafficLabel = pickTag(chunk, 'ht:approx_traffic')
      const traffic = trafficNumber(trafficLabel)
      const newsTitle = pickTag(chunk, 'ht:news_item_title')
      const newsUrl = pickTag(chunk, 'ht:news_item_url')
      const rank = index + 1
      const score = clamp(92 - (rank - 1) * 2.4 + (traffic ? Math.log10(traffic) * 2.2 : 0), 1, 100)
      return {
        alsoOn: [],
        key: `google-trends:${hashKey(title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())}`,
        title,
        sourceId: 'google-trends',
        source: 'Google Trends',
        rank,
        metric: traffic,
        metricLabel: trafficLabel ? `≈${formatCompact(traffic)}+ searches` : 'Trending search',
        publishedAt: parseDate(pickTag(chunk, 'pubDate')),
        url: newsUrl || `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geo}`,
        snippet: truncate(newsTitle || '', 180),
        category: 'Search trend',
        score: Math.round(score),
      }
    })
    .filter(Boolean)
}

async function fetchHackerNews() {
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json')
  if (!Array.isArray(ids)) throw new Error('Unexpected Hacker News response')
  const stories = await Promise.all(
    ids.slice(0, 18).map(async (id) => {
      try {
        const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        return item && item.type === 'story' && !item.dead && !item.deleted ? item : null
      } catch {
        return null
      }
    }),
  )
  return stories
    .filter(Boolean)
    .slice(0, 12)
    .map((item, index) => {
      const rank = index + 1
      const points = Number(item.score) || 0
      const comments = Number(item.descendants) || 0
      const score = clamp(25 + Math.log10(points + 1) * 13 + Math.log10(comments + 1) * 6 - index * 0.8, 1, 96)
      return {
        alsoOn: [],
        key: `hacker-news:${hashKey(String(item.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())}`,
        title: String(item.title),
        sourceId: 'hacker-news',
        source: 'Hacker News',
        rank,
        metric: points,
        metricLabel: `${formatCompact(points)} points · ${formatCompact(comments)} comments`,
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        snippet: `Submitted by ${item.by ?? 'unknown'} · ${formatCompact(comments)} comments`,
        category: 'Technology',
        score: Math.round(score),
      }
    })
}

async function fetchYouTube(geo) {
  const key = process.env.YOUTUBE_API_KEY?.trim()
  if (!key) return []
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    regionCode: geo,
    maxResults: '10',
    key,
  })
  const data = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`)
  const items = Array.isArray(data.items) ? data.items : []
  return items.map((item, index) => {
    const views = Number(item.statistics?.viewCount) || 0
    const rank = index + 1
    const score = clamp(35 + Math.log10(views + 1) * 8 - index * 1.2, 1, 96)
    return {
      alsoOn: [],
      key: `youtube:${hashKey(String(item.id))}`,
      title: String(item.snippet?.title ?? 'YouTube trending video'),
      sourceId: 'youtube',
      source: 'YouTube charts',
      rank,
      metric: views,
      metricLabel: `${formatCompact(views)} views`,
      publishedAt: parseDate(item.snippet?.publishedAt),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`,
      snippet: truncate(item.snippet?.description ?? '', 160),
      category: 'Video charts',
      score: Math.round(score),
    }
  })
}

function annotateOverlap(items) {
  const prepared = items.map((item) => ({ item, words: keywordSet(item.title) }))
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      if (prepared[i].item.sourceId === prepared[j].item.sourceId) continue
      let shared = 0
      for (const word of prepared[i].words) {
        if (prepared[j].words.has(word)) shared += 1
      }
      if (shared >= 2) {
        prepared[i].item.alsoOn = [...new Set([...(prepared[i].item.alsoOn ?? []), prepared[j].item.source])]
        prepared[j].item.alsoOn = [...new Set([...(prepared[j].item.alsoOn ?? []), prepared[i].item.source])]
      }
    }
  }
  return items
}

function takeTop(items, limit) {
  return [...items].sort((a, b) => b.score - a.score).slice(0, limit)
}

async function readTrendsStore() {
  return readStore('trends.json', { snapshots: {} })
}

function snapshotsFor(store, geo) {
  if (!store.snapshots || typeof store.snapshots !== 'object') store.snapshots = {}
  if (!Array.isArray(store.snapshots[geo])) store.snapshots[geo] = []
  return store.snapshots[geo]
}

async function appendSnapshot(geo, at, signals) {
  const store = await readTrendsStore()
  const snapshots = snapshotsFor(store, geo)
  snapshots.push({
    at,
    items: signals.map((signal) => ({
      key: signal.key,
      title: truncate(signal.title, 150),
      source: signal.source,
      sourceId: signal.sourceId,
      rank: signal.rank,
      metric: signal.metric,
      score: signal.score,
    })),
  })
  while (snapshots.length > CONFIG.snapshotRetention) snapshots.shift()
  const geos = Object.keys(store.snapshots)
  if (geos.length > 3) {
    geos
      .filter((key) => key !== geo)
      .sort((a, b) => (store.snapshots[a].at ?? '').localeCompare(store.snapshots[b].at ?? ''))
      .slice(0, geos.length - 3)
      .forEach((key) => delete store.snapshots[key])
  }
  markStoreDirty('trends.json')
}

function attachHistory(signals, snapshots) {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000
  return signals.map((signal) => {
    const scores = []
    for (const snapshot of snapshots) {
      if (new Date(snapshot.at).getTime() < cutoff) continue
      const hit = snapshot.items?.find((item) => item.key === signal.key)
      if (hit) scores.push(hit.score)
    }
    const sparkline = scores.slice(-12)
    const growth =
      sparkline.length >= 2 && sparkline[0] > 0
        ? clamp(Math.round(((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100), -999, 999)
        : null
    return { ...signal, sparkline, points: sparkline.length, growth }
  })
}

async function runSource(id, fn) {
  try {
    const items = await fn()
    markStatus(id, {
      status: 'connected',
      lastFetch: new Date().toISOString(),
      lastError: null,
      count: items.length,
    })
    return items
  } catch (error) {
    const message = truncate(error?.message ?? error, 180)
    markStatus(id, { status: 'error', lastError: message, count: 0 })
    throw new Error(`${statuses[id].name}: ${message}`)
  }
}

function cachedResponse(reason) {
  if (!cache) return null
  return {
    ...cache.data,
    cached: true,
    stale: true,
    errors: reason ? [reason, ...(cache.data.errors ?? [])] : cache.data.errors,
    note: NOTE,
  }
}

export async function getLiveTrends({ geo = CONFIG.geo, force = false } = {}) {
  const now = Date.now()
  const fresh = cache && cache.geo === geo && now - cache.at < CONFIG.refreshMinutes * 60 * 1000
  const refreshSeconds = CONFIG.refreshMinutes * 60

  if (cache && cache.geo === geo && !force && fresh) {
    return {
      ...cache.data,
      cached: true,
      refreshSeconds,
      refreshInSec: Math.max(0, Math.round((CONFIG.refreshMinutes * 60 * 1000 - (now - cache.at)) / 1000)),
    }
  }

  if (cache && cache.geo === geo && force && now - lastAttempt < CONFIG.minRefreshMs) {
    return {
      ...cache.data,
      cached: true,
      throttled: true,
      refreshSeconds,
      note: `Refresh is limited to once per ${CONFIG.minRefreshMs / 1000}s. Showing the last fetch.`,
    }
  }

  lastAttempt = now
  const errors = []
  const tasks = [
    runSource('google-trends', () => fetchGoogleTrends(geo)),
    runSource('hacker-news', fetchHackerNews),
  ]
  if (statuses.youtube.enabled) {
    tasks.push(runSource('youtube', () => fetchYouTube(geo)))
  } else {
    markStatus('youtube', {
      status: 'not-configured',
      detail: 'Set YOUTUBE_API_KEY in .env to include chart data.',
    })
  }

  const results = await Promise.allSettled(tasks)
  const collected = []
  results.forEach((result) => {
    if (result.status === 'fulfilled') collected.push(...result.value)
    else errors.push(String(result.reason?.message ?? result.reason))
  })

  if (!collected.length) {
    const fallback = cachedResponse(errors[0])
    if (fallback) return { ...fallback, refreshSeconds, sources: getSourceStatuses() }
    return {
      ok: false,
      geo,
      fetchedAt: null,
      cached: false,
      refreshSeconds,
      refreshInSec: refreshSeconds,
      signals: [],
      sources: getSourceStatuses(),
      errors,
      note: 'No live source responded. Check the server logs or your network connection.',
    }
  }

  const annotated = annotateOverlap(collected)
  const signals = takeTop(annotated, 18)
  const at = new Date().toISOString()
  await appendSnapshot(geo, at, signals)

  const snapshots = snapshotsFor(await readTrendsStore(), geo)
  const enriched = attachHistory(signals, snapshots)

  const data = {
    ok: true,
    geo,
    fetchedAt: at,
    cached: false,
    refreshSeconds,
    refreshInSec: refreshSeconds,
    signals: enriched,
    sources: getSourceStatuses(),
    errors,
    note: NOTE,
  }
  cache = { geo, at: now, data }
  return data
}

export async function getSignalHistory(key, { geo = CONFIG.geo, hours = 24 } = {}) {
  if (!/^[a-z-]+:[0-9a-f]{1,16}$/.test(String(key ?? ''))) return null
  const span = Math.min(72, Math.max(1, Number(hours) || 24))
  const cutoff = Date.now() - span * 60 * 60 * 1000
  const store = await readTrendsStore()
  const snapshots = snapshotsFor(store, geo)
  const points = []
  let title = ''
  let source = ''
  let sourceId = ''
  for (const snapshot of snapshots) {
    if (new Date(snapshot.at).getTime() < cutoff) continue
    const hit = snapshot.items?.find((item) => item.key === key)
    if (!hit) continue
    points.push({ at: snapshot.at, score: hit.score, rank: hit.rank, metric: hit.metric })
    title = hit.title
    source = hit.source
    sourceId = hit.sourceId
  }
  if (!points.length) return null
  const first = points[0]
  const last = points[points.length - 1]
  return {
    ok: true,
    key,
    title,
    source,
    sourceId,
    geo,
    hours: span,
    points,
    samples: points.length,
    deltaScore: last.score - first.score,
    deltaRank: last.rank - first.rank,
    bestRank: Math.min(...points.map((point) => point.rank)),
    worstRank: Math.max(...points.map((point) => point.rank)),
    spanMinutes: Math.round((new Date(last.at).getTime() - new Date(first.at).getTime()) / 60000),
    note:
      points.length < 2
        ? 'One snapshot so far. History builds as the service refreshes.'
        : `Scores are local heuristics recorded across ${points.length} snapshots.`,
  }
}
