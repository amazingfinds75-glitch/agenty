import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Clock3, Film, Loader2 } from 'lucide-react'
import { useDemo } from '../../lib/store'
import { projectAgentStates } from '../../lib/agentRuntime'
import { AGENT_MAP } from '../../lib/agents'
import { STAGES } from '../../lib/pipeline'
import type { Project } from '../../lib/types'
import { cx, formatDuration, platformLabel, relativeTime } from '../../lib/utils'
import { AgentGlyph, Badge, Progress, StatusPill } from '../ui'
import { overallProgress } from './ProductionPanel'

export function ProjectCard({ project }: { project: Project }) {
  const { state } = useDemo()
  const agentStates = projectAgentStates(project)
  const workingAgents = Object.values(agentStates)
    .filter((a) => a.status === 'working')
    .map((a) => AGENT_MAP[a.agentId])
    .filter(Boolean)
  const progress = overallProgress(project)
  const thumb = project.artifacts?.thumbnailDataUrl
  const session = state.sessions.find((s) => s.projectIds.includes(project.id))

  return (
    <Link
      to={`/productions/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f16]/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/20 hover:bg-[#0c131c]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
    >
      <div className="flex gap-0">
        <div className="relative w-[132px] shrink-0 overflow-hidden bg-black/40 sm:w-[168px]">
          {thumb ? (
            <img
              src={project.artifacts?.coverDataUrl ?? thumb}
              alt=""
              className={cx(
                'h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]',
                project.platform === 'instagram-reel' ? 'object-center' : 'object-center',
              )}
            />
          ) : (
            <div className="shimmer flex h-full min-h-[112px] w-full items-center justify-center">
              <Film className="h-4 w-4 text-txt-faint" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0f16]/40" />
          {project.status === 'running' ? (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-cyan backdrop-blur">
              <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" /> Live
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">
                  {platformLabel(project.platform)}
                </span>
                {project.approved ? (
                  <span className="inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                    <Check className="h-2.5 w-2.5" /> approved
                  </span>
                ) : null}
              </div>
              <h3 className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-snug text-txt">
                {project.artifacts?.title ?? project.title}
              </h3>
            </div>
            <StatusPill status={project.status} className="shrink-0" />
          </div>

          <div className="mt-auto pt-2">
            <div className="flex items-center justify-between gap-2 text-[9.5px] text-txt-faint">
              <span className="truncate">
                {project.status === 'completed'
                  ? `Delivered ${relativeTime(project.completedAt ?? project.updatedAt)}`
                  : project.status === 'failed'
                    ? 'Stage failed — needs retry'
                    : STAGES[project.stageIndex]?.name}
              </span>
              <span className="shrink-0 font-mono tnum">{Math.round(progress * 100)}%</span>
            </div>
            <Progress
              value={progress}
              height={3}
              className="mt-1.5"
              tone="mixed"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {workingAgents.length ? (
                  <div className="flex -space-x-1">
                    {workingAgents.slice(0, 4).map((agent) => (
                      <AgentGlyph key={agent.id} agent={agent} size="xs" className="h-4 w-4 rounded-full ring-1 ring-[#0a0f16]" />
                    ))}
                  </div>
                ) : null}
                <span className="inline-flex items-center gap-1 text-[9.5px] text-txt-faint">
                  <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
                  {project.artifacts ? formatDuration(project.artifacts.durationSec) : '—'}
                </span>
                {session ? (
                  <span className="hidden truncate text-[9.5px] text-txt-faint sm:inline">· {session.title}</span>
                ) : null}
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-txt-faint/50 transition-colors group-hover:text-cyan" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {project.demo ? (
        <div className="flex items-center justify-between border-t border-white/[0.05] px-3 py-1.5">
          <span className="font-mono text-[8.5px] uppercase tracking-wider text-txt-faint">
            Demo pipeline · rev {project.revision}
          </span>
          <Badge mono className="border-transparent bg-transparent px-0 text-amber-200/60">
            simulated
          </Badge>
        </div>
      ) : null}
    </Link>
  )
}
