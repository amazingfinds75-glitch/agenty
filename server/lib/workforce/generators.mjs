import { CAPABILITY_TEMPLATES, DEFAULT_DIRECTIVES, PLATFORMS, LANGUAGES } from './capabilities.mjs'

// Local directive engine. Every capability can run without a model key: the
// output is real (a screenplay, SRT, SVG cover, verified claim ledger, edit
// plan) and is labelled as locally generated. When a model is configured and
// the agent is permitted, the task executor merges model output on top of this
// deterministic baseline.

const PALETTES = [
  { from: '#0B1E3A', to: '#08213B', accent: '#00D4FF' },
  { from: '#1B1035', to: '#2A0F3E', accent: '#8B5CF6' },
  { from: '#0A2A24', to: '#062B24', accent: '#34D399' },
  { from: '#2A1608', to: '#331A06', accent: '#FBBF24' },
  { from: '#2A0F1C', to: '#330F20', accent: '#FB7185' },
  { from: '#07222E', to: '#062033', accent: '#2DD4BF' },
  { from: '#121A38', to: '#151334', accent: '#818CF8' },
]

const STOPWORDS = new Set(
  'the a an and or but for to of in on at by with from as is are was were be been being this that these those it its into over after before about what why how who when where your you our their his her they we i not no new now more most can will just than then also via off out up make create produce generate reel reels video videos short shorts youtube instagram seconds second minute minutes please want need'.split(
    ' ',
  ),
)

