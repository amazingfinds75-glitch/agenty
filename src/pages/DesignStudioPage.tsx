import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Check,
  Download,
  Image as ImageIcon,
  Info,
  Palette,
  RefreshCcw,
  Sparkles,
} from 'lucide-react'
import { StudioProjectBar } from '../components/production/StudioProjectBar'
import { Badge, Button, EmptyState, IconButton } from '../components/ui'
import { baseName, downloadPng } from '../lib/exports'
import { useDemo } from '../lib/store'
import { platformLabel } from '../lib/utils'

const PALETTE = [
  { name: 'Ink 950', hex: '#07090D' },
  { name: 'Ink 900', hex: '#0B1018' },
  { name: 'Ink 800', hex: '#111923' },
  { name: 'Cyan', hex: '#00D4FF' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Text', hex: '#F5F7FA' },
  { name: 'Muted', hex: '#929EAD' },
]

export default function DesignStudioPage() {
  const { state, actions, pushToast } = useDemo()
  const [params, setParams] = useSearchParams()
  const [refreshing, setRefreshing] = useState(false)

  const projects = useMemo(
    () => state.projects.filter((p) => p.artifacts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.projects],
  )
  const paramId = params.get('project')
  const initial = projects.find((p) => p.id === paramId) ?? projects[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const project = projects.find((p) => p.id === selectedId) ?? projects[0]
  const artifacts = project?.artifacts

  const selectProject = (id: string) => {
    setSelectedId(id)
    setParams({ project: id }, { replace: true })
  }

  const refresh = async () => {
    if (!project) return
    setRefreshing(true)
    try {
      await actions.refreshArtwork(project.id)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Design Studio</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Real generated thumbnails and covers, drawn locally on canvas with the production’s theme.
          </p>
        </div>
        {project ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={RefreshCcw} onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Redrawing…' : 'Regenerate artwork'}
            </Button>
            <Link to={`/productions/${project.id}`}>
              <Button variant="ghost" icon={ArrowUpRight}>
                Production
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <StudioProjectBar
          projects={projects}
          selectedId={project?.id}
          onSelect={selectProject}
          emptyNote="No artwork yet. Finish or start a production to generate its thumbnail and cover."
        />
      </div>

      {project && artifacts ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ArtworkPanel
                  label="Landscape thumbnail"
                  meta="1280 × 720 · 16:9"
                  src={artifacts.thumbnailDataUrl}
                  aspect="aspect-video"
                  onDownload={() => {
                    if (!artifacts.thumbnailDataUrl) return
                    downloadPng(artifacts.thumbnailDataUrl, `${baseName(project)}-thumbnail.jpg`)
                    pushToast({ tone: 'success', title: 'Thumbnail downloaded' })
                  }}
                  onRefresh={refresh}
                />
                <ArtworkPanel
                  label="Portrait cover"
                  meta="720 × 1280 · 9:16"
                  src={artifacts.coverDataUrl}
                  aspect="aspect-[9/16] max-h-[420px]"
                  onDownload={() => {
                    if (!artifacts.coverDataUrl) return
                    downloadPng(artifacts.coverDataUrl, `${baseName(project)}-cover.jpg`)
                    pushToast({ tone: 'success', title: 'Cover downloaded' })
                  }}
                  onRefresh={refresh}
                />
              </div>

              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <span className="label text-[9px]">Artwork details</span>
                  <Badge mono tone="cyan">Canvas render</Badge>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
                  {[
                    ['Title', artifacts.title],
                    ['Platform', platformLabel(project.platform)],
                    ['Language', artifacts.languageLabel],
                    ['Theme accent', artifacts.theme.accent],
                    ['Hook', artifacts.hook],
                    ['Revision', String(project.revision)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex min-w-0 items-start justify-between gap-3 border-b border-white/[0.04] py-1 last:border-0">
                      <span className="shrink-0 text-txt-faint">{label}</span>
                      <span className="min-w-0 truncate text-right text-txt-muted">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-txt-faint">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Regenerating redraws both formats with the current copy.
                  </span>
                  <Link
                    to={`/script?project=${project.id}`}
                    className="ml-auto text-[10.5px] text-cyan/80 hover:text-cyan"
                  >
                    Change copy in Script Studio →
                  </Link>
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              <div className="panel p-4">
                <div className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
                  <span className="label text-[9px]">Studio palette</span>
                </div>
                <div className="mt-2 space-y-1">
                  {PALETTE.map((color) => (
                    <div key={color.name} className="flex items-center gap-2">
                      <span
                        className="h-5 w-5 shrink-0 rounded border border-white/15"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-[10.5px] text-txt-muted">{color.name}</span>
                      <span className="ml-auto font-mono text-[9px] text-txt-faint">{color.hex}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[9.5px] leading-relaxed text-txt-faint">
                  Thumbnails are drawn with this system. Cyan and violet stay sparse — the canvas remains mostly dark.
                </p>
              </div>

              <div className="panel p-4">
                <span className="label text-[9px]">Format readiness</span>
                <div className="mt-2 space-y-1.5">
                  {[
                    { label: 'YouTube 16:9', ready: Boolean(artifacts.thumbnailDataUrl) },
                    { label: 'Instagram 9:16', ready: Boolean(artifacts.coverDataUrl) },
                    {
                      label: 'Safe title area',
                      ready: Boolean(artifacts.thumbnailDataUrl || artifacts.coverDataUrl),
                    },
                    {
                      label: 'Language lockup',
                      ready: Boolean(artifacts.thumbnailDataUrl || artifacts.coverDataUrl),
                    },
                    {
                      label: 'Brand watermark',
                      ready: Boolean(artifacts.thumbnailDataUrl || artifacts.coverDataUrl),
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-1.5">
                      <span className="text-[10.5px] text-txt-muted">{row.label}</span>
                      <span className={row.ready ? 'text-emerald-300' : 'text-amber-300'}>
                        {row.ready ? <Check className="h-3 w-3" aria-hidden="true" /> : <ImageIcon className="h-3 w-3" aria-hidden="true" />}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[9.5px] leading-relaxed text-txt-faint">
                <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                Templates and generated artwork are illustrative. No external image model is connected; every export is drawn on a local canvas.
              </div>
            </aside>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Palette}
            title="Nothing to design yet"
            description="Thumbnails and covers are generated from a production’s title, hook and theme. Start a production to see them here."
            action={
              <Link to="/">
                <Button variant="primary" icon={Palette}>
                  Start a production
                </Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}

function ArtworkPanel({
  label,
  meta,
  src,
  aspect,
  onDownload,
  onRefresh,
}: {
  label: string
  meta: string
  src?: string
  aspect: string
  onDownload: () => void
  onRefresh: () => void
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="label text-[9px]">{label}</span>
        <span className="font-mono text-[9px] text-txt-faint">{meta}</span>
      </div>
      <div className={`relative w-full overflow-hidden bg-black/40 ${aspect}`}>
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <RefreshCcw className="h-4 w-4 text-txt-faint" aria-hidden="true" />
            <span className="text-[10px] leading-relaxed text-txt-faint">
              Artwork is out of date after copy edits. Regenerate to redraw it.
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Button size="sm" variant="secondary" icon={Download} className="flex-1" onClick={onDownload} disabled={!src}>
          Download
        </Button>
        <IconButton label={`Regenerate ${label}`} icon={RefreshCcw} onClick={onRefresh} />
      </div>
    </div>
  )
}
