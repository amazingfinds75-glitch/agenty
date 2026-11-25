import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleCheck,
  Download,
  Info,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  SquarePlay,
  X,
} from 'lucide-react'
import { AGENT_MAP, EXECUTIVE_PRODUCER } from '../../lib/agents'
import { STAGES } from '../../lib/pipeline'
import { projectAgentStates } from '../../lib/agentRuntime'
import { useDemo } from '../../lib/store'
import type { Artifacts, Project } from '../../lib/types'
import { cx, formatClock, formatDuration, platformLabel, relativeTime } from '../../lib/utils'
import { baseName, downloadPng, downloadText, scriptMarkdown } from '../../lib/exports'
import { speak, stopSpeaking, ttsSupported } from '../../lib/voice'
import {
  AgentGlyph,
  Badge,
  Button,
  IconButton,
  Menu,
  Progress,
  RingProgress,
  StatusPill,
  Tabs,
} from '../ui'

export function overallProgress(project: Project) {
  if (project.status === 'completed') return 1
  return Math.min(1, (project.stageIndex + project.stageProgress) / STAGES.length)
}

export function ProductionPanel({
  project,
  onClose,
  onCollapse,
}: {
  project: Project
  onClose?: () => void
  onCollapse?: () => void
}) {
  const { state, actions, pushToast } = useDemo()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'team' | 'pipeline' | 'output'>('team')
  const currentStage = STAGES[project.stageIndex]
  const progress = overallProgress(project)
  const running = project.status === 'running'
  const paused = project.status === 'paused'
  const failed = project.status === 'failed'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080c12]/80">
      <div className="border-b border-white/[0.07] px-4 pb-3.5 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="label text-[9px] text-cyan/80">Live production</span>
              {project.demo ? <Badge mono className="border-amber-400/20 text-amber-200/80">Simulated</Badge> : null}
            </div>
            <h2 className="mt-1 truncate font-display text-[15px] font-semibold text-txt" title={project.title}>
              {project.title}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-[10.5px] text-txt-faint">
              <StatusPill status={project.status} />
              <span>{platformLabel(project.platform)}</span>
              <span aria-hidden="true">·</span>
              <span>{relativeTime(project.updatedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onCollapse ? <IconButton label="Collapse production panel" icon={X} onClick={onCollapse} className="hidden xl:inline-flex" /> : null}
            {onClose ? <IconButton label="Close production panel" icon={X} onClick={onClose} className="xl:hidden" /> : null}
            <Menu
              align="right"
              label="Production actions"
              trigger={<IconButton label="Production actions" icon={MoreHorizontal} />}
              items={[
                ...(running
                  ? [{ label: 'Pause production', icon: Pause, onClick: () => actions.pauseProject(project.id) }]
                  : []),
                ...(paused || failed
                  ? [
                      {
                        label: failed ? 'Retry failed stage' : 'Resume production',
                        icon: Play,
                        onClick: () => actions.retryProject(project.id),
                      },
                    ]
                  : []),
                ...(running
                  ? [
                      {
                        label: 'Simulate a stage failure',
                        icon: ShieldAlert,
                        onClick: () => actions.failProject(project.id),
                      },
                    ]
                  : []),
                {
                  label: 'Open full production',
                  icon: ArrowUpRight,
                  onClick: () => navigate(`/productions/${project.id}`),
                },
                ...(running || paused
                  ? [
                      {
                        label: 'Cancel production',
                        icon: Square,
                        danger: true,
                        onClick: () => actions.cancelProject(project.id),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-3">
          <RingProgress value={progress} size={54} stroke={4} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] text-txt">
                <span className="text-txt-faint">Stage {Math.min(project.stageIndex + 1, 13)}/13 · </span>
                {project.status === 'completed' ? 'Delivery complete' : currentStage?.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-txt-faint tnum">{Math.round(progress * 100)}%</span>
            </div>
            <Progress value={progress} className="mt-2" height={4} tone="mixed" label="Overall production progress" />
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-txt-faint">
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-cyan" /> {project.stages.filter((s) => s.status === 'completed').length} done
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-white/25" /> {project.stages.filter((s) => s.status === 'pending').length} queued
              </span>
              {failed ? (
                <span className="flex items-center gap-1 text-rose-300">
                  <span className="h-1 w-1 rounded-full bg-rose-400" /> 1 failed
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Demo simulation speed">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-txt-faint">Demo speed</span>
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => actions.setSimSpeed(speed)}
                className={cx(
                  'rounded-md px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                  state.simSpeed === speed ? 'bg-white/[0.08] text-cyan' : 'text-txt-faint hover:text-txt',
                )}
                aria-pressed={state.simSpeed === speed}
                title={`${speed}× simulation speed (applies to all productions)`}
              >
                {speed}×
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {running ? (
              <Button size="sm" variant="secondary" icon={Pause} onClick={() => actions.pauseProject(project.id)}>
                Pause
              </Button>
            ) : null}
            {paused ? (
              <Button size="sm" variant="primary" icon={Play} onClick={() => actions.retryProject(project.id)}>
                Resume
              </Button>
            ) : null}
            {failed ? (
              <Button size="sm" variant="primary" icon={RotateCcw} onClick={() => actions.retryProject(project.id)}>
                Retry stage
              </Button>
            ) : null}
            {project.status === 'completed' ? (
              <Link to={`/productions/${project.id}`}>
                <Button size="sm" variant="secondary" iconRight={ArrowUpRight}>
                  Deliverables
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        {failed ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.07] px-2.5 py-2">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
            <div className="text-[11px] leading-relaxed text-rose-100/90">
              {project.error ?? 'A stage failed.'}{' '}
              <button className="underline decoration-rose-300/40 underline-offset-2 hover:text-white" onClick={() => actions.retryProject(project.id)}>
                Retry stage
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          <Tabs
            tabs={[
              { id: 'team', label: 'Team' },
              { id: 'pipeline', label: 'Pipeline' },
              { id: 'output', label: 'Output' },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
            className="w-full justify-between [&>button]:flex-1 [&>button]:justify-center"
            ariaLabel="Production detail view"
          />
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'team' ? <AgentRoster project={project} /> : null}
        {tab === 'pipeline' ? <StageList project={project} /> : null}
        {tab === 'output' ? (
          <OutputTab project={project} />
        ) : null}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
          <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Simulated agents on a local clock. Copy and artwork are generated in-browser; integrations stay disconnected.{' '}
            <Link to="/verification" className="text-cyan/80 hover:text-cyan">
              What’s real?
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}

const STATUS_ORDER: Record<string, number> = {
  working: 0,
  failed: 1,
  waiting: 2,
  queued: 3,
  completed: 4,
  idle: 5,
}

export function AgentRoster({ project }: { project: Project }) {
  const states = projectAgentStates(project)
  const agents = Object.values(AGENT_MAP)
    .filter((a) => !a.isProducer)
    .sort((a, b) => {
      const sa = STATUS_ORDER[states[a.id]?.status ?? 'idle'] ?? 5
      const sb = STATUS_ORDER[states[b.id]?.status ?? 'idle'] ?? 5
      return sa - sb
    })
  const working = Object.values(states).filter((s) => s.status === 'working').length

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <span className="label text-[9px]">Executive Producer</span>
        <span className="font-mono text-[9.5px] text-txt-faint">{working} active</span>
      </div>
      <div className="rounded-xl border border-cyan/20 bg-[linear-gradient(120deg,rgba(0,212,255,0.09),rgba(139,92,246,0.05))] p-2.5">
        <div className="flex items-start gap-2.5">
          <AgentGlyph agent={EXECUTIVE_PRODUCER} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12px] font-medium text-txt">{EXECUTIVE_PRODUCER.name}</span>
              <StatusPill status={states[EXECUTIVE_PRODUCER.id]?.status ?? 'idle'} className="ml-auto shrink-0" />
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-txt-muted">
              {states[EXECUTIVE_PRODUCER.id]?.task ?? 'Idle'}
            </div>
            <Progress
              value={states[EXECUTIVE_PRODUCER.id]?.progress ?? 0}
              className="mt-1.5"
              height={3}
              tone="mixed"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between pb-1.5">
        <span className="label text-[9px]">12 specialists</span>
        <span className="font-mono text-[9.5px] text-txt-faint">{project.status === 'completed' ? 'All done' : `${working} working`}</span>
      </div>
      <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.015]">
        {agents.map((agent) => {
          const runtime = states[agent.id]
          const status = runtime?.status ?? 'idle'
          return (
            <div key={agent.id} className="flex items-start gap-2.5 px-2.5 py-2">
              <AgentGlyph agent={agent} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11.5px] text-txt">{agent.name}</span>
                  <StatusPill status={status} className="ml-auto shrink-0" />
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-txt-faint">{runtime?.task ?? agent.role}</span>
                  {status === 'working' ? (
                    <span className="shrink-0 font-mono text-[9.5px] text-cyan tnum">
                      {Math.round((runtime?.progress ?? 0) * 100)}%
                    </span>
                  ) : null}
                </div>
                {status === 'working' ? (
                  <Progress value={runtime?.progress ?? 0} className="mt-1.5" height={2} />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StageList({ project }: { project: Project }) {
  const { actions } = useDemo()
  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <span className="label text-[9px]">Production pipeline</span>
        <span className="font-mono text-[9.5px] text-txt-faint">
          {project.stages.filter((s) => s.status === 'completed').length}/13 complete
        </span>
      </div>
      <ol className="relative ml-1">
        {STAGES.map((stage, index) => {
          const state = project.stages.find((s) => s.id === stage.id)
          const status = state?.status ?? 'pending'
          const isCurrent = index === project.stageIndex && project.status !== 'completed'
          const done = status === 'completed'
          const failed = status === 'failed'
          const agents = stage.agentIds.map((id) => AGENT_MAP[id]).filter(Boolean)
          return (
            <li key={stage.id} className="relative flex gap-2.5 pb-2.5 last:pb-0">
              {index < STAGES.length - 1 ? (
                <span
                  className={cx(
                    'absolute left-[7px] top-4 h-[calc(100%-10px)] w-px',
                    done ? 'bg-cyan/30' : 'bg-white/[0.07]',
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cx(
                  'relative z-[1] mt-[7px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border text-[8px] font-mono',
                  done
                    ? 'border-cyan/40 bg-cyan/15 text-cyan'
                    : failed
                      ? 'border-rose-400/50 bg-rose-500/15 text-rose-300'
                      : isCurrent
                        ? 'border-cyan/60 bg-[#042531] text-cyan'
                        : 'border-white/10 bg-[#0a0f16] text-txt-faint',
                )}
              >
                {done ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : failed ? (
                  <AlertTriangle className="h-2.5 w-2.5" />
                ) : isCurrent ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'truncate text-[11.5px]',
                      isCurrent ? 'font-medium text-txt' : done ? 'text-txt-muted' : 'text-txt-faint',
                    )}
                  >
                    {stage.name}
                  </span>
                  {isCurrent && status === 'working' ? (
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-cyan">{Math.round(project.stageProgress * 100)}%</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  <div className="flex -space-x-1">
                    {agents.map((agent) => (
                      <AgentGlyph key={agent.id} agent={agent} size="xs" className="h-4 w-4 rounded-full ring-1 ring-[#0a0f16]" />
                    ))}
                  </div>
                  <span className="truncate text-[9.5px] text-txt-faint">{stage.produces}</span>
                  {state?.completedAt ? (
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-txt-faint">
                      {formatClock(state.completedAt)}
                    </span>
                  ) : null}
                </div>
                {isCurrent && status === 'working' ? (
                  <Progress value={project.stageProgress} className="mt-1.5" height={2} />
                ) : null}
                {failed ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[9.5px] text-rose-300">Stage failed</span>
                    <button
                      onClick={() => actions.retryProject(project.id)}
                      className="rounded border border-rose-400/30 px-1.5 py-0.5 font-mono text-[9px] text-rose-200 hover:bg-rose-500/10"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function OutputTab({ project }: { project: Project }) {
  const { actions, pushToast } = useDemo()
  const artifacts = project.artifacts
  const [playing, setPlaying] = useState(false)

  if (!artifacts) {
    return (
      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="label text-[9px]">Output package</span>
          <Badge tone="warn" mono>
            In progress
          </Badge>
        </div>
        <div className="space-y-2">
          {STAGES.map((stage) => {
            const state = project.stages.find((s) => s.id === stage.id)
            return (
              <div key={stage.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2">
                <CircleCheck
                  className={cx(
                    'h-3.5 w-3.5 shrink-0',
                    state?.status === 'completed' ? 'text-cyan' : 'text-txt-faint/50',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-txt-muted">{stage.produces}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">
                  {state?.status === 'completed' ? 'ready' : state?.status === 'working' ? 'running' : 'queued'}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 text-[10.5px] leading-relaxed text-txt-faint">
          Deliverables unlock after quality control. You can review stage outputs in the pipeline tab while the cut is being assembled.
        </p>
      </div>
    )
  }

  const narration = artifacts.scenes.map((s) => s.narration).join(' ')
  const files: Array<{ label: string; detail: string; icon: typeof Download; action: () => void }> = [
    {
      label: 'Script',
      detail: `${artifacts.wordCount} words · Markdown`,
      icon: Download,
      action: () => {
        downloadText(scriptMarkdown(project), `${baseName(project)}-script.md`, 'text/markdown;charset=utf-8')
        pushToast({ tone: 'success', title: 'Script downloaded' })
      },
    },
    {
      label: 'Captions',
      detail: `${artifacts.srt.split('\n\n').length} cues · SRT`,
      icon: Download,
      action: () => {
        downloadText(artifacts.srt, `${baseName(project)}.srt`, 'application/x-subrip;charset=utf-8')
        pushToast({ tone: 'success', title: 'Subtitles downloaded' })
      },
    },
    {
      label: 'Thumbnail',
      detail: '1280×720 · JPEG',
      icon: Download,
      action: () => {
        if (artifacts.thumbnailDataUrl) {
          downloadPng(artifacts.thumbnailDataUrl, `${baseName(project)}-thumbnail.jpg`)
          pushToast({ tone: 'success', title: 'Thumbnail downloaded' })
        }
      },
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <span className="label text-[9px]">Output package</span>
        {project.approved ? (
          <StatusPill status="approved" />
        ) : (
          <StatusPill status={project.status} />
        )}
      </div>

      {artifacts.thumbnailDataUrl ? (
        <Link to={`/productions/${project.id}`} className="group relative block overflow-hidden rounded-xl border border-white/10">
          <img
            src={artifacts.thumbnailDataUrl}
            alt={`${artifacts.title} thumbnail`}
            className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/90 backdrop-blur">
            <Play className="h-2.5 w-2.5" /> Review cut
          </span>
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/80 backdrop-blur">
            {formatDuration(artifacts.durationSec)}
          </span>
        </Link>
      ) : (
        <div className="shimmer flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 text-[11px] text-txt-faint">
          Generating artwork…
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant={project.approved ? 'secondary' : 'primary'}
          icon={Check}
          disabled={project.approved}
          onClick={() => actions.approveProject(project.id)}
          className="w-full"
        >
          {project.approved ? 'Approved' : 'Approve'}
        </Button>
        <Link to={`/productions/${project.id}`} className="contents">
          <Button size="sm" variant="secondary" icon={SquarePlay} className="w-full">
            Full review
          </Button>
        </Link>
      </div>

      <div className="mt-3 space-y-1">
        {files.map((file) => (
          <div key={file.label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-txt">{file.label}</div>
              <div className="text-[9.5px] text-txt-faint">{file.detail}</div>
            </div>
            <IconButton label={`Download ${file.label}`} icon={file.icon} onClick={file.action} />
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] text-txt">Narration</div>
            <div className="text-[9.5px] text-txt-faint">Browser voice · {artifacts.languageLabel}</div>
          </div>
          <IconButton
            label={playing ? 'Stop narration preview' : 'Play narration preview'}
            icon={playing ? Square : Play}
            onClick={() => {
              if (playing) {
                stopSpeaking()
                setPlaying(false)
                return
              }
              if (!ttsSupported()) {
                pushToast({ tone: 'error', title: 'Speech synthesis unavailable', description: 'This browser does not expose a voice engine.' })
                return
              }
              speak(narration, artifacts.language, {
                onStart: () => setPlaying(true),
                onEnd: () => setPlaying(false),
                onError: (message) => {
                  setPlaying(false)
                  pushToast({ tone: 'error', title: 'Narration preview failed', description: message })
                },
              })
            }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
        <div className="flex items-center justify-between">
          <span className="label text-[9px]">QC summary</span>
          <span className="font-mono text-[9px] text-emerald-300">
            {artifacts.qc.filter((q) => q.status === 'pass').length} pass · {artifacts.qc.filter((q) => q.status === 'warn').length} review
          </span>
        </div>
        <div className="mt-1.5 space-y-1">
          {artifacts.qc.slice(0, 4).map((q) => (
            <div key={q.id} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
              <span
                className={cx(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  q.status === 'pass' ? 'bg-emerald-400' : q.status === 'warn' ? 'bg-amber-400' : 'bg-rose-400',
                )}
              />
              <span className="text-txt-muted">{q.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-txt-faint">{q.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-txt-faint">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        Revision {project.revision} · demo copy, generated locally
      </div>
    </div>
  )
}