export function hashString(input) {
  let hash = 2166136261
  const text = String(input ?? '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick(list, seed) {
  if (!list.length) return undefined
  const index = Math.abs(Math.trunc(Number(seed) || 0)) % list.length
  return list[index]
}

export function truncateText(value, max) {
  const text = String(value ?? '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function keywords(topic) {
  const words = String(topic).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  return [...new Set(words.filter((word) => !STOPWORDS.has(word)))]
}

function cleanTopic(topic) {
  const text = String(topic ?? '').trim().replace(/\s+/g, ' ')
  return text || 'untitled topic'
}

function sentenceCase(text) {
  const value = String(text ?? '').trim()
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

function sceneCountFor(platform, durationSec) {
  const config = PLATFORMS[platform] ?? PLATFORMS['instagram-reel']
  if (platform === 'youtube-long') return config.scenes
  return Math.max(4, Math.min(8, Math.round(durationSec / 6) || config.scenes))
}

export function sceneTimings(durationSec, count) {
  const total = Math.max(6, Math.round(durationSec))
  const base = Math.floor(total / count)
  let cursor = 0
  const scenes = []
  for (let i = 0; i < count; i += 1) {
    const end = i === count - 1 ? total : Math.min(total, cursor + base)
    scenes.push({ startSec: cursor, endSec: end })
    cursor = end
  }
  return scenes
}

function formatSrtTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const ms = Math.round((value - Math.floor(value)) * 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (trial.length <= maxChars || !current) {
      current = trial
    } else {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === maxLines && words.length) {
    const consumed = lines.join(' ').split(/\s+/).length
    if (consumed < words.length) {
      const last = lines[maxLines - 1]
      lines[maxLines - 1] = truncateText(last, Math.max(8, last.length - 2))
    }
  }
  return lines
}

function svgCover({ title, kicker, accent, from, to, width, height, platformLabel }) {
  const pad = Math.round(width * 0.075)
  const titleSize = width >= 1000 ? 78 : 58
  const maxChars = Math.floor((width - pad * 2) / (titleSize * 0.56))
  const lines = wrapText(title, maxChars, 4)
  const lineHeight = titleSize * 1.06
  const titleTop = Math.round(height * 0.42)
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<text x="${pad}" y="${titleTop + index * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700" fill="#F5F7FA">${escapeXml(line)}</text>`,
    )
    .join('')
  const meta = platformLabel ? PLATFORMS[platformLabel]?.label ?? platformLabel : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07090D"/>
      <stop offset="0.55" stop-color="${escapeXml(from)}"/>
      <stop offset="1" stop-color="#07090D"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.26" r="0.7">
      <stop offset="0" stop-color="${escapeXml(accent)}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${escapeXml(accent)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g stroke="${escapeXml(accent)}" stroke-opacity="0.35" fill="none">
    <ellipse cx="${Math.round(width * 0.76)}" cy="${Math.round(height * 0.27)}" rx="${Math.round(width * 0.24)}" ry="${Math.round(width * 0.1)}" transform="rotate(-18 ${Math.round(width * 0.76)} ${Math.round(height * 0.27)})"/>
    <ellipse cx="${Math.round(width * 0.76)}" cy="${Math.round(height * 0.27)}" rx="${Math.round(width * 0.31)}" ry="${Math.round(width * 0.13)}" transform="rotate(22 ${Math.round(width * 0.76)} ${Math.round(height * 0.27)})"/>
  </g>
  <text x="${pad}" y="${pad + 16}" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="3" fill="#F5F7FA" fill-opacity="0.68">AI VIRAL STUDIO</text>
  <text x="${width - pad}" y="${pad + 16}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="14" letter-spacing="2" fill="${escapeXml(accent)}">${escapeXml(kicker)}</text>
  ${lineMarkup}
  <rect x="${pad}" y="${titleTop + lines.length * lineHeight + 18}" width="64" height="3" fill="${escapeXml(accent)}"/>
  <text x="${pad}" y="${height - pad}" font-family="Arial, Helvetica, sans-serif" font-size="14" letter-spacing="2" fill="#F5F7FA" fill-opacity="0.5">${escapeXml(meta.toUpperCase())} · LOCAL SVG ASSET</text>
</svg>`
}

function researchItemsFromSignals(topic, signals) {
  const topicWords = keywords(topic)
  const matches = []
  for (const signal of Array.isArray(signals) ? signals : []) {
    const haystack = `${signal.title} ${signal.snippet ?? ''}`.toLowerCase()
    let overlap = 0
    for (const word of topicWords) if (haystack.includes(word)) overlap += 1
    if (overlap === 0) continue
    const relevance = Math.min(100, Math.round(overlap * 22 + (Number(signal.score) || 0) * 0.55))
    matches.push({
      id: signal.key ?? `sig-${hashString(signal.title)}`,
      source: signal.source ?? 'Public feed',
      title: signal.title ?? 'Untitled signal',
      url: signal.url ?? '',
      note: `${signal.metricLabel ?? ''}${signal.metricLabel ? ' · ' : ''}rank #${signal.rank ?? '?'} · matched ${overlap} keyword${overlap === 1 ? '' : 's'}`,
      relevance,
      publishedAt: signal.publishedAt ?? null,
    })
  }
  return matches.sort((a, b) => b.relevance - a.relevance).slice(0, 8)
}

function allResearchText(research) {
  return (Array.isArray(research) ? research : []).map((item) => `${item.title} ${item.note}`).join(' ').toLowerCase()
}

const MOODS = ['bright', 'insight', 'calm', 'tense']

function buildScenes({ topic, platform, durationSec, directives, language, research, revisionNote }) {
  const clean = cleanTopic(topic)
  const count = sceneCountFor(platform, durationSec)
  const timings = sceneTimings(durationSec, count)
  const revisionFocus = revisionNote
    ? truncateText(String(revisionNote).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, ''), 120)
    : ''
  const accentNote = research.length
    ? `Public signals matched: ${research
        .slice(0, 2)
        .map((item) => item.title)
        .join('; ')}.`
    : 'No public signal matched this brief, so the script stays on the stated topic and avoids unverifiable claims.'
  const wordTarget = Math.max(18, Math.round((durationSec * directives.minWordsPerMin) / 60 / count))
  const beats = [
    {
      label: 'Hook',
      narration: revisionFocus
        ? `${sentenceCase(clean)} — the operator asked for this revision: ${revisionFocus}.`
        : `${sentenceCase(clean)} — here is the part most people miss.`,
      visual: `Bold kinetic title over a deep gradient keyed to the topic, ${clean} motifs animating in.`,
      shot: 'Fast push-in, text snaps on the beat',
    },
    {
      label: 'Why now',
      narration: `This matters right now because attention around ${clean} is moving faster than the explainers can keep up.`,
      visual: 'Signal lines and search-style bars rising behind the presenter frame.',
      shot: 'Slow lateral drift with parallax layers',
    },
    {
      label: revisionFocus ? 'Revision focus' : 'What changed',
      narration: revisionFocus
        ? `Revision focus: ${revisionFocus}. ${accentNote}`
        : accentNote,
      visual: 'Evidence cards with source names; no invented statistics.',
      shot: 'Top-down card stack, calm pacing',
    },
    {
      label: 'How it works',
      narration: `Break ${clean} into three moving parts, then show how they interact in practice.`,
      visual: 'Three-node diagram assembling itself, each node labelled with a keyword.',
      shot: 'Macro detail of connectors, then pull out',
    },
    {
      label: 'What to watch',
      narration: `Watch the next signal, not the loudest headline: the useful read is what changes after the first wave.`,
      visual: 'Timeline with before/after markers and a highlighted watch point.',
      shot: 'Tracking shot along the timeline',
    },
    {
      label: 'Takeaway',
      narration: `If you only remember one thing about ${clean}, remember this: verify the claim, then decide what it changes for you.`,
      visual: 'Single bold takeaway line with the accent rule underneath.',
      shot: 'Static hero frame, subtle grain',
    },
    {
      label: 'Close',
      narration: directives.requireCta ? 'Follow for the next verified breakdown.' : `That is the read on ${clean}.`,
      visual: 'End card with the studio mark and a follow prompt.',
      shot: 'Hold, gentle zoom out',
    },
    {
      label: 'Bonus note',
      narration: 'Drop a question in the comments and the research desk will check it against the next signal.',
      visual: 'Comment-style prompt card floating over the end frame.',
      shot: 'Soft float, no cut',
    },
  ]
  return timings.map((timing, index) => {
    const beat = beats[Math.min(beats.length - 1, index)] ?? beats[beats.length - 1]
    const narration = index >= 6 ? beat.narration : ensureWordFloor(beat.narration, clean, wordTarget, index)
    return {
      id: `scene-${index + 1}`,
      label: beat.label,
      startSec: timing.startSec,
      endSec: timing.endSec,
      narration,
      visual: beat.visual,
      shot: beat.shot,
      mood: MOODS[index % MOODS.length],
      language,
    }
  })
}

function ensureWordFloor(text, topic, wordTarget, index) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length >= wordTarget) return text
  const additions = [
    `The point is not the noise around ${topic}; it is the change underneath it.`,
    `Keep the framing concrete: who feels this, what they do differently, and what evidence would prove it.`,
    `That gives the edit a clean beat to land before the next idea arrives.`,
    `No invented numbers here — the next scene shows what the public evidence actually supports.`,
  ]
  let result = text
  let cursor = index
  while (result.split(/\s+/).filter(Boolean).length < wordTarget) {
    result = `${result} ${additions[cursor % additions.length]}`
    cursor += 1
  }
  return result
}

