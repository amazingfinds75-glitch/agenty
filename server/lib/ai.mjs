import { fetchWithTimeout, safeJsonParse, truncate } from './util.mjs'

const SYSTEM = `You are the research analyst for a short-form video studio.
You receive one live topic signal plus its measured rank and opportunity-score history from public feeds.
Return strict JSON only with this shape:
{
  "angle": "one sentence editorial angle",
  "audience": "who this is for",
  "hooks": ["hook 1", "hook 2", "hook 3"],
  "risks": ["verification risk 1", "verification risk 2"],
  "chartRead": "what the rank/score history actually shows",
  "confidence": "low" | "medium" | "high"
}
Rules: do not invent statistics, sources or quotes; treat the provided signal as the only evidence.
Keep each hook under 140 characters. State when history is too thin to call a trend.`

function resolveProvider() {
  const forced = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  const openai = { id: 'openai', model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini', key: process.env.OPENAI_API_KEY?.trim() }
  const anthropic = {
    id: 'anthropic',
    model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
    key: process.env.ANTHROPIC_API_KEY?.trim(),
  }
  const gemini = {
    id: 'gemini',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    key: process.env.GEMINI_API_KEY?.trim(),
  }
  const all = [openai, anthropic, gemini]
  if (forced) {
    const match = all.find((provider) => provider.id === forced)
    if (!match) return { configured: false, provider: null, model: null, detail: `Unknown AI_PROVIDER "${forced}". Use openai, anthropic or gemini.` }
    if (!match.key) return { configured: false, provider: null, model: null, detail: `AI_PROVIDER=${forced} is set but its API key is missing.` }
    return { configured: true, provider: match.id, model: match.model, detail: 'Key detected. Calls run only when you request analysis.' }
  }
  const found = all.find((provider) => provider.key)
  if (!found) {
    return {
      configured: false,
      provider: null,
      model: null,
      detail: 'No AI key configured. Analyses use the local heuristic engine. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY.',
    }
  }
  return { configured: true, provider: found.id, model: found.model, detail: 'Key detected. Calls run only when you request analysis.' }
}

export function getAIStatus() {
  return resolveProvider()
}

function providerKey(id) {
  if (id === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? ''
  if (id === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim() ?? ''
  if (id === 'gemini') return process.env.GEMINI_API_KEY?.trim() ?? ''
  return ''
}

export function heuristicAnalysis(input) {
  const growth = typeof input.growth === 'number' ? input.growth : null
  const momentum = growth == null ? 'new' : growth >= 15 ? 'rising' : growth <= -10 ? 'cooling' : 'steady'
  const topic = truncate(input.topic || 'this topic', 110)
  const source = input.source || 'a public feed'
  const audience =
    input.sourceId === 'hacker-news'
      ? 'Developers, founders and technical operators who already follow builder news.'
      : input.sourceId === 'youtube'
        ? 'Video-native viewers who discover topics through charts and recommendations.'
        : 'A broad search audience that is actively looking for context right now.'
  const hooks = [
    momentum === 'rising'
      ? `${truncate(topic, 80)} is climbing: what changed, and why now`
      : momentum === 'cooling'
        ? `${truncate(topic, 80)} is cooling off — what actually mattered`
        : `The signal behind ${truncate(topic, 80)} — explained in 45 seconds`,
    `Most explainers get ${truncate(topic, 70)} wrong. Here is the part that matters`,
    growth == null
      ? `One snapshot is not a trend. Here is how to read ${truncate(topic, 60)}`
      : `Attention moved ${growth >= 0 ? '+' : ''}${growth}% — the practical read on ${truncate(topic, 60)}`,
  ]
  const risks = [
    'Momentum is computed from public feed rank and snapshot history, not audience testing.',
    'Headline claims are unverified. Confirm with the linked outlet before publishing.',
  ]
  const bestRank = typeof input.bestRank === 'number' ? ` Best observed rank: #${input.bestRank}.` : ''
  const samples = Number(input.samples) || 0
  const chartRead =
    samples >= 2 && growth != null
      ? `Across ${samples} local snapshots the opportunity score moved ${growth >= 0 ? '+' : ''}${growth}%.${bestRank} Treat this as a directional signal, not a forecast.`
      : `Only ${samples || 1} snapshot recorded so far.${bestRank} A trend call needs repeated refreshes; treat the current position as a starting point.`
  return {
    angle: `${truncate(topic, 120)} — what changed, who feels it, and what to watch next.`,
    audience,
    hooks,
    risks,
    chartRead,
    confidence: samples >= 6 ? 'low' : 'low',
    momentum,
    note: `Derived locally from ${source} rank and snapshot history. No model was called.`,
  }
}

function requestPayload(input) {
  return JSON.stringify({
    topic: truncate(input.topic, 200),
    source: truncate(input.source, 80),
    rank: input.rank ?? null,
    metric: truncate(input.metricLabel, 80),
    opportunityScore: input.score ?? null,
    growthPercent: typeof input.growth === 'number' ? input.growth : null,
    samples: input.samples ?? null,
    bestRank: input.bestRank ?? null,
    recentScores: Array.isArray(input.recent) ? input.recent.slice(-10).map((n) => Number(n) || 0) : [],
  })
}

async function callOpenAI(status, payload) {
  const base = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const response = await fetchWithTimeout(
    `${base}/chat/completions`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${providerKey('openai')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: status.model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: payload },
        ],
      }),
    },
    30_000,
  )
  const data = await response.json()
  return safeJsonParse(data?.choices?.[0]?.message?.content)
}

