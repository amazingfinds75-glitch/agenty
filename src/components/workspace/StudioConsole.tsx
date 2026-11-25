import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  Check,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from 'lucide-react'
import { AGENTS, EXECUTIVE_PRODUCER } from '../../lib/agents'
import { globalAgentStates } from '../../lib/agentRuntime'
import { STAGES } from '../../lib/pipeline'
import { useDemo } from '../../lib/store'
import type { CalendarEvent, Project } from '../../lib/types'
import { cx, formatClock, formatDuration, platformLabel, relativeTime } from '../../lib/utils'
import { AgentGlyph, Badge, Dot, Progress, RingProgress, StatusPill } from '../ui'
import { overallProgress } from '../production/ProductionPanel'
import { LiveDeskCard } from '../live/LiveDeskCard'

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function LiveClock({ className }: { className?: string }) {
  const now = useNow(1000)
  return (
    <time
      dateTime={new Date(now).toISOString()}
      className={cx('font-mono tabular-nums', className)}
      aria-label="Local time"
    >
      {new Date(now).toLocaleTimeString(undefined, { hour12: false })}
    </time>
  )
}

const AGENT_DOT: Record<string, string> = {
  working: 'bg-cyan shadow-[0_0_6px_rgba(0,212,255,0.9)]',
  waiting: 'bg-amber-400',
  queued: 'bg-violet-400/70',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-400',
  idle: 'bg-white/20',
}

function pickFocus(projects: Project[]) {
  const rank = (project: Project) => {
    if (project.status === 'running') return 0
    if (project.status === 'failed') return 1
    if (project.status === 'paused') return 2
    if (project.status === 'completed' && !project.approved) return 3
    return 4
  }
  return [...projects].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))[0]
}

function stageStatus(project: Project, index: number) {
  const state = project.stages.find((s) => s.id === STAGES[index].id)
  if (state?.status === 'failed') return 'failed'
  if (state?.status === 'completed') return 'completed'
  if (index === project.stageIndex && project.status !== 'completed') {
    if (project.status === 'paused') return 'waiting'
    if (project.status === 'failed') return 'failed'
    return 'working'
  }
  return 'queued'
}

function nextSlot(calendar: CalendarEvent[], now: number) {
  return [...calendar]
    .map((event) => ({ event, at: new Date(`${event.date}T${event.time}`).getTime() }))
    .filter((row) => !Number.isNaN(row.at) && row.at >= now)
    .sort((a, b) => a.at - b.at)[0]
}

