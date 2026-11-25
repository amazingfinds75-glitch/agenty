import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Clapperboard,
  Film,
  FolderOpen,
  LayoutPanelLeft,
  MessageSquarePlus,
  MonitorPlay,
  Palette,
  PanelRight,
  Search,
  SearchCheck,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Composer, type ComposerPayload } from '../components/chat/Composer'
import { MessageItem } from '../components/chat/MessageItem'
import { ProductionPanel, overallProgress } from '../components/production/ProductionPanel'
import { Button, Dot, EmptyState, IconButton, StatusPill } from '../components/ui'
import { PROMPT_SUGGESTIONS } from '../lib/generate'
import { AGENT_ACTIVITY, STAGES } from '../lib/pipeline'
import { useDemo } from '../lib/store'
import type { ActivityMode, Project, Session } from '../lib/types'
import { cx, formatDuration, platformLabel, relativeTime } from '../lib/utils'

const AICore = lazy(() => import('../components/three/AICore').then((m) => ({ default: m.AICore })))

const SUGGESTION_ICONS = {
  trend: TrendingUp,
  reel: Film,
  film: Clapperboard,
  short: Zap,
  calendar: CalendarDays,
  microscope: SearchCheck,
} as const

function activityFor(project: Project | undefined): ActivityMode {
  if (!project) return 'idle'
  if (project.status === 'completed') return 'complete'
  if (project.status === 'paused' || project.status === 'cancelled') return 'idle'
  if (project.status === 'failed') return 'checking'
  const stageId = STAGES[project.stageIndex]?.id
  return (AGENT_ACTIVITY[stageId] as ActivityMode | undefined) ?? 'idle'
}

function resolveQuality(setting: 'auto' | 'high' | 'balanced' | 'low' | 'off') {
  if (setting !== 'auto') return setting
  if (typeof window === 'undefined') return 'balanced' as const
  const width = window.innerWidth
  const cores = navigator.hardwareConcurrency ?? 8
  if (width < 768 || cores <= 4) return 'low' as const
  if (width >= 1440 && cores >= 8) return 'high' as const
  return 'balanced' as const
}

function systemReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type ShelfTab = 'recent' | 'producing' | 'approval'

const SHELF_TABS: Array<{ id: ShelfTab; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'producing', label: 'Producing' },
  { id: 'approval', label: 'Approval' },
]

const STUDIO_ART = {
  blue:
    'radial-gradient(120% 110% at 85% -10%, rgba(64,140,255,0.5), transparent 62%), radial-gradient(100% 90% at 0% 110%, rgba(0,212,255,0.2), transparent 58%), linear-gradient(160deg, #0d1520, #090c11 72%)',
  violet:
    'radial-gradient(120% 110% at 80% -10%, rgba(139,92,246,0.48), transparent 62%), radial-gradient(100% 90% at 0% 110%, rgba(236,72,153,0.18), transparent 58%), linear-gradient(160deg, #140f1f, #0a0910 72%)',
  ember:
    'radial-gradient(120% 110% at 80% -10%, rgba(255,122,54,0.38), transparent 62%), radial-gradient(100% 90% at 0% 110%, rgba(255,196,54,0.16), transparent 58%), linear-gradient(160deg, #191107, #0c0a08 72%)',
} as const

function platformArt(platform: Project['platform']) {
  if (platform === 'instagram-reel') {
    return 'radial-gradient(120% 100% at 80% 0%, rgba(236,72,153,0.38), transparent 62%), radial-gradient(100% 90% at 0% 100%, rgba(251,146,60,0.24), transparent 60%), linear-gradient(160deg,#171019,#0b0a0f 72%)'
  }
  if (platform === 'youtube-short') {
    return 'radial-gradient(120% 100% at 80% 0%, rgba(255,72,86,0.32), transparent 62%), radial-gradient(100% 90% at 0% 100%, rgba(255,160,80,0.16), transparent 60%), linear-gradient(160deg,#170f11,#0b090a 72%)'
  }
  return 'radial-gradient(120% 100% at 80% 0%, rgba(64,140,255,0.34), transparent 62%), radial-gradient(100% 90% at 0% 100%, rgba(0,212,255,0.16), transparent 60%), linear-gradient(160deg,#0e1520,#090b0f 72%)'
}

