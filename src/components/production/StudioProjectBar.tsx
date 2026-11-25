import { Film } from 'lucide-react'
import type { Project } from '../../lib/types'
import { cx, formatDuration, platformLabel } from '../../lib/utils'
import { PlatformMark } from '../Brand'
import { StatusPill } from '../ui'

export function StudioProjectBar({
  projects,
  selectedId,
  onSelect,
  emptyNote,
}: {
  projects: Project[]
  selectedId?: string
  onSelect: (id: string) => void
  emptyNote: string
}) {
  if (!projects.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/12 px-3 py-3 text-[11.5px] text-txt-faint">
        <Film className="h-3.5 w-3.5" aria-hidden="true" />
        {emptyNote}
      </div>
    )
  }
  return (
    <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Select a production">
      {projects.map((project) => {
        const active = project.id === selectedId
        return (
          <button
            key={project.id}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(project.id)}
            className={cx(
              'flex w-[220px] shrink-0 items-center gap-2 rounded-xl border p-1.5 text-left transition-colors sm:w-[260px]',
              active
                ? 'border-cyan/30 bg-cyan/[0.06]'
                : 'border-white/[0.07] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]',
            )}
          >
            <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-black/40">
              {project.artifacts?.thumbnailDataUrl ? (
                <img src={project.artifacts.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="shimmer h-full w-full" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] text-txt">{project.artifacts?.title ?? project.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-txt-faint">
                <PlatformMark platform={project.platform} className="h-2.5 w-2.5" />
                <span className="truncate">{platformLabel(project.platform)}</span>
                <span aria-hidden="true">·</span>
                {project.artifacts ? formatDuration(project.artifacts.durationSec) : '—'}
              </div>
            </div>
            {active ? <StatusPill status={project.approved ? 'approved' : project.status} className="shrink-0" /> : null}
          </button>
        )
      })}
    </div>
  )
}
