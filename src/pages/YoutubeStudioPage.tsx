import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Info,
  MonitorPlay,
  Play,
  Save,
  Undo2,
  Upload,
} from 'lucide-react'
import { StudioProjectBar } from '../components/production/StudioProjectBar'
import { Badge, Button, CheckRow, EmptyState, Input, StatusPill, Textarea } from '../components/ui'
import { copyText, downloadText, baseName, scriptMarkdown } from '../lib/exports'
import { useDemo } from '../lib/store'
import type { Project } from '../lib/types'
import { cx, formatDuration, platformLabel } from '../lib/utils'

export default function YoutubeStudioPage() {
  const { state, actions, pushToast } = useDemo()
  const [params, setParams] = useSearchParams()

  const projects = useMemo(
    () =>
      state.projects
        .filter((p) => p.status === 'completed' && p.artifacts)
        .sort((a, b) => Number(a.platform === 'instagram-reel') - Number(b.platform === 'instagram-reel') || (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [state.projects],
  )
  const paramId = params.get('project')
  const initial = projects.find((p) => p.id === paramId) ?? projects[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const project = projects.find((p) => p.id === selectedId) ?? projects[0]

  const [title, setTitle] = useState(project?.artifacts?.youtubeTitle ?? '')
  const [description, setDescription] = useState(project?.artifacts?.description ?? '')
  const [tags, setTags] = useState(project?.artifacts?.youtubeTags.join(', ') ?? '')

  const selectProject = (id: string) => {
    const next = projects.find((p) => p.id === id)
    setSelectedId(id)
    setParams({ project: id }, { replace: true })
    if (next?.artifacts) {
      setTitle(next.artifacts.youtubeTitle)
      setDescription(next.artifacts.description)
      setTags(next.artifacts.youtubeTags.join(', '))
    }
  }

  const artifacts = project?.artifacts
  const dirty =
    Boolean(artifacts) &&
    (title !== artifacts!.youtubeTitle ||
      description !== artifacts!.description ||
      tags !== artifacts!.youtubeTags.join(', '))

  const save = () => {
    if (!project) return
    actions.updateArtifact(project.id, {
      youtubeTitle: title.trim(),
      description,
      youtubeTags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    })
    pushToast({ tone: 'success', title: 'YouTube metadata saved', description: 'Stored locally with the production.' })
  }

  const revert = () => {
    if (!artifacts) return
    setTitle(artifacts.youtubeTitle)
    setDescription(artifacts.description)
    setTags(artifacts.youtubeTags.join(', '))
    pushToast({ tone: 'info', title: 'Unsaved edits reverted' })
  }

  const copyAll = async () => {
    if (!artifacts) return
    const text = `TITLE\n${title}\n\nDESCRIPTION\n${description}\n\nTAGS\n${tags}`
    const ok = await copyText(text)
    pushToast(
      ok
        ? { tone: 'success', title: 'YouTube package copied' }
        : { tone: 'error', title: 'Clipboard unavailable', description: 'Select the fields manually to copy.' },
    )
  }

  const isShort = project?.platform === 'youtube-short'
  const duration = artifacts?.durationSec ?? 0
  const chapters = /00:00/.test(description)

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">YouTube Studio</h1>
            <Badge mono tone="warn">OAuth not connected</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Prepare titles, descriptions and tags, then upload manually. Nothing is pushed to YouTube from this demo.
          </p>
        </div>
        {project ? (
          <Link to={`/productions/${project.id}`}>
            <Button variant="secondary" icon={ArrowUpRight}>
              Open production
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <StudioProjectBar
          projects={projects}
          selectedId={project?.id}
          onSelect={selectProject}
          emptyNote="No completed YouTube productions yet. Finish a production to prepare its metadata."
        />
      </div>

      {project && artifacts ? (
        <>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="flex-1 text-[11px] leading-relaxed text-amber-100/85">
              YouTube integration is disconnected. Copy the package below into YouTube Studio yourself, or{' '}
              <Link to="/settings" className="underline underline-offset-2 hover:text-white">
                review integration settings
              </Link>
              .
            </p>
            <Button size="sm" variant="secondary" icon={Upload} disabled>
              Upload
            </Button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="label text-[9px]">Upload metadata</span>
                  <div className="flex items-center gap-1.5">
                    {dirty ? <Badge mono tone="warn">Unsaved</Badge> : <Badge mono tone="success">Saved</Badge>}
                    <Button size="sm" variant="ghost" icon={Undo2} disabled={!dirty} onClick={revert}>
                      Revert
                    </Button>
                    <Button size="sm" variant="primary" icon={Save} disabled={!dirty || !title.trim()} onClick={save}>
                      Save
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <label className="block text-[11px] text-txt-muted">
                    <span className="flex items-center justify-between">
                      Title
                      <span className={cx('font-mono text-[9.5px]', title.length > 100 ? 'text-rose-300' : title.length > 70 ? 'text-amber-300' : 'text-txt-faint')}>
                        {title.length}/100
                      </span>
                    </span>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1" maxLength={140} />
                  </label>

                  <label className="block text-[11px] text-txt-muted">
                    <span className="flex items-center justify-between">
                      Description
                      <span className="font-mono text-[9.5px] text-txt-faint">{description.length} characters</span>
                    </span>
                    <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={9} className="mt-1 font-mono text-[11.5px]" />
                  </label>

                  <label className="block text-[11px] text-txt-muted">
                    Tags <span className="text-txt-faint">· comma separated</span>
                    <Input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1" />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                      <span key={tag} className="rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[9.5px] text-txt-faint">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <Button size="sm" variant="secondary" icon={Copy} onClick={copyAll}>
                    Copy package
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Download}
                    onClick={() => {
                      downloadText(scriptMarkdown(project), `${baseName(project)}-script.md`, 'text/markdown;charset=utf-8')
                      pushToast({ tone: 'success', title: 'Script downloaded' })
                    }}
                  >
                    Script
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    onClick={() => {
                      downloadText(artifacts.srt, `${baseName(project)}.srt`, 'application/x-subrip;charset=utf-8')
                      pushToast({ tone: 'success', title: 'Captions downloaded' })
                    }}
                  >
                    SRT
                  </Button>
                  {project.approved ? (
                    <StatusPill status="approved" className="ml-auto" />
                  ) : (
                    <Link to={`/productions/${project.id}`} className="ml-auto">
                      <Button size="sm" variant="primary" icon={Check}>
                        Review & approve
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <span className="label text-[9px]">Upload readiness</span>
                  <span className="font-mono text-[9px] text-txt-faint">Human upload required</span>
                </div>
                <div className="mt-1 divide-y divide-white/[0.04]">
                  <CheckRow status={project.approved ? 'pass' : 'warn'}>
                    Deliverables approved {project.approved ? '— cleared for publishing prep' : '— review before upload'}
                  </CheckRow>
                  <CheckRow status={artifacts.thumbnailDataUrl ? 'pass' : 'warn'}>
                    Thumbnail {artifacts.thumbnailDataUrl ? '1280×720 JPEG ready' : 'missing'}
                  </CheckRow>
                  <CheckRow status={title.trim().length >= 8 && title.trim().length <= 100 ? 'pass' : 'warn'}>
                    Title length {title.trim().length}/100 {title.trim().length > 100 ? '— too long for YouTube' : ''}
                  </CheckRow>
                  <CheckRow status={chapters ? 'pass' : 'warn'}>
                    Description {chapters ? 'includes chapter timestamps' : 'has no chapters — recommended for long-form'}
                  </CheckRow>
                  <CheckRow status={isShort ? (duration <= 60 ? 'pass' : 'fail') : duration > 60 ? 'pass' : 'warn'}>
                    Format {isShort ? `Short · ${formatDuration(duration)} ${duration <= 60 ? 'within 60s' : 'exceeds Shorts limit'}` : `Long-form · ${formatDuration(duration)}`}
                  </CheckRow>
                  <CheckRow status="fail">
                    YouTube upload integration — not connected. Manual upload only.
                  </CheckRow>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="panel overflow-hidden">
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <span className="label text-[9px]">Preview</span>
                </div>
                <div className="p-3">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                    {artifacts.thumbnailDataUrl ? (
                      <img src={artifacts.thumbnailDataUrl} alt="Thumbnail preview" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="shimmer aspect-video" />
                    )}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <PlatformPreview duration={duration} />
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[12px] font-medium leading-snug text-txt">{title || 'Untitled video'}</div>
                      <div className="mt-1 text-[10px] text-txt-faint">
                        AI Viral Studio · {project.artifacts?.languageLabel}
                      </div>
                      <div className="text-[10px] text-txt-faint">{project.approved ? 'Approved for upload prep' : 'Pending review'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel p-4">
                <span className="label text-[9px]">Production details</span>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  {[
                    ['Platform', platformLabel(project.platform)],
                    ['Language', artifacts.languageLabel],
                    ['Duration', formatDuration(artifacts.durationSec)],
                    ['Scenes', String(artifacts.scenes.length)],
                    ['Revision', String(project.revision)],
                    ['Generated', new Date(project.completedAt ?? project.updatedAt).toLocaleDateString()],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-txt-faint">{label}</span>
                      <span className="text-txt-muted">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-txt-faint">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Metadata is demo-generated and editable. Verify claims, titles and tags before uploading to a real channel.
              </div>
            </aside>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={MonitorPlay}
            title="No YouTube package yet"
            description="Complete a production and return here to prepare its upload metadata. Everything is generated locally and downloadable."
            action={
              <Link to="/">
                <Button variant="primary" icon={Play}>
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

function PlatformPreview({ duration }: { duration: number }) {
  return (
    <div className="relative h-[52px] w-[92px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/50">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(139,92,246,0.14))]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-white/10">
          <Play className="h-2.5 w-2.5 fill-current text-white" />
        </div>
      </div>
      <span className="absolute bottom-0.5 right-1 rounded bg-black/70 px-1 font-mono text-[8px] text-white/90">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
