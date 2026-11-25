import { buildArtifacts } from './generate'
import { STAGES } from './pipeline'
import type {
  CalendarEvent,
  DemoState,
  Language,
  Message,
  Platform,
  Project,
  Session,
  Settings,
  Trend,
} from './types'
import { addDays, toISODate } from './utils'

const now = new Date()

function iso(daysAgo: number, hour = 10) {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 12, 0, 0)
  return d.toISOString()
}

function completedStages(finishedAt: string, durationMs = 58_000) {
  const end = new Date(finishedAt).getTime()
  return STAGES.map((s, i) => ({
    id: s.id,
    status: 'completed' as const,
    progress: 1,
    startedAt: new Date(end - durationMs + (i * durationMs) / STAGES.length).toISOString(),
    completedAt: new Date(end - durationMs + ((i + 1) * durationMs) / STAGES.length).toISOString(),
  }))
}

interface SeedProjectArgs {
  id: string
  sessionId: string
  prompt: string
  platform: Platform
  language: Language
  daysAgo: number
  seed: number
  approved: boolean
  titleOverride?: string
}

function makeProject(args: SeedProjectArgs): Project {
  const createdAt = iso(args.daysAgo)
  const completedAt = iso(args.daysAgo, 11)
  const artifacts = buildArtifacts({
    prompt: args.prompt,
    platform: args.platform,
    language: args.language,
    seed: args.seed,
    tone: 'authoritative',
  })
  if (args.titleOverride) {
    artifacts.title = args.titleOverride
    artifacts.titleOptions = [args.titleOverride, ...artifacts.titleOptions.slice(1)]
    artifacts.youtubeTitle = args.titleOverride.slice(0, 70)
  }
  return {
    id: args.id,
    sessionId: args.sessionId,
    title: artifacts.title,
    prompt: args.prompt,
    platform: args.platform,
    language: args.language,
    format:
      args.platform === 'instagram-reel'
        ? 'Instagram Reel · 9:16'
        : args.platform === 'youtube-long'
          ? 'YouTube long-form · 16:9'
          : 'YouTube Short · 9:16',
    status: 'completed',
    createdAt,
    updatedAt: completedAt,
    stageIndex: STAGES.length - 1,
    stageProgress: 1,
    stages: completedStages(completedAt),
    artifacts,
    approved: args.approved,
    demo: true,
    seed: args.seed,
    revision: args.approved ? 1 : 0,
    quality: 'high',
  }
}

const projectAgentBrief: Record<string, string> = {
  'proj-demo-01': 'on-device AI privacy short',
  'proj-demo-02': 'Telugu Reel on the week in AI',
}

function userMessage(id: string, content: string, createdAt: string, projectId: string): Message {
  return { id, role: 'user', kind: 'text', content, createdAt, projectId }
}

const demoProjectA = makeProject({
  id: 'proj-demo-01',
  sessionId: 'session-demo-01',
  prompt:
    'Generate a YouTube Short about on-device AI and why it matters for privacy.',
  platform: 'youtube-short',
  language: 'en',
  daysAgo: 2,
  seed: 4172,
  approved: true,
})

const demoProjectB = makeProject({
  id: 'proj-demo-02',
  sessionId: 'session-demo-02',
  prompt:
    'Create a Telugu Instagram Reel explaining the most interesting AI technology trend this week.',
  platform: 'instagram-reel',
  language: 'te',
  daysAgo: 6,
  seed: 8811,
  approved: false,
  titleOverride: 'The Signal Behind This Week’s AI Shift',
})

