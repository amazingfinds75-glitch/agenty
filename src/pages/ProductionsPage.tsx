import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertTriangle, CheckCircle2, MessageSquarePlus, Search, Sparkles } from 'lucide-react'
import { ProjectCard } from '../components/production/ProjectCard'
import { Button, EmptyState, Input, Stat, Tabs } from '../components/ui'
import { useDemo } from '../lib/store'
import type { ProjectStatus } from '../lib/types'
import { cx } from '../lib/utils'

type FilterId = 'all' | 'active' | 'completed' | 'failed'

const FILTERS: Record<FilterId, (status: ProjectStatus) => boolean> = {
  all: () => true,
  active: (status) => status === 'running' || status === 'paused',
  completed: (status) => status === 'completed',
  failed: (status) => status === 'failed' || status === 'cancelled',
}

export default function ProductionsPage() {
  const { state } = useDemo()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...state.projects]
      .filter((p) => FILTERS[filter](p.status))
      .filter((p) => !q || `${p.title} ${p.prompt} ${p.artifacts?.title ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [state.projects, filter, query])

  const counts = {
    all: state.projects.length,
    active: state.projects.filter((p) => FILTERS.active(p.status)).length,
    completed: state.projects.filter((p) => p.status === 'completed').length,
    failed: state.projects.filter((p) => FILTERS.failed(p.status)).length,
  }
  const working = state.projects.filter((p) => p.status === 'running').length
  const awaiting = state.projects.filter((p) => p.status === 'completed' && !p.approved).length
  const delivered = state.projects.filter((p) => p.status === 'completed').length

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Active Productions</h1>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-txt-faint tnum">
              {state.projects.length}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Every production the Executive Producer is coordinating — stages, agents and deliverables.
          </p>
        </div>
        <Link to="/">
          <Button variant="primary" icon={MessageSquarePlus}>
            New production
          </Button>
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="In production" value={String(working)} hint={working ? 'Agents actively working' : 'Nothing running'} icon={Activity} />
        <Stat label="Awaiting review" value={String(awaiting)} hint="Completed, not approved" icon={AlertTriangle} tone="amber" />
        <Stat label="Delivered" value={String(delivered)} hint="QC complete" icon={CheckCircle2} tone="emerald" />
        <Stat label="Demo agents" value="12" hint="One executive producer" icon={Sparkles} tone="violet" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'completed', label: 'Completed', count: counts.completed },
            { id: 'failed', label: 'Needs attention', count: counts.failed },
          ]}
          value={filter}
          onChange={setFilter}
          size="sm"
          ariaLabel="Filter productions"
        />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search productions"
            aria-label="Search productions"
            className="h-9 pl-9 text-[12.5px]"
          />
        </div>
      </div>

      <div className="mt-4">
        {projects.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className={cx('mt-2')}>
            <EmptyState
              icon={query ? Search : Activity}
              title={query ? 'No productions match that search' : 'Nothing in this view yet'}
              description={
                query
                  ? 'Try a different title, topic or platform keyword.'
                  : 'Brief the Executive Producer from the chat workspace and the production will appear here with live stage status.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Link to="/">
                    <Button variant="primary" icon={MessageSquarePlus}>
                      Start a production
                    </Button>
                  </Link>
                )
              }
            />
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[10px] text-txt-faint">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Progress is driven by a local simulation clock. Agents are not connected to real models in this demo.
      </p>
    </div>
  )
}