export default function WorkspacePage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { state, actions } = useDemo()
  const [panelOpen, setPanelOpen] = useState(true)
  const [mobilePanel, setMobilePanel] = useState(false)
  const [pulse, setPulse] = useState<ActivityMode | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [shelfTab, setShelfTab] = useState<ShelfTab>('recent')
  const [shelfQuery, setShelfQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  const session: Session | undefined = sessionId ? state.sessions.find((s) => s.id === sessionId) : undefined
  const project = useMemo(() => {
    if (!session) return undefined
    return session.projectIds
      .map((id) => state.projects.find((p) => p.id === id))
      .filter((p): p is Project => Boolean(p))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  }, [session, state.projects])

  const messages = session?.messages ?? []
  const welcome = !sessionId
  const qualitySetting = resolveQuality(state.settings.quality)
  const reducedMotion =
    state.settings.motion === 'off' || (state.settings.motion === 'system' && systemReducedMotion())

  const runningCount = state.projects.filter((p) => p.status === 'running' || p.status === 'paused').length
  const approvalCount = state.projects.filter((p) => p.status === 'completed' && !p.approved).length

  const shelfProjects = useMemo(() => {
    const sorted = [...state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const byTab = sorted.filter((p) => {
      if (shelfTab === 'producing') return p.status === 'running' || p.status === 'paused'
      if (shelfTab === 'approval') return p.status === 'completed' && !p.approved
      return true
    })
    const q = shelfQuery.trim().toLowerCase()
    return (q ? byTab.filter((p) => p.title.toLowerCase().includes(q)) : byTab).slice(0, 8)
  }, [state.projects, shelfTab, shelfQuery])

  useEffect(() => {
    actions.setActiveSession(sessionId ?? null)
    setMobilePanel(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (!pulse) return
    const timer = window.setTimeout(() => setPulse(null), 1800)
    return () => window.clearTimeout(timer)
  }, [pulse])

  useEffect(() => {
    if (!project || project.status !== 'completed') {
      setCelebrate(false)
      return
    }
    if (project.approved) return
    setCelebrate(true)
    const timer = window.setTimeout(() => setCelebrate(false), 6000)
    return () => window.clearTimeout(timer)
  }, [project?.id, project?.status, project?.approved])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !nearBottomRef.current) return
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages.length, sessionId, project?.stageIndex, reducedMotion])

  useEffect(() => {
    if (!mobilePanel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobilePanel(false)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [mobilePanel])

  const activity: ActivityMode = pulse ?? (celebrate ? 'complete' : activityFor(project))

  const handleSend = useCallback(
    (payload: ComposerPayload) => {
      const typed = payload.text.trim()
      const fallback = payload.attachments.length
        ? `Work from the attached ${payload.attachments.length === 1 ? 'reference' : 'references'} — ${payload.attachments
            .map((a) => a.name)
            .join(', ')}.`
        : ''
      const text = typed || fallback
      if (!text) return
      nearBottomRef.current = true
      const result = actions.sendPrompt({
        text,
        attachments: payload.attachments,
        sessionId: session?.id ?? null,
        platform: payload.platform,
        language: payload.language,
      })
      setPulse('prompt')
      if (result.sessionId && result.sessionId !== session?.id) {
        navigate(`/c/${result.sessionId}`)
      }
    },
    [actions, navigate, session?.id],
  )

  const startFromSuggestion = (prompt: string) => {
    handleSend({ text: prompt, attachments: [], platform: 'auto', language: 'auto' })
  }

  if (sessionId && !session) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <EmptyState
          icon={MessageSquarePlus}
          title="This conversation is no longer available"
          description="It may have been deleted, or the studio demo was reset. Start a fresh production and the Executive Producer will take it from there."
          action={
            <Button
              variant="primary"
              icon={MessageSquarePlus}
              onClick={() => {
                actions.newChat()
                navigate('/')
              }}
            >
              New chat
            </Button>
          }
        />
      </div>
    )
  }

  const completedCount = project?.stages.filter((s) => s.status === 'completed').length ?? 0

  return (
    <div className="workspace-shell relative flex min-h-[440px] w-full overflow-hidden lg:min-h-[540px]">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Ambient layer: aurora glow + static glass architecture */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          {welcome ? <div className="studio-aurora absolute inset-0" /> : null}
          <div
            className={cx(
              'absolute inset-0 transition-opacity duration-700',
              welcome ? 'opacity-[0.22]' : 'opacity-[0.17]',
            )}
          >
            {qualitySetting === 'off' ? (
              <CssGlass active={activity !== 'idle'} />
            ) : (
              <Suspense fallback={<CssGlass active={activity !== 'idle'} />}>
                <AICore
                  activity={activity}
                  quality={qualitySetting}
                  reducedMotion={reducedMotion}
                  className={cx(!welcome && 'mask-radial')}
                />
              </Suspense>
            )}
          </div>
          <div
            className={cx(
              'absolute inset-0',
              welcome
                ? 'bg-[radial-gradient(ellipse_58%_42%_at_50%_26%,rgba(7,9,13,0.52),rgba(7,9,13,0.08)_62%,transparent_82%)]'
                : 'bg-[radial-gradient(ellipse_60%_60%_at_50%_38%,rgba(7,9,13,0.6),transparent_72%)]',
            )}
          />
        </div>

        {welcome ? (
          <div className="scroll-thin relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
              <header className="mx-auto max-w-[880px] text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 py-1 backdrop-blur-sm">
                  <span
                    className="h-3.5 w-3.5 rounded-full bg-[linear-gradient(140deg,#00d4ff,#8b5cf6)] shadow-[0_0_12px_rgba(0,212,255,0.55)]"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-txt-muted">AI Viral Studio</span>
                </div>

                <h1 className="mt-5 font-display text-[clamp(2.3rem,5.8vw,4rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-txt">
                  You call the shots.
                </h1>
                <p className="mx-auto mt-3 max-w-[48ch] text-balance text-[13px] leading-relaxed text-txt-muted sm:text-[14px]">
                  One brief starts research, script, voice, visuals and QC — a 12-agent studio that delivers everything
                  for your approval.
                </p>

                <div className="mx-auto mt-7 w-full max-w-[860px] text-left">
                  <Composer mode="studio" onSend={handleSend} />

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                    <span className="mr-1 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-txt-faint sm:inline">
                      Try
                    </span>
                    {PROMPT_SUGGESTIONS.slice(0, 4).map((suggestion, index) => {
                      const Icon = SUGGESTION_ICONS[suggestion.icon as keyof typeof SUGGESTION_ICONS] ?? Sparkles
                      return (
                        <button
                          key={suggestion.id}
                          onClick={() => startFromSuggestion(suggestion.prompt)}
                          className={cx(
                            'inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-txt-muted transition-colors hover:border-cyan/25 hover:bg-cyan/[0.06] hover:text-txt',
                            index === 3 && 'hidden sm:inline-flex',
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{suggestion.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  <p className="mt-3 text-center text-[10px] text-txt-faint">
                    Demo engine · outputs are simulated · nothing publishes automatically
                  </p>
                </div>
              </header>

              <div className="mt-9 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-[linear-gradient(100deg,rgba(0,212,255,0.07),rgba(139,92,246,0.07)_55%,rgba(255,255,255,0.02))] px-4 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-cyan"
                  aria-hidden="true"
                >
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-txt">Demo engine · every output here is simulated locally</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-txt-faint">
                    12 specialist agents advance on a local clock. Nothing is scheduled or published automatically.
                  </p>
                </div>
                <Link
                  to="/verification"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] text-txt-muted transition-colors hover:border-white/20 hover:text-txt"
                >
                  What’s real <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>

              <section className="mt-7" aria-label="Studio shelf">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-[16px] font-medium tracking-tight text-txt">Studio shelf</h2>
                    <p className="mt-0.5 text-[11px] text-txt-faint">Jump straight into a specialist studio.</p>
                  </div>
                  <Link
                    to="/team"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-txt-faint transition-colors hover:text-txt"
                  >
                    All studios <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr]">
                  <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 backdrop-blur-sm sm:col-span-2 xl:col-span-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[12.5px] font-medium text-txt">Quick starts</p>
                      <Link to="/productions" className="text-[10px] text-txt-faint transition-colors hover:text-txt-muted">
                        All →
                      </Link>
                    </div>
                    <div className="mt-2.5 grid flex-1 grid-cols-2 gap-2">
                      <SkillTile to="/instagram" icon={Camera} label="Reels" sub="Instagram" />
                      <SkillTile to="/youtube" icon={MonitorPlay} label="Shorts" sub="YouTube" />
                      <SkillTile to="/design" icon={Palette} label="Covers" sub="Thumbnails" />
                      <SkillTile to="/trends" icon={TrendingUp} label="Trends" sub="Live signals" />
                    </div>
                  </div>

                  <StudioCard
                    to="/video-studio"
                    icon={Clapperboard}
                    title="Video production"
                    description="Storyboard, voiceover and render, stage by stage."
                    art={STUDIO_ART.blue}
                    chip="13 stages"
                  />
                  <StudioCard
                    to="/design"
                    icon={Palette}
                    title="Design studio"
                    description="Covers, thumbnails and templates that fit your brand."
                    art={STUDIO_ART.violet}
                    chip="Covers · thumbs"
                  />
                  <StudioCard
                    to="/trends"
                    icon={TrendingUp}
                    title="Trend radar"
                    description="Signals ranked by momentum, with sources to verify."
                    art={STUDIO_ART.ember}
                    chip="Live feed"
                  />
                </div>
              </section>

              <section className="mt-11" aria-label="Your productions">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[16px] font-medium tracking-tight text-txt">Your productions</h2>
                    <p className="mt-0.5 text-[11px] text-txt-faint">
                      {runningCount} producing · {approvalCount} awaiting approval · {state.projects.length} total
                    </p>
                  </div>
                  <Link
                    to="/productions"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-txt-faint transition-colors hover:text-txt"
                  >
                    All productions <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div
                    role="tablist"
                    aria-label="Production filter"
                    className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] p-1"
                  >
                    {SHELF_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={shelfTab === tab.id}
                        onClick={() => setShelfTab(tab.id)}
                        className={cx(
                          'rounded-full px-3 py-1.5 text-[11.5px] transition-colors',
                          shelfTab === tab.id ? 'bg-white text-[#0a0d12]' : 'text-txt-muted hover:text-txt',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <label className="relative order-last w-full sm:order-none sm:ml-auto sm:w-[220px]">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Search productions</span>
                    <input
                      value={shelfQuery}
                      onChange={(e) => setShelfQuery(e.target.value)}
                      placeholder="Search productions"
                      className="h-8 w-full rounded-full border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-[11.5px] text-txt placeholder:text-txt-faint transition-colors hover:border-white/15 focus:border-cyan/40 focus:outline-none"
                    />
                  </label>

                  <Link
                    to="/library"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[11.5px] text-txt-muted transition-colors hover:border-white/15 hover:text-txt"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Library
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                  {shelfProjects.map((item) => (
                    <ProductionTile key={item.id} project={item} />
                  ))}
                  {!shelfProjects.length ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] px-6 py-10 text-center">
                      <p className="text-[12.5px] text-txt-muted">
                        {shelfQuery.trim()
                          ? 'No productions match that search.'
                          : shelfTab === 'producing'
                            ? 'Nothing is producing right now.'
                            : shelfTab === 'approval'
                              ? 'Nothing is waiting for approval.'
                              : 'No productions yet.'}
                      </p>
                      <p className="mt-1 max-w-[42ch] text-[11px] leading-relaxed text-txt-faint">
                        Describe a brief above — every production and its status lands here.
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              <p className="mt-10 text-center text-[10px] leading-relaxed text-txt-faint">
                Agents tick on a local clock · outputs are simulated · publishing stays manual.{' '}
                <Link to="/verification" className="text-cyan/75 hover:text-cyan">
                  What’s real?
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <>
            <ThreadHeader
              session={session!}
              project={project}
              messageCount={messages.length}
              onNewChat={() => {
                actions.newChat()
                navigate('/')
              }}
              onTogglePanel={() => setPanelOpen((v) => !v)}
              onOpenMobilePanel={() => setMobilePanel(true)}
            />

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget
                nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
              }}
              className="scroll-thin relative z-[1] min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-[850px] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
                <div className="flex justify-center">
                  <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-txt-faint">
                    {session?.messages.length === 0 ? 'New session' : `Session started ${relativeTime(session!.createdAt)}`} · demo workspace
                  </span>
                </div>

                {messages.map((message) => (
                  <MessageItem key={message.id} message={message} />
                ))}

                {project && project.status === 'running' ? (
                  <div className="flex items-center gap-2 pl-[42px] text-[10.5px] text-txt-faint">
                    <span className="flex gap-1">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-cyan" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-cyan/70 [animation-delay:120ms]" />
                      <span className="h-1 w-1 animate-pulse rounded-full bg-cyan/40 [animation-delay:240ms]" />
                    </span>
                    {STAGES[project.stageIndex]?.name} · {completedCount}/13 complete
                  </div>
                ) : null}

                {project && project.status === 'completed' && !project.approved ? (
                  <div className="ml-[42px] flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2.5">
                    <Dot tone="green" />
                    <span className="text-[11.5px] text-emerald-100/90">
                      Awaiting your approval before anything is scheduled or published.
                    </span>
                    <Link to={`/productions/${project.id}`} className="ml-auto text-[11px] text-cyan/90 hover:text-cyan">
                      Review now →
                    </Link>
                  </div>
                ) : null}

                <div className="h-1" />
              </div>
            </div>

            <div className="relative z-[1] shrink-0 bg-gradient-to-t from-[#07090d] via-[#07090d]/92 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-4">
              <div className="mx-auto w-full max-w-[850px]">
                <Composer mode="thread" onSend={handleSend} disabledHint="Type a follow-up or a new brief." />
                <div className="mt-1.5 hidden items-center justify-between px-1 text-[9.5px] text-txt-faint sm:flex">
                  <span>
                    {project?.artifacts
                      ? `${platformLabel(project.platform)} · ${formatDuration(project.artifacts.durationSec)} · rev ${project.revision}`
                      : 'Follow-ups refine the current production; a fresh brief starts a new one.'}
                  </span>
                  <span className="font-mono uppercase tracking-wider">Demo outputs · review before publishing</span>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {project && panelOpen ? (
        <aside
          className="hidden w-[378px] shrink-0 border-l border-white/[0.07] bg-[#080c12]/70 backdrop-blur-xl xl:block"
          aria-label="Live production panel"
        >
          <ProductionPanel project={project} onCollapse={() => setPanelOpen(false)} />
        </aside>
      ) : null}

      {mobilePanel && project ? (
        <div className="fixed inset-0 z-[80] xl:hidden" role="dialog" aria-modal="true" aria-label="Live production panel">
          <button
            className="absolute inset-0 bg-black/65 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobilePanel(false)}
            aria-label="Close production panel"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[430px] animate-slide-in-right flex-col border-l border-white/10 bg-[#070b10] shadow-lift">
            <ProductionPanel project={project} onClose={() => setMobilePanel(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SkillTile({ to, icon: Icon, label, sub }: { to: string; icon: LucideIcon; label: string; sub: string }) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0b0f15]/80 px-2 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.045]"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/85"
        style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))' }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-txt">{label}</span>
        <span className="block truncate text-[9.5px] text-txt-faint">{sub}</span>
      </span>
    </Link>
  )
}

function StudioCard({
  to,
  icon: Icon,
  title,
  description,
  art,
  chip,
}: {
  to: string
  icon: LucideIcon
  title: string
  description: string
  art: string
  chip: string
}) {
  return (
    <Link
      to={to}
      className="group relative flex min-h-[168px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20"
    >
      <span className="absolute inset-0" style={{ background: art }} aria-hidden="true" />
      <span className="relative flex items-start justify-between gap-2">
        <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/70">
          {chip}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/25 text-white/85 backdrop-blur-sm transition-colors group-hover:border-white/30">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
      <span className="relative mt-auto pt-8">
        <span className="block font-display text-[14px] font-medium tracking-tight text-white">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-white/60">{description}</span>
      </span>
    </Link>
  )
}

function ProductionTile({ project }: { project: Project }) {
  const progress = overallProgress(project)
  return (
    <Link
      to={`/productions/${project.id}`}
      className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-colors hover:border-white/[0.16]"
    >
      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: platformArt(project.platform) }}>
        <div className="absolute inset-0 bg-dot opacity-[0.12]" aria-hidden="true" />
        <span className="absolute left-2 top-2">
          <StatusPill status={project.approved ? 'approved' : project.status} />
        </span>
        <span className="absolute right-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[9px] text-white/80 tnum">
          {project.status === 'completed' ? '100%' : `${Math.round(progress * 100)}%`}
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6">
          <span className="text-[10px] text-white/70">{project.demo ? 'Simulated render' : 'Agentic render'}</span>
          <ArrowRight
            className="h-3.5 w-3.5 text-white/70 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
      <div className="p-2.5">
        <p className="truncate text-[12px] text-txt" title={project.title}>
          {project.title}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-txt-faint">
          {platformLabel(project.platform)} · {relativeTime(project.updatedAt)}
        </p>
      </div>
    </Link>
  )
}

function ThreadHeader({
  session,
  project,
  messageCount,
  onNewChat,
  onTogglePanel,
  onOpenMobilePanel,
}: {
  session: Session
  project?: Project
  messageCount: number
  onNewChat: () => void
  onTogglePanel: () => void
  onOpenMobilePanel: () => void
}) {
  return (
    <header className="relative z-[2] flex h-[58px] shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#07090d]/55 px-3 backdrop-blur-md sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[13px] font-medium text-txt">{session.title}</h1>
          {project ? <StatusPill status={project.approved ? 'approved' : project.status} className="hidden shrink-0 sm:inline-flex" /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-txt-faint">
          <span>{messageCount} messages</span>
          {project ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Dot tone="cyan" pulse={project.status === 'running'} />
                {project.status === 'completed' ? 'Delivered' : STAGES[project.stageIndex]?.name} · {Math.round(overallProgress(project) * 100)}%
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" icon={MessageSquarePlus} onClick={onNewChat} className="px-2">
          <span className="hidden sm:inline">New chat</span>
        </Button>
        {project ? (
          <>
            <IconButton label="Open production panel" icon={PanelRight} onClick={onOpenMobilePanel} className="xl:hidden" />
            <IconButton label="Toggle production panel" icon={LayoutPanelLeft} onClick={onTogglePanel} className="hidden xl:inline-flex" />
          </>
        ) : null}
      </div>
    </header>
  )
}

function CssGlass({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0 bg-dot opacity-[0.13] mask-radial" />
      <div className={cx('relative h-[44%] max-h-[330px] w-[34%] max-w-[290px]', active && 'animate-pulse-soft')}>
        <div className="glass-shard absolute inset-0" style={{ transform: 'rotate(-13deg) skewY(4deg)' }} />
        <div className="glass-shard absolute inset-x-[16%] inset-y-[12%]" style={{ transform: 'rotate(16deg) skewY(-6deg)' }} />
        <div className="glass-shard absolute inset-x-[32%] inset-y-[24%]" style={{ transform: 'rotate(44deg)' }} />
      </div>
    </div>
  )
}
