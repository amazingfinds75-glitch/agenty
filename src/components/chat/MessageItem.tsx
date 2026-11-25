import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Play,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { EXECUTIVE_PRODUCER } from '../../lib/agents'
import { useDemo } from '../../lib/store'
import type { Message, Project } from '../../lib/types'
import { cx, formatClock, formatDuration, platformLabel, relativeTime } from '../../lib/utils'
import { AgentGlyph, Badge, Button, StatusPill } from '../ui'
import { overallProgress } from '../production/ProductionPanel'
import { STAGES } from '../../lib/pipeline'

function usesReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    (document.documentElement.dataset.motion === 'off' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
}

function TypingText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : text.length)
  const ref = useRef(0)
  useEffect(() => {
    if (!animate || usesReducedMotion()) {
      setShown(text.length)
      return
    }
    ref.current = 0
    setShown(0)
    const step = Math.max(2, Math.ceil(text.length / 80))
    const timer = window.setInterval(() => {
      ref.current = Math.min(text.length, ref.current + step)
      setShown(ref.current)
      if (ref.current >= text.length) window.clearInterval(timer)
    }, 16)
    return () => window.clearInterval(timer)
  }, [text, animate])
  return (
    <>
      {text.slice(0, shown)}
      {shown < text.length ? <span className="ml-0.5 inline-block h-[0.95em] w-[2px] animate-pulse bg-cyan align-middle" /> : null}
    </>
  )
}