const sessionA: Session = {
  id: 'session-demo-01',
  title: 'On-device AI privacy short',
  createdAt: iso(2, 9),
  updatedAt: iso(2, 11),
  projectIds: ['proj-demo-01'],
  messages: [
    userMessage('msg-demo-u1', demoProjectA.prompt, iso(2, 9), 'proj-demo-01'),
    {
      id: 'msg-demo-a1',
      role: 'assistant',
      kind: 'plan',
      content:
        'Got it — a YouTube Short on on-device AI, built around privacy rather than benchmarks. I’ve assigned the research, strategy, script, fact-check and production specialists. Research runs first; I’ll check in when the master cut is ready.',
      createdAt: iso(2, 9, ),
      projectId: 'proj-demo-01',
      meta: {
        title: 'Production plan · YouTube Short',
        stages: STAGES.slice(0, 7).map((s) => s.name),
      },
    },
    {
      id: 'msg-demo-a2',
      role: 'assistant',
      kind: 'deliverable',
      content:
        'The Short is ready for review. 48 seconds, 9:16, captions synced, thumbnail and publishing package included. The QC pass flagged the demo research sources — worth a look before you approve.',
      createdAt: iso(2, 11),
      projectId: 'proj-demo-01',
      meta: { title: demoProjectA.artifacts?.title },
    },
  ],
}

const sessionB: Session = {
  id: 'session-demo-02',
  title: 'Telugu Reel · this week in AI',
  createdAt: iso(6, 14),
  updatedAt: iso(6, 15),
  projectIds: ['proj-demo-02'],
  messages: [
    userMessage('msg-demo-u2', demoProjectB.prompt, iso(6, 14), 'proj-demo-02'),
    {
      id: 'msg-demo-b1',
      role: 'assistant',
      kind: 'deliverable',
      content:
        'The Telugu Reel is packaged and waiting for your approval. Copy is demo-generated in English; the Telugu narration preview uses your device’s voice. Approve it or ask for a revision in chat.',
      createdAt: iso(6, 15),
      projectId: 'proj-demo-02',
      meta: { title: demoProjectB.artifacts?.title },
    },
  ],
}

const sessionC: Session = {
  id: 'session-demo-03',
  title: 'Trend scouting — Friday',
  createdAt: iso(1, 8),
  updatedAt: iso(1, 8),
  projectIds: [],
  messages: [
    userMessage(
      'msg-demo-c1',
      "Find today's trending AI technology topics and tell me which are worth covering.",
      iso(1, 8),
      '',
    ),
    {
      id: 'msg-demo-c2',
      role: 'assistant',
      kind: 'text',
      content:
        'Three signals stand out in this week’s demo dataset:\n\n1. Open-weight models are reaching frontier-level reasoning — strongest educational angle.\n2. Agent workflows are moving into multi-day autonomous runs — high curiosity, higher risk of overclaiming.\n3. Generative video passed the ten-second attention test — best for a visual Reel.\n\nMy recommendation: lead the week with #1 as a Short, and reserve #3 for an Instagram Reel. Open Trend Intelligence for the full evidence view.',
      createdAt: iso(1, 8),
      meta: { actionLabel: 'Open Trend Intelligence', actionTo: '/trends' },
    },
  ],
}

