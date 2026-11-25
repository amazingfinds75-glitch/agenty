import type { AgentDef } from './types'

export const EXECUTIVE_PRODUCER: AgentDef = {
  id: 'executive-producer',
  name: 'Executive Producer',
  shortName: 'Producer',
  role: 'Orchestration',
  description:
    'Understands your intent, builds the production plan, assigns specialists and validates every deliverable before it reaches you.',
  icon: 'producer',
  hue: 'cyan',
  isProducer: true,
  skills: ['Intent parsing', 'Planning', 'Task routing', 'Dependency management', 'Final review'],
}

export const AGENTS: AgentDef[] = [
  {
    id: 'trend-research',
    name: 'Trend Research Agent',
    shortName: 'Research',
    role: 'Signals & discovery',
    description:
      'Scans news, platforms and communities for rising topics, then scores each one for relevance, momentum and audience fit.',
    icon: 'radar',
    hue: 'sky',
    skills: ['Trend scanning', 'Source credibility', 'Momentum scoring', 'Topic clustering'],
  },
  {
    id: 'content-strategist',
    name: 'Content Strategist',
    shortName: 'Strategy',
    role: 'Audience & positioning',
    description:
      'Defines the audience, angle, format and platform strategy. Builds the content brief every other agent works from.',
    icon: 'compass',
    hue: 'violet',
    skills: ['Audience analysis', 'Competitor review', 'Format selection', 'Content briefs'],
  },
  {
    id: 'scriptwriter',
    name: 'Scriptwriter',
    shortName: 'Script',
    role: 'Story & copy',
    description:
      'Writes the hook, narrative structure, narration and calls to action — tuned for retention on each platform.',
    icon: 'pen',
    hue: 'fuchsia',
    skills: ['Hooks', 'Narrative structure', 'Narration', 'CTAs'],
  },
  {
    id: 'fact-checker',
    name: 'Fact Checker',
    shortName: 'Facts',
    role: 'Accuracy',
    description:
      'Verifies claims, dates, statistics and quotes against sources. Flags anything that cannot be substantiated.',
    icon: 'shield',
    hue: 'emerald',
    skills: ['Claim verification', 'Source matching', 'Statistic review', 'Risk flagging'],
  },
  {
    id: 'voice-director',
    name: 'Voice Director',
    shortName: 'Voice',
    role: 'Narration & audio',
    description:
      'Selects voices, sets pronunciation and pacing, and directs multilingual narration and audio mixing.',
    icon: 'voice',
    hue: 'amber',
    skills: ['Voice casting', 'Multilingual pacing', 'Pronunciation', 'Audio mixing'],
  },
  {
    id: 'video-director',
    name: 'Video Director',
    shortName: 'Direction',
    role: 'Visual storytelling',
    description:
      'Plans scenes, camera language, motion and transitions so the edit carries the story instead of decorating it.',
    icon: 'film',
    hue: 'indigo',
    skills: ['Shot planning', 'Camera language', 'Transitions', 'Storyboard'],
  },
  {
    id: 'visual-designer',
    name: 'Visual Designer',
    shortName: 'Visuals',
    role: 'Design & assets',
    description:
      'Creates illustrations, motion graphics, background systems and visual assets that match the production brief.',
    icon: 'palette',
    hue: 'rose',
    skills: ['Key art', 'Motion graphics', 'Asset systems', 'Brand alignment'],
  },
  {
    id: 'video-editor',
    name: 'Video Editor',
    shortName: 'Editor',
    role: 'Assembly & finish',
    description:
      'Assembles scenes, narration, music, captions and effects into a finished cut with broadcast-safe levels.',
    icon: 'scissors',
    hue: 'orange',
    skills: ['Assembly cut', 'Timing', 'Sound design', 'Color & finish'],
  },
  {
    id: 'captioning',
    name: 'Captioning Agent',
    shortName: 'Captions',
    role: 'Subtitles & overlays',
    description:
      'Generates synchronized subtitles and on-screen text overlays, including translated caption tracks.',
    icon: 'captions',
    hue: 'lime',
    skills: ['Synchronized SRT', 'Text overlays', 'Caption translation', 'Readability'],
  },
  {
    id: 'thumbnail-designer',
    name: 'Thumbnail Designer',
    shortName: 'Cover',
    role: 'Covers & thumbnails',
    description:
      'Creates click-worthy YouTube thumbnails and Instagram covers with clear focal hierarchy and readable type.',
    icon: 'thumbnail',
    hue: 'teal',
    skills: ['Thumbnail layout', 'Type hierarchy', 'Cover variants', 'Safe-area checks'],
  },
  {
    id: 'seo-publishing',
    name: 'SEO & Publishing Agent',
    shortName: 'Publishing',
    role: 'Metadata & reach',
    description:
      'Prepares titles, descriptions, hashtags and keywords, and formats each platform’s metadata package.',
    icon: 'search',
    hue: 'cyan',
    skills: ['Titles & descriptions', 'Keyword research', 'Hashtags', 'Platform metadata'],
  },
  {
    id: 'quality-control',
    name: 'Quality Control Agent',
    shortName: 'QC',
    role: 'Verification',
    description:
      'Runs the final pass — video, audio, captions, facts, brand consistency and platform format compliance.',
    icon: 'qc',
    hue: 'slate',
    skills: ['Playback review', 'Loudness checks', 'Fact integrity', 'Format compliance'],
  },
]

