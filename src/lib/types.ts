export type Platform = 'youtube-short' | 'youtube-long' | 'instagram-reel'

export type Language = 'en' | 'te' | 'hi' | 'ta' | 'kn'

export type ProjectStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type StageStatus = 'pending' | 'working' | 'waiting' | 'completed' | 'failed'

export type AgentStatus = 'idle' | 'queued' | 'working' | 'waiting' | 'completed' | 'failed'

export type AgentIconKey =
  | 'radar'
  | 'compass'
  | 'pen'
  | 'shield'
  | 'voice'
  | 'film'
  | 'palette'
  | 'scissors'
  | 'captions'
  | 'thumbnail'
  | 'search'
  | 'qc'
  | 'producer'

export type AgentHue =
  | 'cyan'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'lime'
  | 'fuchsia'
  | 'orange'
  | 'teal'
  | 'indigo'
  | 'slate'

export interface AgentDef {
  id: string
  name: string
  shortName: string
  role: string
  description: string
  icon: AgentIconKey
  hue: AgentHue
  skills: string[]
  isProducer?: boolean
}

export interface StageDef {
  id: string
  index: number
  name: string
  short: string
  description: string
  agentIds: string[]
  durationMs: number
  produces: string
}

export interface StageState {
  id: string
  status: StageStatus
  progress: number
  startedAt?: string
  completedAt?: string
  note?: string
  error?: string
}

export interface Scene {
  id: string
  label: string
  startSec: number
  endSec: number
  narration: string
  visual: string
  shot: string
  mood: 'calm' | 'tense' | 'bright' | 'insight'
}

export interface ResearchItem {
  id: string
  source: string
  title: string
  url: string
  note: string
  relevance: number
}

export interface QCItem {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface Artifacts {
  title: string
  titleOptions: string[]
  hook: string
  scenes: Scene[]
  description: string
  youtubeTitle: string
  youtubeTags: string[]
  instagramCaption: string
  hashtags: string[]
  research: ResearchItem[]
  qc: QCItem[]
  srt: string
  wordCount: number
  durationSec: number
  thumbnailDataUrl?: string
  coverDataUrl?: string
  theme: { from: string; to: string; accent: string }
  language: Language
  languageLabel: string
  demoCopy: boolean
}

export interface Project {
  id: string
  sessionId?: string
  title: string
  prompt: string
  platform: Platform
  language: Language
  format: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  stageIndex: number
  stageProgress: number
  stageStartedAt?: string
  stages: StageState[]
  artifacts?: Artifacts
  approved: boolean
  demo: true
  seed: number
  error?: string
  render?: { url?: string; mime?: string; renderedAt?: string; size?: number }
  revision: number
  quality: 'high' | 'balanced' | 'low'
}

export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  dataUrl?: string
  sessionOnly?: boolean
}

export type MessageKind = 'text' | 'plan' | 'progress' | 'deliverable' | 'error' | 'note' | 'revision'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  kind: MessageKind
  content: string
  createdAt: string
  projectId?: string
  attachments?: Attachment[]
  meta?: {
    title?: string
    stages?: string[]
    thumbnail?: string
    errorKind?: string
    actionLabel?: string
    actionTo?: string
  }
}

export interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  projectIds: string[]
  messages: Message[]
  pinned?: boolean
}

export type MediaType = 'video' | 'image' | 'audio' | 'document'

export interface MediaAsset {
  id: string
  name: string
  type: MediaType
  size: number
  createdAt: string
  projectId?: string
  thumbnail?: string
  url?: string
  sessionOnly?: boolean
  source: 'generated' | 'uploaded'
  detail?: string
  assetKind?: 'thumbnail' | 'cover' | 'script' | 'srt' | 'narration' | 'metadata' | 'upload' | 'video'
}

export interface Trend {
  id: string
  title: string
  category: string
  score: number
  growth: number
  volume: string
  source: string
  summary: string
  hooks: string[]
  platforms: Platform[]
  sparkline: number[]
}

export interface CalendarEvent {
  id: string
  title: string
  date: string
  time: string
  platform: Platform
  status: 'planned' | 'in-production' | 'ready' | 'published'
  projectId?: string
}

export interface QualitySettings {
  quality: 'auto' | 'high' | 'balanced' | 'low' | 'off'
  motion: 'system' | 'on' | 'off'
}

export interface Settings extends QualitySettings {
  name: string
  email: string
  role: string
  language: Language
  defaultPlatform: Platform
  tone: 'authoritative' | 'conversational' | 'energetic' | 'documentary'
  captions: boolean
  autoApprove: boolean
  notifications: {
    productionComplete: boolean
    agentErrors: boolean
    weeklyDigest: boolean
  }
  integrations: {
    youtube: boolean
    instagram: boolean
    drive: boolean
  }
}

export interface Toast {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'error' | 'info'
}

export interface DemoState {
  version: number
  sessions: Session[]
  projects: Project[]
  media: MediaAsset[]
  calendar: CalendarEvent[]
  trends: Trend[]
  settings: Settings
  activeSessionId: string | null
  simSpeed: number
}

export type ActivityMode =
  | 'idle'
  | 'prompt'
  | 'research'
  | 'writing'
  | 'production'
  | 'checking'
  | 'complete'

export interface AgentRuntime {
  agentId: string
  status: AgentStatus
  task?: string
  projectId?: string
  projectTitle?: string
  progress?: number
}
