import type { Artifacts, Language, Platform, QCItem, ResearchItem, Scene } from './types'
import { LANGUAGE_LABELS, mulberry32, pick } from './utils'

interface TopicInfo {
  label: string
  category: string
  insight: string
  stakes: string
  example: string
  risk: string
  accent: string
  theme: { from: string; to: string; accent: string }
  match: RegExp
}

const TOPICS: TopicInfo[] = [
  {
    label: 'AI agents',
    category: 'Agentic AI',
    insight:
      'agents are moving from answering questions to finishing multi-step work on their own',
    stakes: 'the distance between a demo and a dependable teammate',
    example: 'a research task that used to take a team a week now running overnight',
    risk: 'reliability, not intelligence, is the bottleneck',
    accent: '#00D4FF',
    theme: { from: '#052E3F', to: '#151033', accent: '#00D4FF' },
    match: /agent|autonomous|workflow|assistant/i,
  },
  {
    label: 'AI video',
    category: 'Generative Video',
    insight: 'generated video is quietly crossing the line where audiences stop noticing',
    stakes: 'trust, disclosure and what “real footage” even means',
    example: 'a thirty-second spot storyboarded, animated and cut before the coffee is cold',
    risk: 'the uncanny details still break under close inspection',
    accent: '#8B5CF6',
    theme: { from: '#1B1036', to: '#3B0F2B', accent: '#8B5CF6' },
    match: /video generat|generative video|\bveo\b|\bsora\b|text.to.video/i,
  },
  {
    label: 'on-device AI',
    category: 'Edge Computing',
    insight: 'models are getting small enough to run without ever touching a server',
    stakes: 'privacy, latency and who owns the intelligence on your device',
    example: 'a phone finishing complex tasks with the network switched off',
    risk: 'thermal limits and battery budgets are the real ceiling',
    accent: '#34D399',
    theme: { from: '#04291F', to: '#0B2430', accent: '#34D399' },
    match: /on.device|edge ai|\bchip\b|local model|offline/i,
  },
  {
    label: 'open-source models',
    category: 'Open Models',
    insight: 'open weights keep closing the gap on frontier quality at a fraction of the cost',
    stakes: 'control, lock-in and the economics of running your own stack',
    example: 'a two-person team fine-tuning a model on a single workstation',
    risk: 'evaluation and safety tooling lag behind the release cadence',
    accent: '#FBBF24',
    theme: { from: '#2B1F06', to: '#0C2320', accent: '#FBBF24' },
    match: /open.source|\bslm\b|small language|llama|mistral|weights/i,
  },
  {
    label: 'AI in healthcare',
    category: 'Applied AI',
    insight: 'diagnostic models are moving from pilot studies into routine clinical workflows',
    stakes: 'accountability on the day the model is confidently wrong',
    example: 'a scan reviewed by a model before a specialist ever sees it',
    risk: 'regulation moves slower than the products do',
    accent: '#38BDF8',
    theme: { from: '#062235', to: '#0B2A24', accent: '#38BDF8' },
    match: /health|medical|doctor|diagnos|drug discovery|clinic/i,
  },
  {
    label: 'humanoid robotics',
    category: 'Robotics',
    insight: 'robots are learning physical tasks by watching people instead of being coded',
    stakes: 'safety rules and the economics of replacement',
    example: 'a warehouse shift where the newest hire never sleeps',
    risk: 'the last ten percent of dexterity is the hardest part',
    accent: '#FB7185',
    theme: { from: '#2C0B15', to: '#0C1B2E', accent: '#FB7185' },
    match: /robot|humanoid|figure ai|embodied/i,
  },
  {
    label: 'quantum computing',
    category: 'Deep Tech',
    insight: 'error correction is starting to look like an engineering problem, not a physics fantasy',
    stakes: 'cryptography, drug discovery and the decade ahead',
    example: 'a chemistry simulation that would take a supercomputer centuries',
    risk: 'useful scale is still years out, and vendors love to blur that',
    accent: '#818CF8',
    theme: { from: '#141033', to: '#0B2530', accent: '#818CF8' },
    match: /quantum/i,
  },
  {
    label: 'this week in AI',
    category: 'AI Trends',
    insight: 'the biggest shift is happening in the boring middle of the stack',
    stakes: 'what it quietly changes for normal work',
    example: 'the tools people already use getting measurably better overnight',
    risk: 'almost everything announced is a preview, not a product',
    accent: '#00D4FF',
    theme: { from: '#04252F', to: '#160F31', accent: '#00D4FF' },
    match: /trend|ai|technology|tech|future/i,
  },
]