export function MessageItem({ message }: { message: Message }) {
  const { state, actions } = useDemo()
  const project = message.projectId ? state.projects.find((p) => p.id === message.projectId) : undefined

  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wider text-txt-faint">
          {message.content}
        </span>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(540px,88%)]">
          <div className="chat-user-bubble rounded-2xl rounded-br-md border border-cyan/15 bg-[linear-gradient(135deg,rgba(0,212,255,0.10),rgba(139,92,246,0.07))] px-3.5 py-2.5 text-[13px] leading-relaxed text-txt whitespace-pre-line">
            {message.content}
          </div>
          {message.attachments?.length ? (
            <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-txt-muted"
                >
                  {file.dataUrl && file.type.startsWith('image/') ? (
                    <img src={file.dataUrl} alt="" className="h-6 w-6 rounded object-cover" />
                  ) : (
                    <Paperclip className="h-3 w-3 shrink-0 text-txt-faint" aria-hidden="true" />
                  )}
                  <span className="truncate">{file.name}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex justify-end font-mono text-[9.5px] text-txt-faint">{formatClock(message.createdAt)}</div>
        </div>
      </div>
    )
  }

  const isDeliverable = message.kind === 'deliverable'
  const isError = message.kind === 'error'
  const isRevision = message.kind === 'revision'
  const isProgress = message.kind === 'progress'
  const isPlan = message.kind === 'plan'

  return (
    <div className="group flex gap-3">
      <AgentGlyph agent={EXECUTIVE_PRODUCER} size="sm" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11.5px] font-medium text-txt">Executive Producer</span>
          <span className="font-mono text-[9.5px] text-txt-faint">{formatClock(message.createdAt)}</span>
          {isPlan ? (
            <Badge mono tone="cyan">
              Production plan
            </Badge>
          ) : null}
          {isDeliverable ? (
            <Badge mono tone="violet">
              Deliverables
            </Badge>
          ) : null}
          {isRevision ? (
            <Badge mono tone="violet">
              Revision
            </Badge>
          ) : null}
        </div>

        <div
          className={cx(
            'mt-1.5 text-[13px] leading-[1.72] whitespace-pre-line',
            isError ? 'text-rose-100/90' : isProgress ? 'text-txt-muted' : 'text-txt-muted',
            isDeliverable ? 'text-txt-muted' : '',
          )}
        >
          {isError ? (
            <div className="flex gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-rose-100">{message.content}</div>
                {project ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button size="sm" variant="secondary" icon={Undo2} onClick={() => actions.retryProject(project.id)}>
                      Retry production
                    </Button>
                    <Link to={`/productions/${project.id}`}>
                      <Button size="sm" variant="ghost" iconRight={ArrowUpRight}>
                        Open project
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : isProgress ? (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-cyan/80" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-txt-muted">{message.content}</div>
                  {project && project.status !== 'completed' ? (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-txt-faint">
                      <Sparkles className="h-3 w-3 text-cyan/70" aria-hidden="true" />
                      {STAGES[project.stageIndex]?.name} · {Math.round(overallProgress(project) * 100)}% overall
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <TypingText text={message.content} animate={!isDeliverable} />
          )}
        </div>

        {isPlan && project ? <PlanCard project={project} /> : null}
        {isDeliverable ? <DeliverableCard project={project} title={message.meta?.title} /> : null}
        {isRevision && message.meta?.actionTo ? <ActionLink to={message.meta.actionTo} label={message.meta.actionLabel ?? 'Open production'} /> : null}
        {message.kind === 'note' && message.meta?.actionTo ? (
          <ActionLink to={message.meta.actionTo} label={message.meta.actionLabel ?? 'Open'} />
        ) : null}
      </div>
    </div>
  )
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-txt-muted transition-colors hover:border-cyan/25 hover:text-txt"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  )
}

export function PlanCard({ project }: { project: Project }) {
  const completed = project.stages.filter((s) => s.status === 'completed').length
  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a1017]/80">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="label text-[9px]">Plan · {project.format}</span>
        <span className="font-mono text-[9.5px] text-txt-faint tnum">
          {completed}/13 stages
        </span>
      </div>
      <div className="grid gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-2">
        {STAGES.map((stage, index) => {
          const state = project.stages.find((s) => s.id === stage.id)
          const done = state?.status === 'completed'
          const active = index === project.stageIndex && project.status !== 'completed'
          return (
            <div key={stage.id} className="flex items-center gap-2">
              {done ? (
                <CircleCheck className="h-3 w-3 shrink-0 text-cyan/80" aria-hidden="true" />
              ) : active ? (
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
                </span>
              ) : (
                <span className="h-3 w-3 shrink-0 rounded-full border border-white/15" aria-hidden="true" />
              )}
              <span className={cx('truncate text-[11px]', done ? 'text-txt-muted' : active ? 'text-txt' : 'text-txt-faint')}>
                {stage.name}
              </span>
              {active ? <span className="ml-auto font-mono text-[9px] text-cyan">live</span> : null}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">
          {project.status === 'completed' ? 'Delivery complete' : 'Demo team · local simulation'}
        </span>
        <Link
          to={`/productions/${project.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-cyan/90 hover:text-cyan"
        >
          Review
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export function DeliverableCard({ project, title }: { project?: Project; title?: string }) {
  const { actions } = useDemo()
  if (!project) {
    return (
      <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11.5px] text-txt-faint">
        Deliverables are being packaged. Open the production to inspect stage outputs.
      </div>
    )
  }
  const artifacts = project.artifacts
  const thumb = artifacts?.thumbnailDataUrl

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a1017]/90">
      <div className="flex flex-col gap-0 sm:flex-row">
        <Link
          to={`/productions/${project.id}`}
          className="group relative block w-full shrink-0 overflow-hidden sm:w-[230px]"
          aria-label={`Review ${artifacts?.title ?? title ?? project.title}`}
        >
          {thumb ? (
            <img
              src={thumb}
              alt={`${artifacts?.title ?? project.title} thumbnail`}
              className="aspect-video h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] sm:aspect-auto"
            />
          ) : (
            <div className="shimmer flex aspect-video h-full w-full items-center justify-center sm:aspect-auto">
              <ImageIcon className="h-5 w-5 text-txt-faint" aria-hidden="true" />
            </div>
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 font-mono text-[9px] text-white/90 backdrop-blur">
            <Play className="h-2.5 w-2.5 fill-current" /> Review
          </span>
          {artifacts ? (
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/80 backdrop-blur">
              {formatDuration(artifacts.durationSec)}
            </span>
          ) : null}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-txt">{artifacts?.title ?? title ?? project.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-txt-faint">
                <span>{platformLabel(project.platform)}</span>
                <span aria-hidden="true">·</span>
                <span>{artifacts?.languageLabel ?? project.language}</span>
                <span aria-hidden="true">·</span>
                <span>rev {project.revision}</span>
                <span aria-hidden="true">·</span>
                <span>{relativeTime(project.updatedAt)}</span>
              </div>
            </div>
            <StatusPill status={project.approved ? 'approved' : project.status} className="shrink-0" />
          </div>

          {artifacts ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {[
                { icon: FileText, label: 'Script' },
                { icon: Clock3, label: 'SRT' },
                { icon: ImageIcon, label: 'Thumbnail' },
                { icon: Check, label: 'QC report' },
              ].map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[9.5px] text-txt-faint"
                >
                  <item.icon className="h-2.5 w-2.5" aria-hidden="true" />
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex items-center gap-1.5 pt-2.5">
            <Link to={`/productions/${project.id}`} className="contents">
              <Button size="sm" variant="secondary" iconRight={ArrowUpRight} className="flex-1">
                Review deliverables
              </Button>
            </Link>
            {!project.approved && project.status === 'completed' ? (
              <Button size="sm" variant="primary" icon={Check} onClick={() => actions.approveProject(project.id)}>
                Approve
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
