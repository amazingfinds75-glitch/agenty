export type SourceStatusValue = 'idle' | 'connected' | 'error' | 'not-configured'

export interface LiveSourceStatus {
  id: string
  name: string
  enabled: boolean
  status: SourceStatusValue
  detail: string
  lastFetch: string | null
  lastError: string | null
  count: number
}

export interface BackendHealth {
  ok: boolean
  name: string
  version: string
  time: string
  uptimeSec: number
  trends: {
    geo: string
    refreshSeconds: number
    fetchedAt: string | null
    count: number
    cacheAgeSec: number | null
  }
  sources: LiveSourceStatus[]
  ai: {
    configured: boolean
    provider: string | null
    model: string | null
    detail: string
  }
  video: {
    configured: boolean
    provider: string | null
    model: string | null
    detail: string
    note: string
  }
  publishing: {
    configured: boolean
    detail: string
  }
  note: string
}

export interface LiveSignal {
  key: string
  title: string
  sourceId: string
  source: string
  rank: number
  metric: number
  metricLabel: string
  publishedAt: string | null
  url: string
  snippet: string
  category: string
  score: number
  growth: number | null
  points: number
  sparkline: number[]
  alsoOn: string[]
}

export interface LiveTrendsResponse {
  ok: boolean
  geo: string
  fetchedAt: string | null
  cached: boolean
  refreshInSec: number
  refreshSeconds?: number
  signals: LiveSignal[]
  sources: LiveSourceStatus[]
  errors: string[]
  note: string
  stale?: boolean
  throttled?: boolean
}

export interface SignalHistoryPoint {
  at: string
  score: number
  rank: number
  metric: number
}

export interface SignalHistory {
  ok: boolean
  key: string
  title: string
  source: string
  sourceId: string
  geo: string
  hours: number
  points: SignalHistoryPoint[]
  samples: number
  deltaScore: number
  deltaRank: number
  bestRank: number
  worstRank: number
  spanMinutes: number
  note: string
}

export interface LiveAnalysis {
  angle: string
  audience: string
  hooks: string[]
  risks: string[]
  chartRead: string
  confidence: string
  momentum?: string
  note?: string | null
}

export interface LiveAnalysisResponse {
  ok: boolean
  engine: 'ai' | 'heuristic'
  provider: string | null
  model: string | null
  latencyMs: number
  analysis: LiveAnalysis
  warning?: string
  aiError?: string
}

export class LiveApiError extends Error {
  status: number
  payload?: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'LiveApiError'
    this.status = status
    this.payload = payload
  }
}

function timeoutSignal(ms: number) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => window.clearTimeout(timer) }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const timed = timeoutSignal(timeoutMs)
  try {
    const response = await fetch(path, {
      ...init,
      signal: timed.signal,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    if (!response.ok || record?.ok === false) {
      const message =
        (typeof record?.error === 'string' && record.error) ||
        (typeof record?.detail === 'string' && record.detail) ||
        `Request failed (${response.status})`
      throw new LiveApiError(message, response.status, payload)
    }
    return payload as T
  } catch (error) {
    if (error instanceof LiveApiError) throw error
    if ((error as Error)?.name === 'AbortError') {
      throw new LiveApiError('The live backend did not respond in time.', 0)
    }
    throw new LiveApiError('The live backend is unreachable. Start it with "npm run server".', 0)
  } finally {
    timed.clear()
  }
}

export function fetchHealth() {
  return request<BackendHealth>('/api/health', undefined, 4_000)
}

export function fetchLiveTrends(refresh = false) {
  return request<LiveTrendsResponse>(`/api/live/trends${refresh ? '?refresh=1' : ''}`, undefined, 20_000)
}

export function fetchSignalHistory(key: string, hours = 24) {
  return request<SignalHistory>(
    `/api/live/history?key=${encodeURIComponent(key)}&hours=${hours}`,
    undefined,
    8_000,
  )
}

export function analyzeLiveSignal(signal: LiveSignal, history: SignalHistory | null) {
  const body = {
    topic: signal.title,
    signal: {
      source: signal.source,
      sourceId: signal.sourceId,
      rank: signal.rank,
      score: signal.score,
      growth: signal.growth,
      metricLabel: signal.metricLabel,
      samples: history?.samples ?? signal.points,
      bestRank: history?.bestRank ?? null,
      recent: history ? history.points.map((point) => point.score) : signal.sparkline,
    },
  }
  return request<LiveAnalysisResponse>(
    '/api/live/analyze',
    { method: 'POST', body: JSON.stringify(body) },
    35_000,
  )
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
