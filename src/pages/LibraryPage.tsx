import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Info,
  Music,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  Stat,
  Tabs,
} from '../components/ui'
import { downloadBlob, downloadDataUrl, downloadText, scriptMarkdown } from '../lib/exports'
import { useDemo } from '../lib/store'
import { speak, stopSpeaking, ttsSupported } from '../lib/voice'
import type { MediaAsset, MediaType, Project } from '../lib/types'
import { formatBytes, formatDate } from '../lib/utils'

type Filter = 'all' | MediaType | 'uploads'

const TYPE_ICON: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All assets' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'Documents' },
  { id: 'uploads', label: 'Uploads' },
]

export default function LibraryPage() {
  const { state, actions, pushToast } = useDemo()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<MediaAsset | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MediaAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [narration, setNarration] = useState<MediaAsset | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const media = state.media
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return media.filter((asset) => {
      if (filter === 'uploads' && asset.source !== 'uploaded') return false
      if (filter !== 'all' && filter !== 'uploads' && asset.type !== filter) return false
      if (!q) return true
      return asset.name.toLowerCase().includes(q) || (asset.detail ?? '').toLowerCase().includes(q)
    })
  }, [media, filter, query])

  const totals = useMemo(() => {
    const generated = media.filter((m) => m.source === 'generated').length
    const uploads = media.filter((m) => m.source === 'uploaded').length
    const bytes = media.reduce((sum, m) => sum + (m.size || 0), 0)
    return { generated, uploads, bytes }
  }, [media])

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    try {
      await actions.addUploads(list)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const projectFor = (asset: MediaAsset) =>
    asset.projectId ? state.projects.find((p) => p.id === asset.projectId) : undefined

  const download = (asset: MediaAsset) => {
    const project = projectFor(asset)
    if (asset.assetKind === 'script' && project?.artifacts) {
      downloadText(scriptMarkdown(project), `${asset.name}.md`, 'text/markdown;charset=utf-8')
      return
    }
    if (asset.assetKind === 'srt' && project?.artifacts) {
      downloadText(project.artifacts.srt, `${project.title}.srt`.replace(/[\\/:*?"<>|]+/g, '-'), 'text/plain;charset=utf-8')
      return
    }
    if (!asset.url) {
      pushToast({ tone: 'error', title: 'Nothing to download', description: 'This asset is a session-only preview.' })
      return
    }
    if (asset.type === 'image') {
      const filename = asset.name.replace(/\s+/g, '-').toLowerCase()
      downloadDataUrl(asset.url, /\.(jpe?g|png|webp|gif)$/i.test(filename) ? filename : `${filename}.jpg`)
      pushToast({ tone: 'success', title: 'Asset downloaded' })
      return
    }
    void fetch(asset.url)
      .then((res) => res.blob())
      .then((blob) => downloadBlob(blob, asset.name))
      .then(() => pushToast({ tone: 'success', title: 'Asset downloaded' }))
      .catch(() => pushToast({ tone: 'error', title: 'Download failed', description: 'The local asset URL may have expired. Re-render or re-upload it.' }))
  }

  const playNarration = (asset: MediaAsset) => {
    const project = projectFor(asset)
    const artifacts = project?.artifacts
    if (!artifacts) return
    if (!ttsSupported()) {
      pushToast({ tone: 'error', title: 'Voice preview unavailable', description: 'This browser does not expose speech synthesis.' })
      return
    }
    setNarration(asset)
    setSpeaking(true)
    speak(artifacts.hook + '. ' + artifacts.scenes.slice(0, 2).map((s) => s.narration).join(' '), artifacts.language, {
      onEnd: () => setSpeaking(false),
      onError: (message) => {
        setSpeaking(false)
        pushToast({ tone: 'error', title: 'Voice preview failed', description: message })
      },
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Media Library</h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-txt-muted">
            Generated thumbnails, covers, scripts, captions and your own uploads. Everything stays in this browser.
          </p>
        </div>
        <Button variant="primary" icon={Upload} loading={uploading} onClick={() => inputRef.current?.click()}>
          Upload files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx"
          className="sr-only"
          aria-label="Upload files to the media library"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files)
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Assets" value={media.length} hint="Current library" icon={ImageIcon} />
        <Stat label="Generated" value={totals.generated} hint="By productions" icon={Film} tone="violet" />
        <Stat label="Uploads" value={totals.uploads} hint="Max 5 MB each" icon={Upload} tone="emerald" />
        <Stat label="Approx. size" value={formatBytes(totals.bytes)} hint="Estimated, local only" icon={Info} tone="amber" />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
        }}
        className={`mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
          dragOver ? 'border-cyan/50 bg-cyan/[0.06]' : 'border-white/10 bg-white/[0.015]'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-txt-muted">
          <Upload className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
          Drop files here or use Upload. Images under 1.2 MB are stored as data URLs; larger files stay preview-only.
        </div>
        <Badge mono tone="warn">Local demo storage</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Tabs ariaLabel="Filter media" tabs={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} size="sm" />
        <div className="relative ml-auto w-full max-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets"
            aria-label="Search media"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={ImageIcon}
            title={media.length ? 'No matching assets' : 'Your library is empty'}
            description={
              media.length
                ? 'Adjust the filter or search to find an asset. Generated assets appear once a production creates them.'
                : 'Upload a reference image or finish a production. Generated artwork and scripts land here automatically.'
            }
            action={
              <Button variant="primary" icon={Upload} onClick={() => inputRef.current?.click()}>
                Upload files
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              projectTitle={projectFor(asset)?.title}
              onPreview={() => {
                if (asset.assetKind === 'narration') {
                  playNarration(asset)
                  return
                }
                setPreview(asset)
              }}
              onDownload={() => download(asset)}
              onDelete={() => setPendingDelete(asset)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-txt-faint">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        Media is stored locally in this browser (localStorage for small images, in-memory for larger files and video
        renders). Nothing is uploaded to a server. Clearing site data removes everything. Generated entries can be
        recreated from their production.
      </p>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name}
        description={preview?.detail}
        size="lg"
        footer={
          preview ? (
            <>
              <Button variant="ghost" icon={X} onClick={() => setPreview(null)}>
                Close
              </Button>
              <Button variant="primary" icon={Download} onClick={() => download(preview)} disabled={!preview.url}>
                Download
              </Button>
            </>
          ) : null
        }
      >
        {preview ? <AssetPreview asset={preview} project={projectFor(preview)} /> : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Remove asset?"
        description={pendingDelete?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                if (pendingDelete) actions.removeMedia(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-[12px] leading-relaxed text-txt-muted">
          This removes the entry from your library. Generated files can be recreated by refreshing artwork or
          downloading again from the production; uploaded files are gone from this browser.
        </p>
      </Modal>

      <Modal
        open={Boolean(narration)}
        onClose={() => {
          stopSpeaking()
          setSpeaking(false)
          setNarration(null)
        }}
        title="Narration preview"
        description={narration?.name}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                stopSpeaking()
                setSpeaking(false)
              }}
              disabled={!speaking}
            >
              Stop
            </Button>
            <Button variant="primary" icon={Play} onClick={() => narration && playNarration(narration)}>
              {speaking ? 'Restart' : 'Play preview'}
            </Button>
          </>
        }
      >
        <p className="text-[12px] leading-relaxed text-txt-muted">
          {speaking ? 'Playing the opening of the script with your browser’s built-in voice.' : 'Uses your browser’s speech synthesis voice in the production language. Audio is not rendered to a file.'}
        </p>
      </Modal>
    </div>
  )
}

function MediaCard({
  asset,
  projectTitle,
  onPreview,
  onDownload,
  onDelete,
}: {
  asset: MediaAsset
  projectTitle?: string
  onPreview: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const Icon = TYPE_ICON[asset.type]
  const canPreview = Boolean(asset.url) || asset.assetKind === 'narration' || asset.assetKind === 'script' || asset.assetKind === 'srt'
  return (
    <div className="panel group flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => canPreview && onPreview()}
        disabled={!canPreview}
        aria-label={canPreview ? `Preview ${asset.name}` : `${asset.name} has no preview`}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-black/40 text-left disabled:cursor-default"
      >
        {asset.type === 'image' && asset.thumbnail ? (
          <img src={asset.thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(0,212,255,0.12),transparent_60%)]">
            <Icon className="h-7 w-7 text-white/25" aria-hidden="true" />
          </div>
        )}
        {asset.type === 'video' && canPreview ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur">
              <Play className="ml-0.5 h-3.5 w-3.5 text-white" aria-hidden="true" />
            </span>
          </span>
        ) : null}
        <span className="absolute left-2 top-2">
          <Badge tone={asset.source === 'uploaded' ? 'violet' : 'cyan'} mono>
            {asset.source === 'uploaded' ? 'Upload' : 'Generated'}
          </Badge>
        </span>
        {asset.sessionOnly ? (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-200">
            Session only
          </span>
        ) : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium text-txt" title={asset.name}>
              {asset.name}
            </p>
            <p className="mt-0.5 truncate text-[9.5px] text-txt-faint">{asset.detail ?? asset.type}</p>
          </div>
          <Menu
            label={`Actions for ${asset.name}`}
            trigger={<IconButton label={`Actions for ${asset.name}`} icon={ArrowUpRight} />}
            items={[
              ...(canPreview ? [{ label: asset.assetKind === 'narration' ? 'Play preview' : 'Open preview', icon: Play, onClick: onPreview }] : []),
              { label: 'Download', icon: Download, onClick: onDownload, disabled: !asset.url && asset.assetKind !== 'script' && asset.assetKind !== 'srt' },
              { label: 'Remove from library', icon: Trash2, onClick: onDelete, danger: true },
            ]}
          />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[9px] text-txt-faint">
          <span className="truncate">{projectTitle ?? formatDate(asset.createdAt)}</span>
          <span className="shrink-0 font-mono">{asset.size ? formatBytes(asset.size) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

function AssetPreview({ asset, project }: { asset: MediaAsset; project?: Project }) {
  if (asset.type === 'image' && asset.url) {
    return <img src={asset.url} alt={asset.name} className="max-h-[64vh] w-full rounded-xl border border-white/10 object-contain" />
  }
  if (asset.type === 'video' && asset.url) {
    return <video src={asset.url} controls className="max-h-[64vh] w-full rounded-xl border border-white/10 bg-black" />
  }
  if (asset.assetKind === 'script' && project?.artifacts) {
    return (
      <pre className="scroll-thin max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[10.5px] leading-relaxed text-txt-muted">
        {scriptMarkdown(project)}
      </pre>
    )
  }
  if (asset.assetKind === 'srt' && project?.artifacts) {
    return (
      <pre className="scroll-thin max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[10.5px] leading-relaxed text-txt-muted">
        {project.artifacts.srt}
      </pre>
    )
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-5 text-center">
      <FileText className="mx-auto h-6 w-6 text-white/30" aria-hidden="true" />
      <p className="mt-2 text-[11.5px] text-txt-muted">
        No inline preview for this asset. {project ? 'Open the production for the full package.' : 'Download it or re-upload it from this browser.'}
      </p>
      {project ? (
        <Link to={`/productions/${project.id}`} className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-cyan hover:text-cyan/80">
          Open production <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )
}
