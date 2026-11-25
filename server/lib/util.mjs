export const USER_AGENT = 'ai-viral-studio-live/0.1 (local studio demo)'

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function hashKey(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

const STOPWORDS = new Set(
  'the a an and or but for to of in on at by with from as is are was were be been being this that these those it its into over after before about what why how who when where your you our their his her they we i not no new now more most can will just than then also via off out up'.split(
    ' ',
  ),
)

export function keywordSet(title) {
  const words = String(title).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  return new Set(words.filter((word) => !STOPWORDS.has(word)))
}

export function truncate(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

export function stripCdata(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return match ? match[1].trim() : text
}

export function decodeXml(value) {
  return stripCdata(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatCompact(value) {
  const number = Number(value) || 0
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}K`
  return String(Math.round(number))
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      ...(options.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} responded ${response.status}`)
  }
  return response
}

export async function fetchJson(url, options = {}, timeoutMs = 10_000) {
  const response = await fetchWithTimeout(url, options, timeoutMs)
  return response.json()
}

export function safeJsonParse(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}