const HOOKS = [
  (t: TopicInfo) =>
    `Everyone is talking about ${t.label}. Almost nobody explains what it actually changes.`,
  (t: TopicInfo) =>
    `${titleCase(t.label)} just crossed a line most people missed — and the part that matters isn't the demo.`,
  (t: TopicInfo) =>
    `In the next forty seconds, you'll understand ${t.label} better than most people will this year.`,
  (t: TopicInfo) =>
    `The loudest story about ${t.label} is the wrong one. Here's the version that survives contact with reality.`,
]

const CONTEXT = [
  (t: TopicInfo) =>
    `Here's what actually happened: ${t.insight}. It sounds incremental, until you look at where it lands.`,
  (t: TopicInfo) =>
    `Most coverage focuses on the announcement. The real shift is simpler — ${t.insight}.`,
]

const EVIDENCE = [
  (t: TopicInfo) =>
    `The interesting part isn't the launch. It's ${t.example}. That's when a technology stops being a story and starts being infrastructure.`,
  (t: TopicInfo) =>
    `Look past the headlines and the pattern is consistent: ${t.example}. The tool disappears into the work.`,
]

const RISK = [
  (t: TopicInfo) =>
    `That doesn't mean it's finished. ${titleCase(t.stakes)} is still the hard part, and the people closest to the work know it.`,
  (t: TopicInfo) =>
    `The catch? ${titleCase(t.risk)}. Ignore that, and the excitement gets expensive fast.`,
]

const MEANING = [
  () =>
    `So what changes for you? Less time waiting, more time deciding. The skill that matters now isn't using the tool — it's knowing what to ask for, and checking what comes back.`,
  () =>
    `For creators and small teams, the advantage is no longer access. It's taste, judgment, and the discipline to verify before you publish.`,
]

const CTA = [
  () => `Follow the studio for the next signal — and save this before the feed moves on.`,
  () => `We track this every week. Follow along, and tell us what you want broken down next.`,
]

const LONG_EXTRA = [
  (t: TopicInfo) =>
    `Zoom out and the pattern repeats across the industry: capability improves in steps, but adoption moves in waves when the cost of being wrong drops.`,
  (t: TopicInfo) =>
    `There's a second-order effect too. When everyone can produce at this level, distribution and trust become the scarce resources — not raw output.`,
]

const TITLE_PATTERNS = [
  (t: TopicInfo) => `The Quiet Shift Behind ${titleCase(t.label)}`,
  (t: TopicInfo) => `${titleCase(t.label)}: What Changes Next`,
  (t: TopicInfo) => `Why ${titleCase(t.label)} Suddenly Matters`,
  (t: TopicInfo) => `Inside ${titleCase(t.label)} — Without the Hype`,
  (t: TopicInfo) => `${titleCase(t.label)} Is Moving Faster Than You Think`,
]

