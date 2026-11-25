import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  Clapperboard,
  Film,
  LayoutPanelLeft,
  MessageSquarePlus,
  PanelRight,
  SearchCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Composer, type ComposerPayload } from '../components/chat/Composer'
import { MessageItem } from '../components/chat/MessageItem'
import { ProductionPanel, overallProgress } from '../components/production/ProductionPanel'
import { LiveClock, StudioConsole } from '../components/workspace/StudioConsole'
import { Badge, Button, Dot, EmptyState, IconButton, StatusPill } from '../components/ui'
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

export default function WorkspacePage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { state, actions } = useDemo()
  const [panelOpen, setPanelOpen] = useState(true)
  const [mobilePanel, setMobilePanel] = useState(false)
  const [pulse, setPulse] = useState<ActivityMode | null>(null)
  const [celebrate, setCelebrate] = useState(false)
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
        {/* Ambient 3D layer */}
        <div
          className={cx(
            'pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700',
            welcome ? 'opacity-[0.92]' : 'opacity-[0.17]',
          )}
          aria-hidden="true"
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
          <div
            className={cx(
              'absolute inset-0',
              welcome
                ? 'bg-[radial-gradient(ellipse_52%_44%_at_50%_44%,rgba(7,9,13,0.55),rgba(7,9,13,0.12)_58%,transparent_80%)]'
                : 'bg-[radial-gradient(ellipse_60%_60%_at_50%_38%,rgba(7,9,13,0.6),transparent_72%)]',
            )}
          />
        </div>

        {welcome ? (
          <div className="scroll-thin relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto my-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">
              <div className="grid w-full items-start gap-8 xl:grid-cols-[minmax(0,1fr)_372px] xl:gap-10">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Badge mono tone="cyan" className="border-cyan/25 text-cyan">
                      <span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-cyan shadow-[0_0_8px_rgba(0,212,255,0.9)]" />
                      Studio online
                    </Badge>
                    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-txt-faint">
                      <LiveClock className="text-txt-muted" />
                      <span>local</span>
                      <span aria-hidden="true">·</span>
                      <span>12 agents · 13 stages</span>
                    </span>
                  </div>

                  <h1 className="mt-5 max-w-[18ch] font-display text-[clamp(2.15rem,5.4vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-txt">
                    Your AI Media <span className="gradient-text">Agency.</span>
                  </h1>
                  <p className="mt-3 font-display text-[17px] tracking-tight text-txt-muted sm:text-[19px]">
                    One prompt. Complete production.
                  </p>
                  <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-txt-faint">
                    Research, strategy, script, voice, visuals, editing and QC — coordinated by an Executive Producer,
                    delivered for your approval. The studio floor updates live as work runs.
                  </p>

                  <div className="mt-6 w-full max-w-[780px]">
                    <Composer mode="hero" onSend={handleSend} disabledHint="Type a brief to start production." />
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[10.5px] text-txt-faint">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">Example</span>
                      <span className="line-clamp-2 italic text-txt-faint">
                        “Find an interesting AI technology trend and create a Telugu Instagram Reel and a YouTube Short
                        explaining it.”
                      </span>
                    </div>
                  </div>

                  <div className="mt-7 w-full max-w-[780px]">
                    <div className="flex items-center justify-between">
                      <span className="label text-[9px]">Suggested briefs</span>
                      <span className="hidden font-mono text-[9px] text-txt-faint sm:inline">
                        Click to start · editable after
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {PROMPT_SUGGESTIONS.map((suggestion) => {
                        const Icon = SUGGESTION_ICONS[suggestion.icon as keyof typeof SUGGESTION_ICONS] ?? Sparkles
                        return (
                          <button
                            key={suggestion.id}
                            onClick={() => startFromSuggestion(suggestion.prompt)}
                            className="group flex items-start gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.022] px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-cyan/25 hover:bg-cyan/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-txt-muted transition-colors group-hover:border-cyan/25 group-hover:text-cyan">
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] text-txt">{suggestion.label}</span>
                              <span className="mt-0.5 line-clamp-1 block text-[10.5px] text-txt-faint">
                                {suggestion.prompt}
                              </span>
                            </span>
                            <ArrowUpRight
                              className="mt-1 h-3.5 w-3.5 shrink-0 text-txt-faint/50 transition-colors group-hover:text-cyan"
                              aria-hidden="true"
                            />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-txt-faint">
                    {[
                      '12 specialists',
                      '13 production stages',
                      'Telugu · Hindi · Tamil · Kannada · English',
                      'Human approval required',
                    ].map((item) => (
                      <span key={item} className="inline-flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-cyan/60" aria-hidden="true" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="min-w-0">
                  <StudioConsole />
                </div>
              </div>
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