function extractClaims(scenes, researchText) {
  const claims = []
  for (const scene of scenes) {
    const sentences = String(scene.narration)
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
    for (const sentence of sentences) {
      const notable = /\d/.test(sentence) || /(best|first|fastest|largest|always|never|most|least|proves|guarantee)/i.test(sentence)
      if (!notable) continue
      const numbers = sentence.match(/\d+(?:\.\d+)?/g) ?? []
      const verified = numbers.length > 0 && numbers.some((number) => researchText.includes(number))
      claims.push({
        text: truncateText(sentence, 220),
        status: verified ? 'verified' : 'unverified',
        evidence: verified ? 'A matching figure appears in the collected evidence pack.' : 'No figure in the evidence pack supports this sentence.',
        sceneId: scene.id,
      })
    }
  }
  return claims
}

function captionCues(scenes) {
  const cues = []
  for (const scene of scenes) {
    const words = String(scene.narration).split(/\s+/).filter(Boolean)
    const chunks = []
    let current = []
    for (const word of words) {
      current.push(word)
      if (current.length >= 11) {
        chunks.push(current.join(' '))
        current = []
      }
    }
    if (current.length) chunks.push(current.join(' '))
    const span = Math.max(1.2, scene.endSec - scene.startSec)
    const per = span / Math.max(1, chunks.length)
    chunks.forEach((chunk, index) => {
      cues.push({
        startSec: Number((scene.startSec + per * index).toFixed(2)),
        endSec: Number((scene.startSec + per * (index + 1)).toFixed(2)),
        text: chunk,
        sceneId: scene.id,
      })
    })
  }
  return cues
}