export const ALL_AGENTS: AgentDef[] = [EXECUTIVE_PRODUCER, ...AGENTS]

export const AGENT_MAP: Record<string, AgentDef> = Object.fromEntries(
  ALL_AGENTS.map((a) => [a.id, a]),
)

export const HUE_STYLES: Record<
  string,
  { text: string; tileA: string; tileB: string; ring: string; dot: string; soft: string }
> = {
  cyan: {
    text: 'text-cyan',
    tileA: 'rgba(0,212,255,0.28)',
    tileB: 'rgba(2,64,96,0.9)',
    ring: 'rgba(0,212,255,0.4)',
    dot: '#00D4FF',
    soft: 'bg-cyan/10',
  },
  violet: {
    text: 'text-violet',
    tileA: 'rgba(139,92,246,0.32)',
    tileB: 'rgba(46,26,84,0.92)',
    ring: 'rgba(139,92,246,0.42)',
    dot: '#8B5CF6',
    soft: 'bg-violet/10',
  },
  emerald: {
    text: 'text-emerald-300',
    tileA: 'rgba(52,211,153,0.26)',
    tileB: 'rgba(6,58,46,0.92)',
    ring: 'rgba(52,211,153,0.4)',
    dot: '#34D399',
    soft: 'bg-emerald-400/10',
  },
  amber: {
    text: 'text-amber-300',
    tileA: 'rgba(251,191,36,0.26)',
    tileB: 'rgba(66,44,8,0.92)',
    ring: 'rgba(251,191,36,0.4)',
    dot: '#FBBF24',
    soft: 'bg-amber-400/10',
  },
  rose: {
    text: 'text-rose-300',
    tileA: 'rgba(251,113,133,0.26)',
    tileB: 'rgba(72,16,32,0.92)',
    ring: 'rgba(251,113,133,0.4)',
    dot: '#FB7185',
    soft: 'bg-rose-400/10',
  },
  sky: {
    text: 'text-sky-300',
    tileA: 'rgba(56,189,248,0.26)',
    tileB: 'rgba(7,44,72,0.92)',
    ring: 'rgba(56,189,248,0.4)',
    dot: '#38BDF8',
    soft: 'bg-sky-400/10',
  },
  lime: {
    text: 'text-lime-300',
    tileA: 'rgba(163,230,53,0.22)',
    tileB: 'rgba(38,58,10,0.92)',
    ring: 'rgba(163,230,53,0.36)',
    dot: '#A3E635',
    soft: 'bg-lime-400/10',
  },
  fuchsia: {
    text: 'text-fuchsia-300',
    tileA: 'rgba(232,121,249,0.26)',
    tileB: 'rgba(64,20,74,0.92)',
    ring: 'rgba(232,121,249,0.4)',
    dot: '#E879F9',
    soft: 'bg-fuchsia-400/10',
  },
  orange: {
    text: 'text-orange-300',
    tileA: 'rgba(251,146,60,0.26)',
    tileB: 'rgba(66,30,8,0.92)',
    ring: 'rgba(251,146,60,0.4)',
    dot: '#FB923C',
    soft: 'bg-orange-400/10',
  },
  teal: {
    text: 'text-teal-300',
    tileA: 'rgba(45,212,191,0.26)',
    tileB: 'rgba(6,52,48,0.92)',
    ring: 'rgba(45,212,191,0.4)',
    dot: '#2DD4BF',
    soft: 'bg-teal-400/10',
  },
  indigo: {
    text: 'text-indigo-300',
    tileA: 'rgba(129,140,248,0.28)',
    tileB: 'rgba(28,32,82,0.92)',
    ring: 'rgba(129,140,248,0.4)',
    dot: '#818CF8',
    soft: 'bg-indigo-400/10',
  },
  slate: {
    text: 'text-slate-300',
    tileA: 'rgba(148,163,184,0.24)',
    tileB: 'rgba(28,38,52,0.92)',
    ring: 'rgba(148,163,184,0.36)',
    dot: '#94A3B8',
    soft: 'bg-slate-400/10',
  },
}
