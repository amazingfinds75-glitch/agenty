import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Download, Film, MessageSquarePlus, Play, Search, Wand2 } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, Input, Stat, StatusPill, Tabs } from '../components/ui'
import { PlatformMark } from '../components/Brand'
import { useDemo } from '../lib/store'
import { baseName, downloadPng } from '../lib/exports'
import { formatDuration, platformLabel } from '../lib/utils'
import type { Platform } from '../lib/types'

type PlatformFilter = 'all' | Platform

export default function VideosPage() {
  const { state, pushToast } = useDemo()
  const [platform, setPlatform] = useState<PlatformFilter>('all')
  const [query, setQuery] = useState('')

  const videos = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.projects
      .filter((p) => p.status === 'completed' && p.artifacts)
      .filter((p) => platform === 'all' || p.platform === platform)
      .filter((p) => !q || `${p.artifacts?.title ?? p.title} ${p.prompt}`.toLowerCase().includes(q))
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
  }, [state.projects, platform, query])

  const allCompleted = state.projects.filter((p) => p.status === 'completed' && p.artifacts)
  const approved = allCompleted.filter((p) => p.approved).length
  const runtime = allCompleted.reduce((total, p) => total + (p.artifacts?.durationSec ?? 0), 0)
  const shorts = allCompleted.filter((p) => p.platform !== 'youtube-long').length

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">My Videos</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Finished cuts and their packages. Renders happen on demand in your browser.
          </p>
        </div>
        <Link to="/">
          <Button variant="primary" icon={MessageSquarePlus}>
            New production
          </Button>
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Delivered" value={String(allCompleted.length)} hint="QC complete" icon={Film} />
        <Stat label="Approved" value={String(approved)} hint="Cleared by you" icon={Check} tone="emerald" />
        <Stat label="Total runtime" value={formatDuration(runtime)} hint="Across all cuts" icon={Play} tone="violet" />
        <Stat label="9:16 formats" value={String(shorts)} hint="Shorts & Reels" icon={Wand2} tone="amber" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[
            { id: 'all', label: 'All', count: allCompleted.length },
            { id: 'youtube-short', label: 'Shorts', count: allCompleted.filter((p) => p.platform === 'youtube-short').length },
            { id: 'youtube-long', label: 'Long-form', count: allCompleted.filter((p) => p.platform === 'youtube-long').length },
            { id: 'instagram-reel', label: 'Reels', count: allCompleted.filter((p) => p.platform === 'instagram-reel').length },
          ]}
          value={platform}
          onChange={setPlatform}
          size="sm"
          ariaLabel="Filter by platform"
        />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your videos"
            aria-label="Search videos"
            className="h-9 pl-9 text-[12.5px]"
          />
        </div>
      </div>

      {videos.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((project) => {
            const artifacts = project.artifacts!
            const isVertical = project.platform !== 'youtube-long'
            return (
              <div key={project.id} className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f16]/70 transition-all duration-300 hover:border-cyan/20">
                <Link to={`/productions/${project.id}`} className="relative block overflow-hidden">
                  <div className={isVertical ? 'aspect-[4/5] sm:aspect-[16/11]' : 'aspect-video'}>
                    {artifacts.thumbnailDataUrl ? (
                      <img
                        src={isVertical && artifacts.coverDataUrl ? artifacts.coverDataUrl : artifacts.thumbnailDataUrl}
                        alt={`${artifacts.title} preview`}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="shimmer h-full w-full" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-white/85 backdrop-blur">
                    <PlatformMark platform={project.platform} className="h-3 w-3" />
                    {platformLabel(project.platform)}
                  </span>
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[9px] text-white/85 backdrop-blur">
                    {formatDuration(artifacts.durationSec)}
                  </span>
                  <span className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-transform group-hover:scale-105">
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </span>
                  <span className="absolute bottom-2.5 right-2 text-[10px] text-white/80">{artifacts.languageLabel}</span>
                </Link>

                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/productions/${project.id}`} className="min-w-0">
                      <h3 className="line-clamp-2 text-[12.5px] font-medium leading-snug text-txt hover:text-white">{artifacts.title}</h3>
                    </Link>
                    <StatusPill status={project.approved ? 'approved' : 'completed'} className="shrink-0" />
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-txt-faint">
                    <span>rev {project.revision}</span>
                    <span aria-hidden="true">·</span>
                    <span>{artifacts.scenes.length} scenes</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{project.format}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Link to={`/productions/${project.id}`} className="flex-1">
                      <Button variant="secondary" size="sm" iconRight={ArrowUpRight} className="w-full">
                        Open & render
                      </Button>
                    </Link>
                    <IconButton
                      label="Download thumbnail"
                      icon={Download}
                      onClick={() => {
                        if (!artifacts.thumbnailDataUrl) return
                        downloadPng(artifacts.thumbnailDataUrl, `${baseName(project)}-thumbnail.jpg`)
                        pushToast({ tone: 'success', title: 'Thumbnail downloaded' })
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Film}
            title={query || platform !== 'all' ? 'No videos match this view' : 'No finished videos yet'}
            description={
              query || platform !== 'all'
                ? 'Clear the filters to see everything that has finished QC.'
                : 'Videos appear here once their production reaches delivery and quality control completes.'
            }
            action={
              query || platform !== 'all' ? (
                <Button variant="secondary" onClick={() => { setQuery(''); setPlatform('all') }}>
                  Clear filters
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge mono className="border-amber-400/20 text-amber-200/80">Demo cuts</Badge>
        <span className="text-[10px] text-txt-faint">
          Cuts are recorded from a canvas timeline on demand. Thumbnails and covers are real generated JPEGs; copy is demo-grade.
        </span>
      </div>
    </div>
  )
}
