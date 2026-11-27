import { safeJsonParse, truncate } from '../util.mjs'

// Real model access for the workforce. One adapter per supported provider.
// Nothing here is simulated: if no key is present the workforce reports the
// local heuristic engine instead of pretending a model ran.

const TIMEOUT_MS = 45_000

export function resolveLlm() {
  const forced = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  const providers = [
    {
      id: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      key: process.env.OPENAI_API_KEY?.trim() || '',
    },
    {
      id: 'anthropic',
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
      key: process.env.ANTHROPIC_API_KEY?.trim() || '',
    },
    {
      id: 'gemini',
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
      key: process.env.GEMINI_API_KEY?.trim() || '',
    },
  ]
  if (forced) {
    const match = providers.find((provider) => provider.id === forced)
    if (!match) {
      return { configured: false, provider: null, model: null, detail: `Unknown AI_PROVIDER "${forced}".` }
    }
    if (!match.key) {
      return { configured: false, provider: null, model: null, detail: `AI_PROVIDER=${forced} is set but its key is missing.` }
    }
    return { configured: true, provider: match.id, model: match.model, detail: 'Key detected. Workforce tasks call this model when an agent is permitted to.' }
  }
  const found = providers.find((provider) => provider.key)
  if (!found) {
    return {
      configured: false,
      provider: null,
      model: null,
      detail: 'No model key configured. Agents use the local directive engine; no model is called.',
    }
  }
  return { configured: true, provider: found.id, model: found.model, detail: 'Key detected. Workforce tasks call this model when an agent is permitted to.' }
}

function keyFor(provider) {
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() || ''
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim() || ''
  if (provider === 'gemini') return process.env.GEMINI_API_KEY?.trim() || ''
  return ''
}

async function post(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  if (!response.ok) {
    const message =
      data?.error?.message || data?.error?.detail || data?.message || `provider responded ${response.status}`
    throw new Error(truncate(message, 240))
  }
  return data
}

async function callOpenAI(resolved, system, user) {
  const base = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const data = await post(
    `${base}/chat/completions`,
    { authorization: `Bearer ${keyFor('openai')}` },
    {
      model: resolved.model,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  )
  return data?.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(resolved, system, user) {
  const data = await post(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': keyFor('anthropic'),
      'anthropic-version': '2023-06-01',
    },
    {
      model: resolved.model,
      max_tokens: 1600,
      temperature: 0.5,
      system,
      messages: [{ role: 'user', content: user }],
    },
  )
  const blocks = Array.isArray(data?.content) ? data.content : []
  return blocks
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

async function callGemini(resolved, system, user) {
  const key = keyFor('gemini')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolved.model)}:generateContent?key=${encodeURIComponent(key)}`
  const data = await post(url, {}, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.5, responseMimeType: 'application/json' },
  })
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  return parts.map((part) => part?.text ?? '').join('\n')
}

/**
 * Call the configured model and parse a strict JSON object.
 * Returns { ok, data, provider, model, error }. Never throws.
 */
export async function callModel({ system, user }) {
  const resolved = resolveLlm()
  if (!resolved.configured) {
    return { ok: false, data: null, provider: null, model: null, error: resolved.detail }
  }
  try {
    const text =
      resolved.provider === 'openai'
        ? await callOpenAI(resolved, system, user)
        : resolved.provider === 'anthropic'
          ? await callAnthropic(resolved, system, user)
          : await callGemini(resolved, system, user)
    const data = safeJsonParse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, data: null, provider: resolved.provider, model: resolved.model, error: 'Model returned no valid JSON object.' }
    }
    return { ok: true, data, provider: resolved.provider, model: resolved.model, error: null }
  } catch (error) {
    return { ok: false, data: null, provider: resolved.provider, model: resolved.model, error: truncate(error?.message ?? error, 240) }
  }
}