const SCENE_META: Array<{
  label: string
  visual: string
  shot: string
  mood: Scene['mood']
}> = [
  {
    label: 'Hook',
    visual: 'Cold open · slow orbit around the AI core, kinetic type',
    shot: '0–3s · punch-in on the first word',
    mood: 'tense',
  },
  {
    label: 'Context',
    visual: 'Archive-style b-roll · glass UI montage',
    shot: 'Handheld drift · layered depth',
    mood: 'calm',
  },
  {
    label: 'Evidence',
    visual: '3D diagram · nodes connecting across the workspace',
    shot: 'Slow dolly · focus pull',
    mood: 'insight',
  },
  {
    label: 'The catch',
    visual: 'Split screen · risk versus reward, desaturated palette',
    shot: 'Hard cuts on the beat',
    mood: 'tense',
  },
  {
    label: 'What it means',
    visual: 'Creator desk · captured screen, natural light',
    shot: 'Gentle push-in · captions emphasized',
    mood: 'bright',
  },
  {
    label: 'Close',
    visual: 'End card · studio mark, follow prompt',
    shot: 'Locked frame · logo reveal',
    mood: 'bright',
  },
]

export function titleCase(text: string) {
  return text
    .split(' ')
    .map((w) => (w.length > 2 && w !== 'AI' && w !== 'The' ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function detectLanguage(text: string): Language | null {
  const t = text.toLowerCase()
  if (/telugu|\bte\b/.test(t)) return 'te'
  if (/hindi|\bhi\b/.test(t)) return 'hi'
  if (/tamil|\bta\b/.test(t)) return 'ta'
  if (/kannada|\bkn\b/.test(t)) return 'kn'
  if (/english/.test(t)) return 'en'
  return null
}

export function detectPlatform(text: string): Platform | null {
  const t = text.toLowerCase()
  if (/instagram|\breel\b|\breels\b/.test(t)) return 'instagram-reel'
  if (/youtube long|long.form|documentary|explainer|tutorial/.test(t)) return 'youtube-long'
  if (/short|shorts/.test(t)) return 'youtube-short'
  return null
}

export function formatFor(platform: Platform) {
  switch (platform) {
    case 'instagram-reel':
      return { format: 'Instagram Reel · 9:16', aspect: '9:16' as const, targetSec: 42 }
    case 'youtube-long':
      return { format: 'YouTube long-form · 16:9', aspect: '16:9' as const, targetSec: 190 }
    default:
      return { format: 'YouTube Short · 9:16', aspect: '9:16' as const, targetSec: 48 }
  }
}

export function resolveTopic(prompt: string): TopicInfo {
  const found = TOPICS.find((t) => t.match.test(prompt))
  return found ?? TOPICS[TOPICS.length - 1]
}

export function projectTitle(prompt: string, platform: Platform, language: Language) {
  const topic = resolveTopic(prompt)
  const label = titleCase(topic.label)
  const lang = language === 'en' ? '' : `${LANGUAGE_LABELS[language]} `
  const format =
    platform === 'instagram-reel'
      ? 'Reel'
      : platform === 'youtube-long'
        ? 'Long-form'
        : 'Short'
  return `${label} · ${lang}${format}`
}

export function shortScriptName(artifacts: Artifacts) {
  return artifacts.title
}

function srtTime(seconds: number) {
  const ms = Math.round((seconds % 1) * 1000)
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function chunkNarration(text: string, maxWords = 13) {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current: string[] = []
  for (const word of words) {
    current.push(word)
    if (current.length >= maxWords && /[.,?!]$/.test(word)) {
      chunks.push(current.join(' '))
      current = []
    }
  }
  if (current.length) {
    if (chunks.length && current.length < 5) {
      chunks[chunks.length - 1] += ` ${current.join(' ')}`
    } else {
      chunks.push(current.join(' '))
    }
  }
  return chunks.length ? chunks : [text]
}

export function buildSrt(scenes: Scene[]) {
  const cues: string[] = []
  let index = 1
  for (const scene of scenes) {
    const chunks = chunkNarration(scene.narration)
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    let cursor = scene.startSec
    const sceneDuration = scene.endSec - scene.startSec
    for (const chunk of chunks) {
      const share = (chunk.length / totalChars) * sceneDuration
      const start = cursor
      const end = Math.min(scene.endSec, cursor + share)
      cues.push(`${index}\n${srtTime(start)} --> ${srtTime(end)}\n${chunk}\n`)
      cursor = end
      index += 1
    }
  }
  return cues.join('\n')
}

interface BuildArgs {
  prompt: string
  platform: Platform
  language: Language
  seed: number
  tone?: string
}

export function buildArtifacts({ prompt, platform, language, seed, tone }: BuildArgs): Artifacts {
  const topic = resolveTopic(prompt)
  const rand = mulberry32(seed + (tone?.length ?? 0) * 7)
  const isLong = platform === 'youtube-long'
  const hook = pick(rand, HOOKS)(topic)
  const titlePatterns = [...TITLE_PATTERNS].sort(() => rand() - 0.5)
  const titles = titlePatterns.slice(0, 3).map((fn) => fn(topic))
  const title = titles[0]

  const narrations = [
    hook,
    pick(rand, CONTEXT)(topic),
    pick(rand, EVIDENCE)(topic),
    pick(rand, RISK)(topic),
    isLong ? `${pick(rand, MEANING)()} ${pick(rand, LONG_EXTRA)(topic)}` : pick(rand, MEANING)(),
    pick(rand, CTA)(),
  ]

  const scenes: Scene[] = SCENE_META.map((meta, i) => {
    const narration = narrations[i]
    const words = narration.split(/\s+/).length
    const targetSec = isLong ? 24 : 6.5
    const duration = Math.max(3.4, Math.min(targetSec, words / 2.6 + 1.2))
    return {
      id: `scene-${i + 1}`,
      label: meta.label,
      startSec: 0,
      endSec: duration,
      narration,
      visual: meta.visual,
      shot: meta.shot,
      mood: meta.mood,
    }
  })

  if (isLong) {
    const half = Math.ceil(scenes.length / 2)
    scenes.splice(half, 0, {
      id: 'scene-deep',
      label: 'Deep dive',
      startSec: 0,
      endSec: 30,
      narration: `Here's the part that doesn't fit in a headline: ${topic.insight}. The teams getting value aren't waiting for perfect. They're redesigning the workflow around what the model already does well, and keeping a human on the decisions that matter.`,
      visual: 'Annotated walkthrough · product frames over a muted diagram',
      shot: 'Measured cut · hold on data',
      mood: 'insight',
    })
  }

  let cursor = 0
  for (const scene of scenes) {
    const duration = Math.max(3.4, scene.endSec)
    scene.startSec = cursor
    scene.endSec = cursor + duration
    cursor = scene.endSec
  }
  const durationSec = Math.round(cursor)

  const chapters = scenes.map((s) => {
    const mins = Math.floor(s.startSec / 60)
    const secs = Math.round(s.startSec % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ${s.label}`
  })

  const research: ResearchItem[] = [
    {
      id: 'r1',
      source: 'Studio Signal Feed',
      title: `${titleCase(topic.label)} — momentum brief`,
      url: 'demo://signal/momentum',
      note: 'Illustrative signal bundled with this demo build. Not a live source.',
      relevance: 92,
    },
    {
      id: 'r2',
      source: 'Sample Analyst Note',
      title: `Where ${topic.label} actually gets used`,
      url: 'demo://analysis/usage',
      note: 'Synthetic analyst summary used to demonstrate the research step.',
      relevance: 86,
    },
    {
      id: 'r3',
      source: 'Community Digest',
      title: `Practitioner questions about ${topic.label}`,
      url: 'demo://community/digest',
      note: 'Synthetic community digest — shows how audience objections get captured.',
      relevance: 78,
    },
    {
      id: 'r4',
      source: 'Studio Research Brief',
      title: `Risk review: ${topic.stakes}`,
      url: 'demo://research/risk',
      note: 'Demo risk checklist used by the fact-check stage.',
      relevance: 74,
    },
  ]

  const qc: QCItem[] = [
    { id: 'q1', label: 'Video format', status: 'pass', detail: `${formatFor(platform).aspect} master · 30 fps target` },
    { id: 'q2', label: 'Audio levels', status: 'pass', detail: 'Narration track mixed · browser voice preview available' },
    { id: 'q3', label: 'Captions', status: 'pass', detail: `${buildSrt(scenes).split('\n\n').length} cues synchronized` },
    { id: 'q4', label: 'Facts', status: 'warn', detail: 'Demo copy with illustrative sources — verify before publishing' },
    { id: 'q5', label: 'Brand consistency', status: 'pass', detail: 'Palette, type and safe areas match the studio system' },
    { id: 'q6', label: 'Localization', status: language === 'en' ? 'pass' : 'warn', detail: language === 'en' ? 'English copy and captions aligned' : `${LANGUAGE_LABELS[language]} selected — copy stays English in demo, preview uses browser voice` },
    { id: 'q7', label: 'Platform compliance', status: 'pass', detail: platform === 'youtube-long' ? '16:9 · chapter markers prepared' : '9:16 · safe zones respected' },
  ]

  const hashtags = [
    '#AI',
    '#TechTrends',
    '#ArtificialIntelligence',
    '#AIViralStudio',
    platform === 'instagram-reel' ? '#ReelsIndia' : '#Shorts',
    topic.label.includes('agent') ? '#AIAgents' : '#FutureTech',
  ]

  const youtubeTags = [
    'ai',
    'ai trends',
    topic.label,
    'technology explained',
    platform === 'youtube-long' ? 'documentary' : 'shorts',
    'ai news',
    'future of work',
    'aiviralstudio',
  ]

  const description = [
    `${hook}`,
    '',
    `In this ${platform === 'youtube-long' ? 'breakdown' : 'short'}, we explain why ${topic.label} matters now: ${topic.insight}. We look at ${topic.stakes} — and what it means for creators, teams and anyone paying attention.`,
    '',
    platform === 'youtube-long' ? 'Chapters:' : 'Chapters (for description):',
    ...chapters,
    '',
    'Sources in this demo build are illustrative (demo:// links). Verify before publishing.',
    '',
    'Produced with AI Viral Studio — one prompt, one AI team.',
  ].join('\n')

  const instagramCaption = [
    `${titleCase(topic.label)} isn't a hype cycle anymore. It's infrastructure.`,
    '',
    `The part most people miss: ${topic.insight}.`,
    '',
    `Save this if you're building with AI this year. Follow for the next signal.`,
  ].join('\n')

  return {
    title,
    hook,
    scenes,
    description,
    youtubeTitle: title.slice(0, 70),
    youtubeTags,
    instagramCaption,
    hashtags,
    research,
    qc,
    srt: buildSrt(scenes),
    wordCount: scenes.reduce((sum, s) => sum + s.narration.split(/\s+/).length, 0),
    durationSec,
    theme: topic.theme,
    language,
    languageLabel: LANGUAGE_LABELS[language],
    demoCopy: true,
    titleOptions: titles,
  }
}

export const PROMPT_SUGGESTIONS = [
  {
    id: 's1',
    icon: 'trend',
    label: "Find today's trending topics",
    prompt: "Find today's trending AI technology topics and tell me which are worth covering.",
  },
  {
    id: 's2',
    icon: 'reel',
    label: 'Create a Telugu Instagram Reel',
    prompt:
      'Create a Telugu Instagram Reel explaining the most interesting AI technology trend this week.',
  },
  {
    id: 's3',
    icon: 'film',
    label: 'Make a technology documentary',
    prompt:
      'Make a technology documentary about how AI agents are changing the way teams work.',
  },
  {
    id: 's4',
    icon: 'short',
    label: 'Generate a YouTube Short',
    prompt:
      'Generate a YouTube Short about on-device AI and why it matters for privacy.',
  },
  {
    id: 's5',
    icon: 'calendar',
    label: 'Build my weekly content plan',
    prompt: 'Build my weekly content plan for YouTube Shorts and Instagram Reels.',
  },
  {
    id: 's6',
    icon: 'microscope',
    label: 'Research viral educational content',
    prompt:
      'Research viral educational content formats and create a YouTube Short with the strongest angle.',
  },
]

export function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Untitled brief'
  return trimmed.length > 52 ? `${trimmed.slice(0, 52).trim()}…` : trimmed
}