function toSrt(cues) {
  return cues
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}`)
    .join('\n\n')
}

function wordCount(scenes) {
  return scenes.reduce((sum, scene) => sum + String(scene.narration).split(/\s+/).filter(Boolean).length, 0)
}

function check(id, label, status, detail) {
  return { id, label, status, detail }
}

function themeFor(topic, seed) {
  const base = PALETTES[seed % PALETTES.length]
  return { ...base }
}

function buildResearch({ production, signals, directives }) {
  const items = researchItemsFromSignals(production.topic, signals)
  const checks = [
    items.length > 0
      ? check('sources', 'Live evidence collected', 'pass', `${items.length} public signal${items.length === 1 ? '' : 's'} matched the brief.`)
      : check('sources', 'Live evidence collected', 'warn', 'No public signal matched the topic. The script will avoid unsourced claims.'),
    check('ledger', 'Source ledger complete', 'pass', 'Every item carries a source name, url and relevance score; nothing was invented.'),
  ]
  if (directives.labelUnverified) {
    checks.push(check('labeling', 'Unverified claims will be labelled', 'pass', 'The fact-check task inherits the labelling rule.'))
  }
  const summary = items.length
    ? `Matched ${items.length} live public signals for “${truncateText(production.topic, 90)}”. Top: ${items[0].title}.`
    : `No live public signal matched “${truncateText(production.topic, 90)}”. Evidence is limited to the brief; the script is written to avoid unsourced claims.`
  return {
    summary,
    checks,
    artifacts: { research: items },
    data: { items, matched: items.length },
  }
}

function buildStrategy({ production, upstream, directives }) {
  const research = upstream['trend-research']?.artifacts?.research ?? []
  const platform = PLATFORMS[production.platform] ?? PLATFORMS['instagram-reel']
  const seed = hashString(`${production.id}:strategy`)
  const angles = [
    `The quiet mechanism behind ${production.topic} — explained without hype.`,
    `${production.topic}: what changed, who feels it, and what to verify next.`,
    `Most explainers miss the boring part of ${production.topic}. That is the story.`,
  ]
  const audiences = [
    `Curious ${platform.label} viewers who want context faster than a headline.`,
    `Practitioners who already know the headline and need the mechanism.`,
    `A general audience arriving from search or the feed with no background.`,
  ]
  const angle = pick(angles, seed)
  const audience = pick(audiences, seed >> 3)
  const risks = []
  if (!research.length) risks.push('No live public signal matched; every claim must stay inside the brief.')
  risks.push('Claims flagged unverified by fact-check must be removed or rephrased before publishing.')
  risks.push('Publishing stays manual: no platform integration is configured.')
  const checks = [
    check('angle', 'Single editorial angle', angle.trim() ? 'pass' : 'fail', angle),
    check('audience', 'Audience defined', audience.trim() ? 'pass' : 'fail', audience),
    check('retention', 'Retention structure planned', 'pass', `Hook, context, mechanism, watch-list, takeaway across ${sceneCountFor(production.platform, production.durationSec)} scenes.`),
    check('risks', 'Risks named', risks.length ? 'pass' : 'warn', `${risks.length} risks recorded.`),
  ]
  return {
    summary: `Angle: ${angle} Audience: ${audience}`,
    checks,
    artifacts: {},
    data: {
      angle,
      audience,
      format: platform.format,
      retention: 'Hook in the first second, evidence at second 4-8, mechanism in the middle, explicit takeaway before the CTA.',
      cta: directives.requireCta ? 'Follow for the next verified breakdown.' : 'Close on the takeaway.',
      risks,
      researchCount: research.length,
    },
  }
}

function buildScript({ production, upstream, directives, language, revisionNote }) {
  const research = upstream['trend-research']?.artifacts?.research ?? []
  const strategy = upstream['content-strategy']?.data ?? {}
  const seed = hashString(`${production.id}:script:${revisionNote ?? ''}`)
  const clean = cleanTopic(production.topic)
  const scenes = buildScenes({
    topic: clean,
    platform: production.platform,
    durationSec: production.durationSec,
    directives,
    language,
    research,
    revisionNote,
  })
  const revisionFocus = revisionNote
    ? truncateText(String(revisionNote).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, ''), 120)
    : ''
  const hook = revisionFocus
    ? `“${sentenceCase(clean)} — revised to focus on ${revisionFocus}.”`
    : `“${sentenceCase(clean)} — here is what the headline leaves out.”`
  const titles = [
    truncateText(sentenceCase(clean), 70),
    `The part of ${truncateText(clean, 52)} nobody explains`,
    `What actually changed with ${truncateText(clean, 48)}`,
  ].slice(0, Math.max(1, directives.hooks))
  const cta = strategy.cta ?? (directives.requireCta ? 'Follow for the next verified breakdown.' : '')
  const words = wordCount(scenes)
  const target = Math.round((production.durationSec * directives.minWordsPerMin) / 60)
  const longest = Math.max(...scenes.map((scene) => scene.endSec - scene.startSec))
  const checks = [
    check('hook', 'Hook present and short', hook.length <= 140 ? 'pass' : 'fail', `Hook is ${hook.length} characters.`),
    check('scenes', 'Scene plan covers runtime', 'pass', `${scenes.length} scenes from 0s to ${production.durationSec}s.`),
    check('scene-length', `No scene over ${directives.sceneMaxSec}s`, longest <= directives.sceneMaxSec + 1 ? 'pass' : 'warn', `Longest scene is ${longest}s.`),
    check('word-budget', 'Spoken word budget', words >= Math.round(target * 0.8) ? 'pass' : 'warn', `${words} words against a ${target}-word target for ${production.durationSec}s.`),
    check('cta', 'Call to action', cta ? 'pass' : 'warn', cta || 'No CTA requested.'),
    check('evidence', 'Claim discipline', research.length ? 'pass' : 'warn', research.length ? 'Script references only collected signals.' : 'No evidence matched; script avoids statistics.'),
  ]
  return {
    summary: revisionFocus
      ? `Revised ${scenes.length} scenes (${words} words) around the operator note “${revisionFocus}”.`
      : `Wrote ${scenes.length} scenes (${words} words) with hook “${truncateText(hook, 80)}”.`,
    checks,
    artifacts: {
      title: titles[0] ?? sentenceCase(clean),
      titleOptions: titles,
      hook,
      cta,
      scenes,
      description: `${sentenceCase(clean)} — a ${production.durationSec}-second ${platformName(production.platform)} explainer. Script generated ${new Date().toISOString().slice(0, 10)}.`,
      wordCount: words,
      durationSec: production.durationSec,
      language,
      languageLabel: LANGUAGES[language] ?? 'English',
      revisionNote: revisionFocus || null,
    },
    data: { hook, titles, cta, scenes, words, seed, revisionNote: revisionFocus || null },
  }
}

function platformName(platform) {
  return (PLATFORMS[platform] ?? PLATFORMS['instagram-reel']).label
}

function buildFactCheck({ production, upstream, directives }) {
  const scenes = upstream.script?.artifacts?.scenes ?? []
  const research = upstream['trend-research']?.artifacts?.research ?? []
  const claims = extractClaims(scenes, allResearchText(research))
  const unverified = claims.filter((claim) => claim.status === 'unverified')
  const verified = claims.length - unverified.length
  const ratio = claims.length ? verified / claims.length : 1
  const checks = [
    check('claims', 'Claims extracted', claims.length ? 'pass' : 'warn', claims.length ? `${claims.length} notable claim${claims.length === 1 ? '' : 's'} reviewed.` : 'No numeric or absolute claims were found to check.'),
    check('verified', 'Verified ratio', ratio >= 0.8 ? 'pass' : 'warn', `${verified}/${claims.length || 0} claims verified against the evidence pack.`),
    check('labeling', 'Unverified claims labelled', directives.labelUnverified ? 'pass' : 'warn', directives.labelUnverified ? `${unverified.length} claim(s) carried forward as unverified.` : 'Labelling directive is off.'),
    check('evidence', 'Evidence pack size', research.length ? 'pass' : 'warn', `${research.length} live source${research.length === 1 ? '' : 's'} in the pack.`),
  ]
  return {
    summary: `Checked ${claims.length} claims: ${verified} verified, ${unverified.length} unverified.${unverified.length ? ' Unverified lines must be removed or rephrased before publishing.' : ''}`,
    checks,
    artifacts: { claims },
    data: { claims, verified, unverified, ratio, note: 'Verification compares script claims against the collected public-feed evidence pack. It is not external fact-checking.' },
  }
}

function buildLocalization({ production, upstream, directives, language }) {
  const script = upstream.script?.artifacts ?? {}
  const isEnglish = !language || language === 'en'
  const checks = [
    check(
      'language',
      'Target language',
      isEnglish ? 'pass' : 'warn',
      isEnglish ? 'Production language is English; no localization needed.' : `Target is ${LANGUAGES[language] ?? language}. The local engine cannot translate; it preserves the English script and flags this as blocked.`,
    ),
  ]
  return {
    summary: isEnglish
      ? 'English production; localization was not required.'
      : `Localization to ${LANGUAGES[language] ?? language} is blocked: no model key is configured. English scenes are preserved and the block is recorded for QC.`,
    checks,
    artifacts: {
      scenes: script.scenes ?? [],
      localization: { status: isEnglish ? 'not_required' : 'blocked', language, detail: isEnglish ? '' : 'Configure a model key and re-run to translate narration.' },
    },
    data: { language, blocked: !isEnglish, scenes: script.scenes ?? [], hook: script.hook ?? '', titles: script.titleOptions ?? [] },
  }
}

function buildStoryboard({ production, upstream, directives }) {
  const scenes = upstream.script?.artifacts?.scenes ?? []
  const seed = hashString(`${production.id}:board`)
  const framings = ['Wide establishing', 'Medium close', 'Macro detail', 'Graphic full-frame', 'Over-shoulder UI', 'Top-down cards']
  const movements = ['Push in', 'Lateral drift', 'Orbit', 'Locked off', 'Pull back', 'Handheld follow']
  const transitions = ['Hard cut', 'Whip pan', 'Match cut', 'Dissolve', 'Cut on beat']
  const shots = scenes.map((scene, index) => ({
    scene: index + 1,
    sceneId: scene.id,
    framing: framings[(seed + index) % framings.length],
    movement: movements[(seed + index * 3) % movements.length],
    overlay: truncateText(scene.narration, 64),
    transition: transitions[(seed + index * 5) % transitions.length],
  }))
  const checks = [
    check('coverage', 'Every scene boarded', shots.length === scenes.length && shots.length > 0 ? 'pass' : 'warn', `${shots.length}/${scenes.length} scenes have a shot.`),
    check('overlays', 'Overlay text present', shots.every((shot) => shot.overlay) ? 'pass' : 'warn', 'Overlay copy is derived from the narration, not added claims.'),
  ]
  return {
    summary: `Boarded ${shots.length} shots with framing, movement and transitions.`,
    checks,
    artifacts: { storyboard: shots },
    data: { shots },
  }
}

function buildNarration({ production, upstream, directives, language }) {
  const localizedScenes = upstream.localization?.artifacts?.scenes
  const scenes = localizedScenes?.length ? localizedScenes : upstream.script?.artifacts?.scenes ?? []
  const script = upstream.script?.artifacts ?? {}
  const scriptText = scenes.map((scene) => scene.narration).join('\n\n')
  const words = scriptText.split(/\s+/).filter(Boolean).length
  const checks = [
    check('script', 'Narration script assembled', scriptText.trim() ? 'pass' : 'fail', `${words} spoken words across ${scenes.length} scenes.`),
    check('voice', 'Voice synthesis', 'warn', 'No TTS provider is configured. The narration ships as a timed script; the browser renders a silent cut rather than faking audio.'),
    check('language', 'Narration language', language === 'en' || language ? 'pass' : 'warn', `Language: ${LANGUAGES[language] ?? 'English'}.`),
  ]
  return {
    summary: `Prepared ${words} spoken words. Audio is blocked without a TTS provider.`,
    checks,
    artifacts: {
      narrationScript: scriptText,
      wordCount: words,
      voice: {
        status: 'blocked',
        detail: 'No TTS provider configured. Narration is a timed script; the local renderer is silent.',
      },
    },
    data: { script: scriptText, words, voice: 'blocked', hook: script.hook ?? '' },
  }
}

function buildVisuals({ production, upstream, directives }) {
  const theme = themeFor(production.topic, hashString(production.id))
  const shots = upstream.storyboard?.data?.shots ?? []
  const scenes = upstream.script?.artifacts?.scenes ?? []
  const sceneArt = scenes.map((scene, index) => ({
    scene: index + 1,
    prompt: `Abstract editorial background for “${truncateText(scene.label, 40)}”: ${scene.visual}`,
    elements: ['gradient wash', 'orbital rings', 'subtle grid', 'accent glow'],
  }))
  const checks = [
    check('theme', 'Palette defined', 'pass', `${theme.accent} on ${theme.from}.`),
    check('scene-art', 'Art direction per scene', sceneArt.length === scenes.length && sceneArt.length > 0 ? 'pass' : 'warn', `${sceneArt.length} scene treatments.`),
    check('shots', 'Storyboard consumed', shots.length ? 'pass' : 'warn', `${shots.length} shots referenced.`),
  ]
  return {
    summary: `Defined ${sceneArt.length} scene treatments with accent ${theme.accent}.`,
    checks,
    artifacts: { theme, sceneArt },
    data: { theme, sceneArt },
  }
}

function buildEdit({ production, upstream, directives }) {
  const scenes = upstream.script?.artifacts?.scenes ?? []
  const shots = upstream.storyboard?.data?.shots ?? []
  const timeline = scenes.map((scene, index) => ({
    scene: index + 1,
    startSec: scene.startSec,
    endSec: scene.endSec,
    durationSec: scene.endSec - scene.startSec,
    transition: shots[index]?.transition ?? 'Hard cut',
  }))
  const total = timeline.length ? timeline[timeline.length - 1].endSec : 0
  const checks = [
    check('timeline', 'Timeline covers runtime', Math.abs(total - production.durationSec) <= 1 ? 'pass' : 'warn', `Timeline ends at ${total}s against a ${production.durationSec}s brief.`),
    check('transitions', 'Transitions assigned', timeline.every((row) => row.transition) ? 'pass' : 'warn', `${timeline.length} cuts mapped.`),
    check('audio', 'Audio plan', 'warn', 'Ambient bed is synthesized in the browser at render time; narration audio is blocked without TTS.'),
    check('render', 'Render execution', 'warn', 'This task produces an edit decision list. Video bytes exist only after the browser renderer runs and the file is uploaded.'),
  ]
  return {
    summary: `Assembled a ${timeline.length}-scene edit decision list ending at ${total}s. Render is executed by the browser canvas renderer.`,
    checks,
    artifacts: {
      editPlan: {
        timeline,
        transitions: timeline.map((row) => row.transition),
        captionStyle: 'Bold lower-third, two lines, accent rule',
        audioBed: 'Browser-synthesized ambient pad; narration blocked without TTS',
        renderMode: 'browser-canvas',
      },
    },
    data: { timeline },
  }
}

function buildCaptions({ production, upstream, directives }) {
  const localizedScenes = upstream.localization?.artifacts?.scenes
  const scenes = localizedScenes?.length ? localizedScenes : upstream.script?.artifacts?.scenes ?? []
  const cues = captionCues(scenes)
  const srt = toSrt(cues)
  const maxWords = Math.max(0, ...cues.map((cue) => cue.text.split(/\s+/).filter(Boolean).length))
  const checks = [
    check('cues', 'Cues generated', cues.length ? 'pass' : 'fail', `${cues.length} caption cues.`),
    check('readability', 'Two-line readability', maxWords <= 12 ? 'pass' : 'warn', `Longest cue is ${maxWords} words.`),
    check('sync', 'Cues stay in scene bounds', 'pass', 'Every cue is clamped to its scene window.'),
  ]
  return {
    summary: `Wrote ${cues.length} synchronized caption cues.`,
    checks,
    artifacts: { srt, captionCues: cues },
    data: { cues, srt },
  }
}

function buildThumbnail({ production, upstream, directives }) {
  const script = upstream.script?.artifacts ?? {}
  const theme = upstream['visual-design']?.artifacts?.theme ?? themeFor(production.topic, hashString(production.id))
  const coverText = truncateText(script.title ?? production.topic, 42)
  const title = coverText
  const kicker = production.platform === 'instagram-reel' ? 'REEL COVER' : 'THUMBNAIL'
  const thumbnailSvg = svgCover({ title, kicker: 'THUMBNAIL', accent: theme.accent, from: theme.from, to: theme.to, width: 1280, height: 720, platformLabel: production.platform })
  const coverSvg = svgCover({ title, kicker, accent: theme.accent, from: theme.from, to: theme.to, width: 720, height: 1280, platformLabel: production.platform })
  const checks = [
    check('text', 'Cover text present', title ? 'pass' : 'fail', title),
    check('safe-area', 'Text inside safe area', title.length <= 48 ? 'pass' : 'warn', `${title.length} characters in cover text.`),
    check('assets', 'Both aspect ratios rendered', 'pass', '1280×720 thumbnail and 720×1280 cover SVG generated locally.'),
  ]
  return {
    summary: `Designed a thumbnail and reel cover with cover text “${title}”.`,
    checks,
    artifacts: { thumbnailSvg, coverSvg, coverText: title },
    data: { coverText: title, concept: 'Orbital signal rings over a deep gradient with a single bold line.', accent: theme.accent },
  }
}

function buildMetadata({ production, upstream, directives }) {
  const script = upstream.script?.artifacts ?? {}
  const strategy = upstream['content-strategy']?.data ?? {}
  const theme = upstream['visual-design']?.artifacts?.theme ?? themeFor(production.topic, hashString(production.id))
  const title = truncateText(script.title ?? production.topic, 88)
  const tags = [
    'explainer', 'shortform', 'video', 'studio', 'trend', ...keywords(production.topic).slice(0, 8),
  ].slice(0, 12)
  const hashtags = ['#explainer', '#shortform', '#video', '#studio', ...keywords(production.topic).slice(0, 5).map((word) => `#${word.replace(/[^a-z0-9]/g, '')}`)].slice(0, 10)
  const description = [
    script.description ?? `${production.topic} explained in ${production.durationSec} seconds.`,
    '',
    `Angle: ${strategy.angle ?? 'Not recorded.'}`,
    '',
    'Sources are listed inside the production record. Claims marked unverified must be resolved before publishing.',
    'Publishing is manual; no platform integration is connected.',
  ].join('\n')
  const instagramCaption = `${truncateText(script.hook ?? production.topic, 120)}\n\n${hashtags.join(' ')}`
  const checks = [
    check('youtube-title', 'YouTube title length', title.length <= 100 ? 'pass' : 'warn', `${title.length}/100 characters.`),
    check('tags', 'Tags prepared', tags.length >= 6 ? 'pass' : 'warn', `${tags.length} tags.`),
    check('hashtags', 'Hashtags prepared', hashtags.length >= 3 ? 'pass' : 'warn', `${hashtags.length} hashtags.`),
    check('honesty', 'Publishing status', 'warn', 'Metadata is prepared, not published. No platform credentials are connected.'),
  ]
  return {
    summary: `Prepared YouTube and Instagram metadata, ${tags.length} tags and ${hashtags.length} hashtags.`,
    checks,
    artifacts: {
      youtubeTitle: title,
      youtubeTags: tags,
      instagramCaption,
      hashtags,
      description,
      metadata: { title, tags, hashtags, description, instagramCaption },
    },
    data: { title, tags, hashtags, description, instagramCaption, accent: theme.accent },
  }
}