const trends: Trend[] = [
  {
    id: 'trend-01',
    title: 'Open-weight models reach frontier parity on reasoning benchmarks',
    category: 'Open Models',
    score: 94,
    growth: 38,
    volume: '2.4M',
    source: 'Demo Signal Feed',
    summary:
      'Three open releases now trade blows with closed frontier models on multi-step reasoning. Cost per token is down sharply, and fine-tuning is becoming a two-person job.',
    hooks: [
      'The open-model gap just closed faster than anyone predicted',
      'Why a two-person team can now run frontier AI',
      'The benchmark nobody is talking about',
    ],
    platforms: ['youtube-short', 'youtube-long'],
    sparkline: [22, 30, 28, 41, 46, 44, 58, 63, 71, 78, 86, 94],
  },
  {
    id: 'trend-02',
    title: 'AI agents move into multi-day autonomous workflows',
    category: 'Agentic AI',
    score: 91,
    growth: 45,
    volume: '1.9M',
    source: 'Demo Signal Feed',
    summary:
      'Agent stacks are surviving multi-day tasks with checkpoints and human approval gates. Reliability, not intelligence, is the bottleneck teams keep hitting.',
    hooks: [
      'Agents just stopped being demos',
      'The 72-hour task that changed the workflow',
      'What breaks when an agent runs for three days',
    ],
    platforms: ['youtube-short', 'instagram-reel'],
    sparkline: [12, 18, 24, 22, 35, 48, 55, 63, 72, 80, 88, 91],
  },
  {
    id: 'trend-03',
    title: 'On-device models run 70B-class reasoning locally',
    category: 'Edge AI',
    score: 88,
    growth: 29,
    volume: '1.2M',
    source: 'Demo Signal Feed',
    summary:
      'Quantization plus new mobile accelerators are putting capable reasoning on phones. The privacy and latency story is finally concrete instead of theoretical.',
    hooks: [
      'Your phone just became the data center',
      'AI with the network switched off',
      'Why privacy is now a performance feature',
    ],
    platforms: ['youtube-short', 'instagram-reel'],
    sparkline: [30, 34, 33, 40, 49, 52, 60, 66, 72, 79, 84, 88],
  },
  {
    id: 'trend-04',
    title: 'Generative video passes the ten-second attention test',
    category: 'Generative Video',
    score: 86,
    growth: 52,
    volume: '3.1M',
    source: 'Demo Signal Feed',
    summary:
      'Short generated segments now hold attention in feed tests. Long-form is still visibly synthetic, but the short-form window is effectively open.',
    hooks: [
      'You already scrolled past AI video and didn’t notice',
      'The 10-second line that just got crossed',
      'What disclosure looks like when video is synthetic',
    ],
    platforms: ['instagram-reel', 'youtube-short'],
    sparkline: [18, 22, 29, 38, 44, 51, 60, 64, 74, 81, 84, 86],
  },
  {
    id: 'trend-05',
    title: 'Humanoid pilots expand into warehouse shifts',
    category: 'Robotics',
    score: 81,
    growth: 17,
    volume: '880K',
    source: 'Demo Signal Feed',
    summary:
      'Two logistics operators are running humanoids in supervised shifts. Dexterity is improving; insurance and safety standards are not.',
    hooks: [
      'The warehouse shift with no humans on the floor',
      'Robots learn by watching — the safety question',
      'The last 10% of dexterity is the whole ballgame',
    ],
    platforms: ['youtube-long'],
    sparkline: [40, 44, 42, 50, 55, 57, 62, 66, 70, 74, 78, 81],
  },
  {
    id: 'trend-06',
    title: 'AI diagnostics move into routine reimbursement',
    category: 'Applied AI',
    score: 78,
    growth: 22,
    volume: '640K',
    source: 'Demo Signal Feed',
    summary:
      'A handful of markets now reimburse AI-assisted diagnostics. The operational question is accountability when the model is confidently wrong.',
    hooks: [
      'AI reads the scan before your doctor does',
      'Who is liable when the model is wrong',
      'The quiet change in medical billing',
    ],
    platforms: ['youtube-long', 'youtube-short'],
    sparkline: [34, 36, 41, 44, 48, 52, 55, 61, 67, 71, 75, 78],
  },
  {
    id: 'trend-07',
    title: 'Open small language models for Telugu get a public release',
    category: 'Language Models',
    score: 76,
    growth: 31,
    volume: '410K',
    source: 'Demo Signal Feed',
    summary:
      'A compact Telugu-first model is out with permissive weights. Early tests show strong summarization and weak code-mixing — a useful creator angle.',
    hooks: [
      'Telugu AI just got its own model',
      'What a Telugu-first model gets right — and wrong',
      'The creator opportunity in low-resource languages',
    ],
    platforms: ['instagram-reel', 'youtube-short'],
    sparkline: [20, 24, 23, 30, 36, 41, 48, 54, 59, 65, 71, 76],
  },
  {
    id: 'trend-08',
    title: 'Quantum error correction hits a practical milestone',
    category: 'Deep Tech',
    score: 72,
    growth: 12,
    volume: '320K',
    source: 'Demo Signal Feed',
    summary:
      'Logical qubit error rates dropped again, but useful scale is still years out. The interesting story is which industries are quietly preparing.',
    hooks: [
      'Quantum’s boring breakthrough',
      'Why cryptography teams are paying attention now',
      'The decade-long bet hiding in plain sight',
    ],
    platforms: ['youtube-long'],
    sparkline: [42, 46, 45, 48, 51, 55, 58, 61, 64, 67, 70, 72],
  },
  {
    id: 'trend-09',
    title: 'Creator teams cut production time with agent stacks',
    category: 'Creator Economy',
    score: 69,
    growth: 26,
    volume: '510K',
    source: 'Demo Signal Feed',
    summary:
      'Small creator teams are compressing research-to-publish cycles using agents with human review gates. Quality variance is the remaining problem.',
    hooks: [
      'One person, one publishing team',
      'The new creator stack: taste plus verification',
      'What happens to craft when production gets cheap',
    ],
    platforms: ['youtube-short', 'instagram-reel'],
    sparkline: [26, 30, 34, 33, 38, 42, 47, 51, 56, 60, 65, 69],
  },
  {
    id: 'trend-10',
    title: 'AI browsers become the new default interface',
    category: 'Consumer AI',
    score: 66,
    growth: 19,
    volume: '990K',
    source: 'Demo Signal Feed',
    summary:
      'Agentic browsing is showing up in default installs. Convenience is obvious; permission design and prompt injection are the open questions.',
    hooks: [
      'The browser is becoming the agent',
      'Who is clicking for you?',
      'Prompt injection is the new phishing',
    ],
    platforms: ['youtube-short'],
    sparkline: [38, 40, 39, 43, 47, 49, 53, 56, 59, 62, 64, 66],
  },
]

