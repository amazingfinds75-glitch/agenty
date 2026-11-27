// Specialist capability library. The Workforce Manager reads this to decide
// which agents a production needs, and the Agent Factory instantiates any
// capability that has no active agent yet.

export const PLATFORMS = {
  'instagram-reel': {
    label: 'Instagram Reel',
    format: 'Vertical 9:16 reel',
    defaultDurationSec: 30,
    width: 720,
    height: 1280,
    scenes: 6,
    aspect: '9:16',
  },
  'youtube-short': {
    label: 'YouTube Short',
    format: 'Vertical 9:16 short',
    defaultDurationSec: 45,
    width: 720,
    height: 1280,
    scenes: 7,
    aspect: '9:16',
  },
  'youtube-long': {
    label: 'YouTube long-form',
    format: 'Landscape 16:9 explainer',
    defaultDurationSec: 480,
    width: 1280,
    height: 720,
    scenes: 10,
    aspect: '16:9',
  },
}

export const LANGUAGES = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
  kn: 'Kannada',
}

export const DEFAULT_DIRECTIVES = {
  hooks: 3,
  sceneMaxSec: 8,
  minWordsPerMin: 120,
  requireCta: true,
  labelUnverified: true,
  strictJson: true,
}

// capability -> agent definition template + task wiring.
export const CAPABILITY_TEMPLATES = {
  'trend-research': {
    role: 'Trend Research Agent',
    title: 'Research live signals and sources',
    short: 'Research',
    icon: 'radar',
    hue: 'sky',
    dependsOn: [],
    produces: 'Evidence pack',
    tools: ['live-trends', 'keyword-match', 'source-ledger'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the research specialist for a short-form video studio. You receive the production brief and live public-feed signals collected by the backend. Select only evidence that actually appears in those signals. Never invent sources, urls, statistics or quotes. Return strict JSON: {"summary": string, "items": [{"source": string, "title": string, "url": string, "note": string, "relevance": 0-100}]}. If no signal matches the topic, say so in the summary and return an empty items array.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'content-strategy': {
    role: 'Content Strategist',
    title: 'Define audience, angle and retention plan',
    short: 'Strategy',
    icon: 'compass',
    hue: 'violet',
    dependsOn: ['trend-research'],
    produces: 'Content brief',
    tools: ['audience-model', 'evidence-pack', 'retention-planner'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the content strategist. Using only the brief and the research evidence pack, choose one editorial angle, name the target audience, and describe the retention structure. Do not invent audience statistics. Return strict JSON: {"angle": string, "audience": string, "format": string, "retention": string, "cta": string, "risks": string[]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  script: {
    role: 'Scriptwriter',
    title: 'Write hook, narrative beats and narration',
    short: 'Script',
    icon: 'pen',
    hue: 'fuchsia',
    dependsOn: ['content-strategy'],
    produces: 'Shooting script',
    tools: ['hook-writer', 'scene-planner', 'word-budget'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the scriptwriter. Write a spoken script for the requested platform and runtime. The opening line must work as the first second of the video. Every scene needs narration, a visual description and a camera/shot note. Do not state statistics that are not in the evidence pack; if a claim needs checking, phrase it as a question or mark it [verify]. Respect the requested language. Return strict JSON: {"hook": string, "titles": string[], "cta": string, "scenes": [{"label": string, "narration": string, "visual": string, "shot": string, "mood": "calm"|"tense"|"bright"|"insight"}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'fact-check': {
    role: 'Fact Checker',
    title: 'Verify claims against the evidence pack',
    short: 'Facts',
    icon: 'shield',
    hue: 'emerald',
    dependsOn: ['script'],
    produces: 'Verified script',
    tools: ['claim-extractor', 'evidence-matcher', 'risk-flagger'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the fact checker. Extract every claim from the script that could be wrong (numbers, dates, superlatives, causal statements). For each, mark it verified only when the evidence pack explicitly supports it; otherwise mark it unverified and say what is missing. Return strict JSON: {"summary": string, "claims": [{"text": string, "status": "verified"|"unverified", "evidence": string}]}. Never mark a claim verified without matching evidence.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  localization: {
    role: 'Localization Agent',
    title: 'Localize the script for the target language',
    short: 'Localize',
    icon: 'search',
    hue: 'teal',
    dependsOn: ['fact-check'],
    produces: 'Localized script',
    tools: ['translation', 'terminology', 'cultural-review'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the localization specialist. Translate the spoken narration and on-screen text into the requested language while preserving meaning, timing and any [verify] markers. Do not add new claims. Return strict JSON: {"summary": string, "language": string, "hook": string, "titles": string[], "cta": string, "scenes": [{"narration": string, "visual": string}]}. If you cannot translate reliably, return the original text and state the limitation in summary.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  storyboard: {
    role: 'Storyboard Director',
    title: 'Plan shots and visual flow',
    short: 'Storyboard',
    icon: 'film',
    hue: 'indigo',
    dependsOn: ['script'],
    produces: 'Storyboard',
    tools: ['shot-planner', 'camera-language', 'transition-map'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the storyboard director. Turn the script into a shot-by-shot board: framing, camera movement, on-screen text and transition for each scene. Keep every shot achievable with generated graphics or stock b-roll; no impossible stunts. Return strict JSON: {"summary": string, "shots": [{"scene": number, "framing": string, "movement": string, "overlay": string, "transition": string}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  narration: {
    role: 'Voice Director',
    title: 'Prepare narration and audio plan',
    short: 'Voice',
    icon: 'voice',
    hue: 'amber',
    dependsOn: ['fact-check'],
    produces: 'Narration track',
    tools: ['voice-casting', 'pacing', 'audio-mix-plan'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the voice director. Prepare the final narration script with pacing marks and a voice casting note (tone, pace, accent). You cannot synthesize audio unless a TTS integration exists; state that limitation instead of claiming a track was produced. Return strict JSON: {"summary": string, "voice": string, "pace": string, "script": string, "audioStatus": "blocked"|"ready"}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'visual-design': {
    role: 'Visual Designer',
    title: 'Build the visual system and scene art direction',
    short: 'Visuals',
    icon: 'palette',
    hue: 'rose',
    dependsOn: ['storyboard'],
    produces: 'Visual assets',
    tools: ['palette-builder', 'scene-art', 'svg-assets'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the visual designer. Define a coherent palette and art direction for the production and write one concrete visual prompt per scene for the renderer. Stay away from text-heavy frames; captions carry the words. Return strict JSON: {"summary": string, "theme": {"from": string, "to": string, "accent": string}, "sceneArt": [{"scene": number, "prompt": string, "elements": string[]}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'video-edit': {
    role: 'Video Editor',
    title: 'Assemble the edit decision list',
    short: 'Edit',
    icon: 'scissors',
    hue: 'orange',
    dependsOn: ['narration', 'visual-design'],
    produces: 'Master cut plan',
    tools: ['timeline', 'transition-map', 'loudness-plan'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the video editor. Produce the edit decision list for the master cut: scene order, durations, transitions, caption style and audio bed. The browser renderer executes this plan; you do not claim a file exists before it is rendered. Return strict JSON: {"summary": string, "transitions": string[], "captionStyle": string, "audioBed": string, "timeline": [{"scene": number, "durationSec": number}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  captions: {
    role: 'Captioning Agent',
    title: 'Generate synchronized captions',
    short: 'Captions',
    icon: 'captions',
    hue: 'lime',
    dependsOn: ['video-edit'],
    produces: 'SRT + overlays',
    tools: ['srt-writer', 'line-breaker', 'readability'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the captioning specialist. Write synchronized captions from the scene timings. Each cue must fit on two short lines and stay on screen long enough to read. Return strict JSON: {"summary": string, "lines": [{"startSec": number, "endSec": number, "text": string}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  thumbnail: {
    role: 'Thumbnail Designer',
    title: 'Design thumbnail and reel cover',
    short: 'Cover',
    icon: 'thumbnail',
    hue: 'teal',
    dependsOn: ['fact-check'],
    produces: 'Thumbnail set',
    tools: ['layout', 'type-hierarchy', 'safe-area-check'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the thumbnail designer. Produce short cover text (max 6 words) and a visual concept for a click-worthy thumbnail and a vertical reel cover. Keep text inside safe areas and never promise something the script does not deliver. Return strict JSON: {"summary": string, "coverText": string, "concept": string, "accent": string}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'seo-metadata': {
    role: 'SEO & Publishing Agent',
    title: 'Prepare platform metadata',
    short: 'Metadata',
    icon: 'search',
    hue: 'cyan',
    dependsOn: ['fact-check'],
    produces: 'Publishing package',
    tools: ['title-optimizer', 'hashtags', 'description-writer'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are the publishing specialist. Write the YouTube title, description, tags and the Instagram caption and hashtags for this production. Do not use clickbait the video cannot support and do not add claims. Return strict JSON: {"summary": string, "youtubeTitle": string, "description": string, "tags": string[], "instagramCaption": string, "hashtags": string[]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'quality-control': {
    role: 'Quality Control Agent',
    title: 'Verify runtime, captions, claims and formats',
    short: 'QC',
    icon: 'qc',
    hue: 'slate',
    dependsOn: ['video-edit', 'captions', 'thumbnail', 'seo-metadata'],
    produces: 'QC report',
    tools: ['timeline-check', 'claim-audit', 'format-check'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: false },
    instructions:
      'You are quality control. Audit the assembled production: scene coverage against runtime, caption timing, unverified claims, missing audio, metadata length limits and platform format. Report pass, warn or fail per check with a concrete detail. Do not pass an item you did not verify. Return strict JSON: {"summary": string, "checks": [{"label": string, "status": "pass"|"warn"|"fail", "detail": string}]}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
  'producer-review': {
    role: 'Executive Producer',
    title: 'Assemble the delivery package',
    short: 'Review',
    icon: 'producer',
    hue: 'cyan',
    dependsOn: ['quality-control'],
    produces: 'Delivery package',
    tools: ['assembly', 'scorecard', 'delivery-manifest'],
    permissions: { canCallModel: true, canPublish: false, canRender: false, canApprove: true },
    instructions:
      'You are the executive producer. Assemble the final delivery package from the verified specialist outputs. Summarize what is delivered, what is blocked (for example narration without a TTS provider, video not yet rendered), and the measured quality score. Never claim a file or integration works when the record does not show it. Return strict JSON: {"summary": string, "delivered": string[], "blocked": string[], "next": string}.',
    directives: { ...DEFAULT_DIRECTIVES },
  },
}

export const CAPABILITY_ORDER = [
  'trend-research',
  'content-strategy',
  'script',
  'fact-check',
  'localization',
  'storyboard',
  'narration',
  'visual-design',
  'video-edit',
  'captions',
  'thumbnail',
  'seo-metadata',
  'quality-control',
  'producer-review',
]

export function capabilitiesForProduction(platform, language) {
  const list = CAPABILITY_ORDER.filter((capability) => capability !== 'localization')
  if (language && language !== 'en') {
    list.splice(list.indexOf('fact-check') + 1, 0, 'localization')
  }
  return list
}

// Dependency resolution uses capability names; localization replaces fact-check
// as the upstream of narration when present.
export function dependenciesFor(capability, language) {
  const template = CAPABILITY_TEMPLATES[capability]
  if (!template) return []
  if (capability === 'narration' && language && language !== 'en') return ['localization']
  return [...template.dependsOn]
}