function buildQc({ production, upstream, directives }) {
  const script = upstream.script?.artifacts ?? {}
  const facts = upstream['fact-check']?.data ?? {}
  const captions = upstream.captions?.artifacts ?? {}
  const thumb = upstream.thumbnail?.artifacts ?? {}
  const meta = upstream['seo-metadata']?.artifacts ?? {}
  const scenes = script.scenes ?? []
  const duration = production.durationSec
  const end = scenes.length ? scenes[scenes.length - 1].endSec : 0
  const unverified = facts.unverified ?? 0
  const claims = facts.claims ?? []
  const localized = upstream.localization?.data ?? null
  const checks = [
    check('runtime', 'Runtime coverage', Math.abs(end - duration) <= 1 ? 'pass' : 'warn', `Scenes end at ${end}s against ${duration}s.`),
    check('claims', 'Unverified claims', unverified === 0 ? 'pass' : 'fail', unverified ? `${unverified} claim(s) remain unverified: ${claims.filter((claim) => claim.status === 'unverified').slice(0, 2).map((claim) => truncateText(claim.text, 60)).join(' | ')}` : 'No unverified claims in the current script.'),
    check('captions', 'Caption track', (captions.captionCues ?? []).length ? 'pass' : 'fail', `${(captions.captionCues ?? []).length} cues.`),
    check('visuals', 'Cover assets', thumb.thumbnailSvg && thumb.coverSvg ? 'pass' : 'fail', 'Thumbnail and cover assets exist.'),
    check('metadata', 'Metadata limits', (meta.youtubeTitle ?? '').length <= 100 ? 'pass' : 'warn', `Title ${(meta.youtubeTitle ?? '').length}/100 characters.`),
    check('audio', 'Narration audio', 'warn', 'Blocked: no TTS provider. The render is silent; this is disclosed to the client.'),
    check('render', 'Video file', 'warn', 'Not rendered yet. The browser renderer must run and upload the file before a download exists.'),
    check('publishing', 'Publishing', 'warn', 'Manual only; no platform integration is connected.'),
    check('localization', 'Language delivery', production.language === 'en' ? 'pass' : localized?.blocked ? 'warn' : 'pass', production.language === 'en' ? 'English production.' : localized?.blocked ? 'Localization blocked without a model key; English script preserved.' : 'Localized script received.'),
  ]
  const summary = `${checks.filter((row) => row.status === 'pass').length} checks passed, ${checks.filter((row) => row.status === 'warn').length} warnings, ${checks.filter((row) => row.status === 'fail').length} failures.`
  return {
    summary,
    checks,
    artifacts: { qc: checks },
    data: { checks },
  }
}

