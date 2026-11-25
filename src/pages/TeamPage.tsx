import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Info, Search } from 'lucide-react'
import { AGENTS, EXECUTIVE_PRODUCER } from '../lib/agents'
import { globalAgentStates } from '../lib/agentRuntime'
import { STAGES } from '../lib/pipeline'
import type { AgentDef, AgentRuntime } from '../lib/types'
import { AgentGlyph, Badge, Input, Stat, StatusPill } from '../components/ui'
import { useDemo } from '../lib/store'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Available',
  queued: 'Queued',
  working: 'Working',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Attention',
}

export default function TeamPage() {
  const { state } = useDemo()
  const [query, setQuery] = useState('')
  const runtime = useMemo(() => globalAgentStates(state.projects), [state.projects])

  const filtered = AGENTS.filter((agent) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.role.toLowerCase().includes(q) ||
      agent.skills.some((s) => s.toLowerCase().includes(q))
    )
  })

  const working = AGENTS.filter((a) => runtime[a.id]?.status === 'working').length
  const busy = AGENTS.filter((a) => {
    const s = runtime[a.id]?.status
    return s === 'working' || s === 'queued' || s === 'waiting'
  }).length
  const epState = runtime[EXECUTIVE_PRODUCER.id]

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">AI Team</h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-txt-muted">
            An Executive Producer plus twelve specialists. Each one owns a stage of the pipeline and reports status
            into the same production record.
          </p>
        </div>
        <Badge mono tone="warn">
          Demo engine · statuses come from the simulation
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Specialists" value={AGENTS.length} hint="12 roles" icon={Info} />
        <Stat label="Working now" value={working} hint={working ? 'Across productions' : 'All idle'} icon={Info} tone="cyan" />
        <Stat label="Engaged" value={busy} hint="Working, queued or waiting" icon={Info} tone="violet" />
        <Stat label="Pipeline stages" value={STAGES.length} hint="Each mapped to an owner" icon={Info} tone="emerald" />
      </div>

      <div className="mt-4 panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <AgentGlyph agent={EXECUTIVE_PRODUCER} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-txt">{EXECUTIVE_PRODUCER.name}</span>
              <StatusPill status={epState?.status ?? 'idle'} label={STATUS_LABEL[epState?.status ?? 'idle']} />
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-txt-muted">{EXECUTIVE_PRODUCER.description}</p>
            <p className="mt-1 text-[10px] text-txt-faint">
              {epState?.projectTitle ? `Currently: ${epState.task} · ${epState.projectTitle}` : 'Idle — waiting for a prompt.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {EXECUTIVE_PRODUCER.skills.map((skill) => (
              <span key={skill} className="rounded-md border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-txt-faint">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles or skills"
            aria-label="Search agents"
            className="pl-8"
          />
        </div>
        <span className="text-[10px] text-txt-faint">{filtered.length} of {AGENTS.length}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} runtime={runtime[agent.id]} />
        ))}
      </div>

      <div className="mt-4 panel p-4">
        <span className="label text-[9px]">Stage ownership</span>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {STAGES.map((stage) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-1.5">
              <span className="w-5 shrink-0 font-mono text-[9px] text-txt-faint">{String(stage.index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-txt-muted">{stage.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {stage.agentIds.map((id) => {
                  const agent = AGENTS.find((a) => a.id === id)
                  return agent ? <AgentGlyph key={id} agent={agent} size="xs" className="h-4 w-4 rounded-[4px]" /> : null
                })}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-txt-faint">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        Agent activity is simulated by the demo production engine. No external model or orchestration service is
        connected in this build.
      </p>
    </div>
  )
}

function AgentCard({ agent, runtime }: { agent: AgentDef; runtime?: AgentRuntime }) {
  const status = runtime?.status ?? 'idle'
  return (
    <div className="panel flex min-w-0 flex-col p-4">
      <div className="flex flex-wrap items-start gap-3">
        <AgentGlyph agent={agent} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12.5px] font-semibold text-txt">{agent.name}</span>
          </div>
          <p className="text-[10px] text-txt-faint">{agent.role}</p>
        </div>
        <StatusPill status={status} label={STATUS_LABEL[status]} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-txt-muted">{agent.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {agent.skills.map((skill) => (
          <span key={skill} className="rounded-md border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-txt-faint">
            {skill}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
        {runtime?.projectId ? (
          <>
            <span className="min-w-0 truncate text-[9.5px] text-txt-faint">{runtime.task}</span>
            <Link
              to={`/productions/${runtime.projectId}`}
              className="flex shrink-0 items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan"
            >
              Open <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <span className="text-[9.5px] text-txt-faint">Idle — no assigned task</span>
        )}
      </div>
    </div>
  )
}