export function StudioConsole() {
  const { state, actions } = useDemo()
  const now = useNow(1000)

  const focus = useMemo(() => pickFocus(state.projects), [state.projects])
  const agentStates = useMemo(() => globalAgentStates(state.projects), [state.projects])
  const approvals = useMemo(
    () =>
      [...state.projects]
        .filter((p) => p.status === 'completed' && !p.approved)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.projects],
  )
  const slot = useMemo(() => nextSlot(state.calendar, now), [state.calendar, now])

  const counts = useMemo(
    () => ({
      running: state.projects.filter((p) => p.status === 'running').length,
      paused: state.projects.filter((p) => p.status === 'paused').length,
      failed: state.projects.filter((p) => p.status === 'failed').length,
      delivered: state.projects.filter((p) => p.status === 'completed' && p.approved).length,
    }),
    [state.projects],
  )
  const workingAgents = Object.values(agentStates).filter((s) => s.status === 'working').length

  const doneStages = focus ? focus.stages.filter((s) => s.status === 'completed').length : 0
  const queuedStages = focus ? focus.stages.filter((s) => s.status === 'pending').length : 0
  const progress = focus ? overallProgress(focus) : 0
  const remainingMs =
    focus && focus.status === 'running'
      ? STAGES.slice(focus.stageIndex).reduce(
          (sum, stage, i) => sum + stage.durationMs * (i === 0 ? 1 - Math.min(1, focus.stageProgress) : 1),
          0,
        )
      : 0
  const etaSeconds = remainingMs / 1000 / Math.max(1, state.simSpeed)

  return (
    <div className="space-y-3" aria-label="Live studio console">
      <section className="panel overflow-hidden" aria-label="Studio status">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Dot tone={counts.running > 0 ? 'cyan' : counts.failed > 0 ? 'rose' : 'green'} pulse={counts.running > 0} />
            <span className="text-[12px] font-medium text-txt">Studio floor</span>
            <Badge mono tone="cyan" className="px-1.5 py-[1px] text-[8.5px]">
              LIVE
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-[9.5px] text-txt-faint">
            <LiveClock className="text-[10px] text-txt-muted" />
            <span>local</span>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/[0.05] border-b border-white/[0.06]">
          {[
            { label: 'Producing', value: counts.running, tone: counts.running ? 'text-cyan' : 'text-txt' },
            {
              label: 'Approvals',
              value: approvals.length,
              tone: approvals.length ? 'text-amber-200' : 'text-txt',
            },
            { label: 'Delivered', value: counts.delivered, tone: counts.delivered ? 'text-emerald-300' : 'text-txt' },
          ].map((stat) => (
            <div key={stat.label} className="px-4 py-2">
              <p className={cx('font-mono text-[16px] leading-none tnum', stat.tone)}>{String(stat.value).padStart(2, '0')}</p>
              <p className="mt-1 text-[9px] uppercase tracking-wider text-txt-faint">{stat.label}</p>
            </div>
          ))}
        </div>

        {focus ? (
          <>
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="label text-[9px]">Focus production</span>
                <span className="font-mono text-[9px] text-txt-faint">updated {relativeTime(focus.updatedAt)}</span>
              </div>
              <div className="mt-1 flex items-start gap-2">
                <Link
                  to={`/productions/${focus.id}`}
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-txt hover:text-cyan"
                  title={focus.title}
                >
                  {focus.title}
                </Link>
                <StatusPill status={focus.approved ? 'approved' : focus.status} className="shrink-0" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-txt-faint">
                <span>{platformLabel(focus.platform)}</span>
                <span aria-hidden="true">·</span>
                <span>{focus.artifacts?.languageLabel ?? focus.language}</span>
                <span aria-hidden="true">·</span>
                <span>rev {focus.revision}</span>
                <span aria-hidden="true">·</span>
                <span>{focus.demo ? 'simulated' : 'agentic'}</span>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <RingProgress value={progress} size={54} stroke={4} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-txt">
                      <span className="text-txt-faint">Stage {Math.min(focus.stageIndex + 1, 13)}/13 · </span>
                      {focus.status === 'completed' ? 'Delivery complete' : STAGES[focus.stageIndex]?.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-txt-faint tnum">{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={progress} className="mt-1.5" height={4} tone="mixed" label="Focused production progress" />
                  <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-txt-faint">
                    <span>{workingAgents} agents on task</span>
                    <span>
                      {doneStages} done · {queuedStages} queued
                    </span>
                  </div>
                  {focus.status === 'running' ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] text-cyan/80">
                      <Timer className="h-2.5 w-2.5" aria-hidden="true" />≈ {formatDuration(etaSeconds)} left at{' '}
                      {state.simSpeed}× sim
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[9px] text-txt-faint">
                      {focus.status === 'paused'
                        ? 'Paused — resume from any console.'
                        : focus.status === 'failed'
                          ? 'Stage failed — retry to continue.'
                          : 'Pipeline finished — awaiting human review.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] px-4 py-2">
              {focus.status === 'running' ? (
                <button
                  onClick={() => actions.pauseProject(focus.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-1 text-[9.5px] text-txt-muted transition-colors hover:border-white/20 hover:text-txt"
                >
                  <Pause className="h-2.5 w-2.5" aria-hidden="true" /> Pause
                </button>
              ) : null}
              {focus.status === 'paused' || focus.status === 'failed' ? (
                <button
                  onClick={() => actions.retryProject(focus.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan/30 px-1.5 py-1 text-[9.5px] text-cyan transition-colors hover:bg-cyan/[0.08]"
                >
                  {focus.status === 'failed' ? (
                    <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-2.5 w-2.5" aria-hidden="true" />
                  )}
                  {focus.status === 'failed' ? 'Retry stage' : 'Resume'}
                </button>
              ) : null}
              <span className="ml-1 font-mono text-[8.5px] uppercase tracking-wider text-txt-faint">Sim</span>
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => actions.setSimSpeed(speed)}
                  aria-pressed={state.simSpeed === speed}
                  className={cx(
                    'rounded px-1 py-0.5 font-mono text-[9px] transition-colors',
                    state.simSpeed === speed ? 'bg-white/[0.08] text-cyan' : 'text-txt-faint hover:text-txt',
                  )}
                >
                  {speed}×
                </button>
              ))}
              <Link
                to={focus.sessionId ? `/c/${focus.sessionId}` : `/productions/${focus.id}`}
                className="ml-auto inline-flex items-center gap-1 text-[9.5px] text-cyan/85 hover:text-cyan"
              >
                Open console <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="border-t border-white/[0.06] px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="label text-[9px]">Pipeline · 13 stages</span>
                <span className="font-mono text-[9px] text-txt-faint tnum">{doneStages}/13 complete</span>
              </div>
              <ol className="mt-1.5 grid grid-cols-2 gap-1">
                {STAGES.map((stage, index) => {
                  const status = stageStatus(focus, index)
                  const completedAt = focus.stages.find((s) => s.id === stage.id)?.completedAt
                  const current = index === focus.stageIndex && focus.status !== 'completed'
                  return (
                    <li
                      key={stage.id}
                      title={`${stage.name} — ${stage.produces}${completedAt ? ` · done ${formatClock(completedAt)}` : ''}`}
                      className={cx(
                        'flex min-w-0 items-center gap-1 rounded border px-1.5 py-[3px] text-[8.5px]',
                        current
                          ? 'border-cyan/30 bg-cyan/[0.06] text-cyan'
                          : status === 'completed'
                            ? 'border-white/[0.06] bg-white/[0.02] text-txt-muted'
                            : status === 'failed'
                              ? 'border-rose-400/30 bg-rose-500/[0.06] text-rose-200'
                              : 'border-white/[0.04] text-txt-faint',
                      )}
                    >
                      <span
                        className={cx(
                          'h-1 w-1 shrink-0 rounded-full',
                          current
                            ? 'animate-pulse bg-cyan'
                            : status === 'completed'
                              ? 'bg-emerald-400'
                              : status === 'failed'
                                ? 'bg-rose-400'
                                : 'bg-white/20',
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-mono text-[8px] text-txt-faint tnum">{String(index + 1).padStart(2, '0')}</span>
                      <span className="truncate">{stage.short}</span>
                      {current ? (
                        <span className="ml-auto shrink-0 font-mono text-[8px] tnum">
                          {Math.round(focus.stageProgress * 100)}%
                        </span>
                      ) : status === 'completed' ? (
                        <Check className="ml-auto h-2 w-2 shrink-0 text-emerald-400/80" aria-hidden="true" />
                      ) : null}
                    </li>
                  )
                })}
              </ol>
              <p className="mt-1.5 truncate text-[9px] text-txt-faint">
                {focus.status === 'completed'
                  ? `All outputs packaged · QC ${focus.artifacts ? `${focus.artifacts.qc.filter((q) => q.status === 'pass').length}/${focus.artifacts.qc.length} pass` : 'pending'}`
                  : `Next: ${STAGES[focus.stageIndex]?.produces ?? 'delivery package'} · ${STAGES[focus.stageIndex]?.description ?? ''}`}
              </p>
            </div>
          </>
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-[11.5px] text-txt-muted">No productions yet.</p>
            <p className="mt-1 text-[10px] leading-relaxed text-txt-faint">
              Send a brief below and 13 stages run here on a live clock.
            </p>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden" aria-label="Agent floor">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <span className="label text-[9px]">On the floor</span>
          <span className="flex items-center gap-2 font-mono text-[9px] text-txt-faint">
            <span className={workingAgents ? 'text-cyan' : undefined}>{workingAgents} working</span>
            <span aria-hidden="true">·</span>
            <Link to="/team" className="hover:text-cyan">
              13 agents
            </Link>
          </span>
        </div>
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-cyan/[0.16] bg-cyan/[0.04] px-2 py-1.5">
            <AgentGlyph agent={EXECUTIVE_PRODUCER} size="xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10.5px] text-txt">{EXECUTIVE_PRODUCER.name}</p>
              <p className="truncate text-[8.5px] text-txt-faint">
                {agentStates[EXECUTIVE_PRODUCER.id]?.task ?? EXECUTIVE_PRODUCER.role}
              </p>
            </div>
            <span
              className={cx(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                AGENT_DOT[agentStates[EXECUTIVE_PRODUCER.id]?.status ?? 'idle'],
              )}
              title={agentStates[EXECUTIVE_PRODUCER.id]?.status ?? 'idle'}
            />
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {AGENTS.map((agent) => {
              const runtime = agentStates[agent.id]
              const status = runtime?.status ?? 'idle'
              return (
                <li key={agent.id} className="flex min-w-0 items-center gap-1.5" title={`${agent.name} — ${runtime?.task ?? agent.role}`}>
                  <span className={cx('h-1 w-1 shrink-0 rounded-full', AGENT_DOT[status])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9.5px] text-txt-muted">{agent.shortName}</p>
                    <p className="truncate text-[8px] text-txt-faint">
                      {status === 'working'
                        ? `${runtime?.task ?? 'Working'} · ${Math.round((runtime?.progress ?? 0) * 100)}%`
                        : status === 'queued'
                          ? 'Queued'
                          : status === 'waiting'
                            ? 'Waiting'
                            : status === 'completed'
                              ? 'Done'
                              : status === 'failed'
                                ? 'Blocked'
                                : agent.role}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="panel overflow-hidden" aria-label="Approvals and schedule">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <span className="label text-[9px]">Needs you</span>
          <Badge tone={approvals.length ? 'warn' : 'default'} mono className="text-[8.5px]">
            {approvals.length} approvals
          </Badge>
        </div>
        <div className="px-4 py-2.5">
          {approvals.length ? (
            <ul className="space-y-1.5">
              {approvals.slice(0, 2).map((project) => (
                <li key={project.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/productions/${project.id}`}
                      className="block truncate text-[10.5px] text-txt hover:text-cyan"
                      title={project.title}
                    >
                      {project.title}
                    </Link>
                    <p className="text-[8.5px] text-txt-faint">
                      {platformLabel(project.platform)} · {relativeTime(project.updatedAt)}
                    </p>
                  </div>
                  <Link to={`/productions/${project.id}`} className="shrink-0 text-[9px] text-cyan/85 hover:text-cyan">
                    Review →
                  </Link>
                </li>
              ))}
              {approvals.length > 2 ? (
                <li className="text-[9px] text-txt-faint">+{approvals.length - 2} more in Active Productions</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-[10px] text-txt-faint">Nothing waiting. Completed cuts land here for sign-off.</p>
          )}

          <div className="mt-2.5 border-t border-white/[0.05] pt-2">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-2.5 w-2.5 text-txt-faint" aria-hidden="true" />
              <span className="label text-[9px]">Next slot</span>
            </div>
            {slot ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] text-txt" title={slot.event.title}>
                    {slot.event.title}
                  </p>
                  <p className="text-[8.5px] text-txt-faint">
                    {new Date(slot.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                    {slot.event.time} · {platformLabel(slot.event.platform)}
                  </p>
                </div>
                <StatusPill status={slot.event.status} className="shrink-0" />
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-txt-faint">Nothing scheduled.</p>
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-white/[0.05] pt-2 text-center">
            {[
              { label: 'Projects', value: state.projects.length, to: '/productions' },
              { label: 'Chats', value: state.sessions.length, to: '/history' },
              { label: 'Assets', value: state.media.length, to: '/library' },
              { label: 'Trends', value: state.trends.length, to: '/trends' },
            ].map((item) => (
              <Link key={item.label} to={item.to} className="group">
                <p className="font-mono text-[12px] text-txt tnum group-hover:text-cyan">{item.value}</p>
                <p className="text-[8px] uppercase tracking-wider text-txt-faint group-hover:text-txt-muted">{item.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <LiveDeskCard />

      <p className="px-1 text-[9px] leading-relaxed text-txt-faint">
        Agents tick on a local 600 ms clock; progress, ETA and timings are simulated. Publishing stays manual.{' '}
        <Link to="/verification" className="text-cyan/75 hover:text-cyan">
          What’s real?
        </Link>
      </p>
    </div>
  )
}