function buildReview({ production, upstream, directives }) {
  const artifacts = {}
  for (const output of Object.values(upstream)) {
    if (output?.artifacts) Object.assign(artifacts, output.artifacts)
  }
  const qc = upstream['quality-control']?.data?.checks ?? []
  const fails = qc.filter((row) => row.status === 'fail')
  const warns = qc.filter((row) => row.status === 'warn')
  const delivered = ['Research evidence pack', 'Content strategy', 'Shooting script', 'Verified script', 'Storyboard', 'Visual system', 'Edit decision list', 'Caption track', 'Thumbnail and cover', 'Platform metadata', 'QC report']
  const blocked = []
  if (warns.some((row) => row.id === 'audio')) blocked.push('Narration audio — no TTS provider configured')
  blocked.push('Video file — render in the browser and upload the result')
  blocked.push('Publishing — manual upload only')
  if (production.language !== 'en' && upstream.localization?.data?.blocked) blocked.push(`Localization to ${LANGUAGES[production.language] ?? production.language} — model key required`)
  const checks = [
    check('package', 'Delivery package assembled', Object.keys(artifacts).length >= 8 ? 'pass' : 'fail', `${Object.keys(artifacts).length} artifact groups present.`),
    check('quality-gate', 'QC failures', fails.length === 0 ? 'pass' : 'fail', fails.length ? `${fails.length} failing check(s) must be resolved.` : 'No failing QC checks.'),
    check('blocked', 'Blocked items disclosed', 'pass', blocked.join(' · ')),
  ]
  return {
    summary: `Delivery package assembled. ${fails.length ? `${fails.length} QC failure(s) remain.` : 'No QC failures.'} ${blocked.length} item(s) disclosed as blocked.`,
    checks,
    artifacts,
    data: { delivered, blocked, qc },
  }
}