async function callAnthropic(status, payload) {
  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': providerKey('anthropic'),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: status.model,
        max_tokens: 900,
        temperature: 0.4,
        system: SYSTEM,
        messages: [{ role: 'user', content: payload }],
      }),
    },
    30_000,
  )
  const data = await response.json()
  const text = Array.isArray(data?.content)
    ? data.content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
    : ''
  return safeJsonParse(text)
}

async function callGemini(status, payload) {
  const key = providerKey('gemini')
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(status.model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: payload }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    },
    30_000,
  )
  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n') ?? ''
  return safeJsonParse(text)
}

function normalizeAnalysis(candidate, input) {
  if (!candidate || typeof candidate !== 'object') return null
  const strings = (value, max, length) =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .slice(0, max)
          .map((item) => truncate(item.trim(), length))
      : []
  const angle = typeof candidate.angle === 'string' ? truncate(candidate.angle.trim(), 400) : ''
  const audience = typeof candidate.audience === 'string' ? truncate(candidate.audience.trim(), 300) : ''
  const chartRead = typeof candidate.chartRead === 'string' ? truncate(candidate.chartRead.trim(), 400) : ''
  const hooks = strings(candidate.hooks, 3, 220)
  const risks = strings(candidate.risks, 3, 240)
  if (!angle || !audience || !chartRead || hooks.length < 2) return null
  const fallback = heuristicAnalysis(input)
  return {
    angle,
    audience,
    hooks,
    risks: risks.length ? risks : fallback.risks,
    chartRead,
    confidence: ['low', 'medium', 'high'].includes(candidate.confidence) ? candidate.confidence : 'medium',
    momentum: fallback.momentum,
    note: null,
  }
}

export async function runAnalysis(input) {
  const status = getAIStatus()
  const started = Date.now()
  if (!status.configured) {
    return {
      engine: 'heuristic',
      provider: null,
      model: null,
      latencyMs: 0,
      analysis: heuristicAnalysis(input),
      warning: 'AI provider is not configured. This is a local heuristic analysis.',
    }
  }
  try {
    const payload = requestPayload(input)
    const candidate =
      status.provider === 'openai'
        ? await callOpenAI(status, payload)
        : status.provider === 'anthropic'
          ? await callAnthropic(status, payload)
          : await callGemini(status, payload)
    const analysis = normalizeAnalysis(candidate, input)
    if (!analysis) throw new Error('Provider returned an unusable analysis shape')
    return {
      engine: 'ai',
      provider: status.provider,
      model: status.model,
      latencyMs: Date.now() - started,
      analysis,
    }
  } catch (error) {
    return {
      engine: 'heuristic',
      provider: status.provider,
      model: status.model,
      latencyMs: Date.now() - started,
      analysis: heuristicAnalysis(input),
      warning: 'The AI call failed. Returned local heuristic analysis instead.',
      aiError: truncate(error?.message ?? error, 220),
    }
  }
}