const settings: Settings = {
  name: 'Studio Owner',
  email: 'studio@aiviralstudio.demo',
  role: 'Executive Producer',
  language: 'en',
  defaultPlatform: 'youtube-short',
  tone: 'authoritative',
  captions: true,
  autoApprove: false,
  notifications: { productionComplete: true, agentErrors: true, weeklyDigest: false },
  integrations: { youtube: false, instagram: false, drive: false },
  quality: 'auto',
  motion: 'system',
}

function calendarEvents(): CalendarEvent[] {
  return [
    {
      id: 'cal-1',
      title: 'Publish · On-device AI short',
      date: toISODate(addDays(now, -2)),
      time: '18:00',
      platform: 'youtube-short',
      status: 'published',
      projectId: 'proj-demo-01',
    },
    {
      id: 'cal-2',
      title: 'Review · Telugu Reel cut',
      date: toISODate(addDays(now, 1)),
      time: '10:30',
      platform: 'instagram-reel',
      status: 'ready',
      projectId: 'proj-demo-02',
    },
    {
      id: 'cal-3',
      title: 'Weekly content plan review',
      date: toISODate(addDays(now, 2)),
      time: '09:00',
      platform: 'youtube-short',
      status: 'planned',
    },
    {
      id: 'cal-4',
      title: 'Production · AI agents explainer',
      date: toISODate(addDays(now, 4)),
      time: '14:00',
      platform: 'youtube-long',
      status: 'in-production',
    },
    {
      id: 'cal-5',
      title: 'Publish · This week in AI Reel',
      date: toISODate(addDays(now, 5)),
      time: '19:30',
      platform: 'instagram-reel',
      status: 'planned',
      projectId: 'proj-demo-02',
    },
  ]
}

export function createSeedState(): DemoState {
  return {
    version: 1,
    sessions: [sessionA, sessionB, sessionC],
    projects: [demoProjectA, demoProjectB],
    media: [],
    calendar: calendarEvents(),
    trends,
    settings,
    activeSessionId: null,
    simSpeed: 2,
  }
}

export const DEMO_PROJECT_HINTS = projectAgentBrief