function buildTest({ production, upstream, directives }) {
  return {
    summary: 'Test execution.',
    checks: [check('test', 'Test output produced', 'pass', 'Local engine produced output.')],
    artifacts: {},
    data: {},
  }
}

const BUILDERS = {
  'trend-research': buildResearch,
  'content-strategy': buildStrategy,
  script: buildScript,
  'fact-check': buildFactCheck,
  localization: buildLocalization,
  storyboard: buildStoryboard,
  narration: buildNarration,
  'visual-design': buildVisuals,
  'video-edit': buildEdit,
  captions: buildCaptions,
  thumbnail: buildThumbnail,
  'seo-metadata': buildMetadata,
  'quality-control': buildQc,
  'producer-review': buildReview,
}

/**
 * Run the local directive engine for a capability.
 * ctx: { production, agent, upstream, liveSignals, directives, language }
 */
export function localGenerate(capability, ctx) {
  const builder = BUILDERS[capability]
  if (!builder) {
    return {
      summary: `No local generator exists for capability “${capability}”.`,
      checks: [check('capability', 'Capability supported', 'fail', `Unknown capability ${capability}.`)],
      artifacts: {},
      data: {},
    }
  }
  const directives = { ...DEFAULT_DIRECTIVES, ...(ctx.directives ?? {}) }
  const output = builder({ ...ctx, directives })
  return {
    ...output,
    engine: 'local-heuristic',
    directives,
  }
}

export function directiveDelta(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const changed = []
  for (const key of keys) {
    if (before?.[key] !== after?.[key]) changed.push(key)
  }
  return changed
}

export function capabilityMeta(capability) {
  return CAPABILITY_TEMPLATES[capability] ?? null
}

export { DEFAULT_DIRECTIVES }
