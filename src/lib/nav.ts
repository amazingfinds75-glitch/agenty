import {
  Activity,
  AudioLines,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  Camera,
  Captions,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileStack,
  Film,
  FolderOpen,
  History,
  Image,
  LayoutTemplate,
  Library,
  MessageSquare,
  MonitorPlay,
  Orbit,
  Palette,
  PenLine,
  Plus,
  Radar,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  rail?: string
  icon: LucideIcon
  group: 'workspace' | 'create' | 'studios' | 'team'
  description: string
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'New Chat',
    rail: 'New',
    icon: Plus,
    group: 'workspace',
    description: 'Start a brief with the Executive Producer',
    end: true,
  },
  {
    to: '/history',
    label: 'Chat History',
    rail: 'Chats',
    icon: History,
    group: 'workspace',
    description: 'Saved conversations and continuations',
  },
  {
    to: '/productions',
    label: 'Active Productions',
    rail: 'Active',
    icon: Activity,
    group: 'workspace',
    description: 'Live pipeline, stages and agent work',
  },
  {
    to: '/videos',
    label: 'My Videos',
    rail: 'Videos',
    icon: Film,
    group: 'create',
    description: 'Finished cuts and deliverables',
  },
  {
    to: '/trends',
    label: 'Trend Intelligence',
    rail: 'Trends',
    icon: TrendingUp,
    group: 'create',
    description: 'Signals, sources and opportunities',
  },
  {
    to: '/calendar',
    label: 'Content Calendar',
    rail: 'Calendar',
    icon: CalendarDays,
    group: 'create',
    description: 'Publishing plan across platforms',
  },
  {
    to: '/youtube',
    label: 'YouTube Studio',
    rail: 'YouTube',
    icon: MonitorPlay,
    group: 'studios',
    description: 'Shorts and long-form metadata',
  },
  {
    to: '/instagram',
    label: 'Instagram Studio',
    rail: 'Instagram',
    icon: Camera,
    group: 'studios',
    description: 'Reels, covers and captions',
  },
  {
    to: '/script',
    label: 'Script Studio',
    rail: 'Script',
    icon: PenLine,
    group: 'studios',
    description: 'Hooks, scenes and narration',
  },
  {
    to: '/video-studio',
    label: 'Video Production',
    rail: 'Video',
    icon: LayoutTemplate,
    group: 'studios',
    description: 'Storyboard, voiceover and render',
  },
  {
    to: '/design',
    label: 'Design Studio',
    rail: 'Design',
    icon: Palette,
    group: 'studios',
    description: 'Thumbnails, covers and templates',
  },
  {
    to: '/team',
    label: 'AI Team',
    rail: 'Team',
    icon: Users,
    group: 'team',
    description: 'The 12 specialists and producer',
  },
  {
    to: '/library',
    label: 'Media Library',
    rail: 'Library',
    icon: Library,
    group: 'team',
    description: 'Generated and uploaded assets',
  },
]

export const NAV_GROUPS: Array<{ id: NavItem['group']; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'create', label: 'Create' },
  { id: 'studios', label: 'Studios' },
  { id: 'team', label: 'Team & assets' },
]

export const AGENT_ICONS: Record<string, LucideIcon> = {
  radar: Radar,
  compass: Compass,
  pen: PenLine,
  shield: ShieldCheck,
  voice: AudioLines,
  film: Film,
  palette: Palette,
  scissors: Scissors,
  captions: Captions,
  thumbnail: Image,
  search: Search,
  qc: BadgeCheck,
  producer: Orbit,
}

export const MISC_ICONS = {
  settings: Settings,
  message: MessageSquare,
  folder: FolderOpen,
  fileStack: FileStack,
  clipboard: ClipboardCheck,
  checkCircle: CheckCircle2,
  sparkles: Sparkles,
  book: BookOpenCheck,
}

export function pageTitle(pathname: string): { title: string; description: string; parent: string } {
  if (pathname.startsWith('/c/')) {
    return {
      title: 'Conversation',
      description: 'Brief the studio and follow the production',
      parent: 'Workspace',
    }
  }
  if (pathname.startsWith('/productions/')) {
    return {
      title: 'Production',
      description: 'Pipeline, agents and deliverables',
      parent: 'Workspace',
    }
  }
  const item = NAV_ITEMS.filter((i) => i.to !== '/')
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  if (pathname === '/settings') {
    return { title: 'Settings', description: 'Profile, preferences and integrations', parent: 'Workspace' }
  }
  if (pathname === '/verification') {
    return { title: 'Verification', description: 'What is real, mocked or not implemented', parent: 'System' }
  }
  if (item) return { title: item.label, description: item.description, parent: 'Workspace' }
  return { title: 'AI Viral Studio', description: 'Your AI media agency', parent: 'Workspace' }
}
