import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Check,
  Copy,
  Download,
  Hash,
  Image as ImageIcon,
  Info,
  Save,
  Share2,
  Undo2,
} from 'lucide-react'
import { InstagramMark } from '../components/Brand'
import { StudioProjectBar } from '../components/production/StudioProjectBar'
import { Badge, Button, CheckRow, EmptyState, StatusPill, Textarea } from '../components/ui'
import { baseName, copyText, downloadPng } from '../lib/exports'
import { useDemo } from '../lib/store'
import { cx, formatDuration, platformLabel } from '../lib/utils'

export default function InstagramStudioPage() {
  const { state, actions, pushToast } = useDemo()
  const [params, setParams] = useSearchParams()

  const projects = useMemo(
    () =>
      state.projects
        .filter((p) => p.status === 'completed' && p.artifacts)
        .sort((a, b) => Number(b.platform === 'instagram-reel') - Number(a.platform === 'instagram-reel') || (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [state.projects],
  )
  const paramId = params.get('project')
  const initial = projects.find((p) => p.id === paramId) ?? projects[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const project = projects.find((p) => p.id === selectedId) ?? projects[0]
  const artifacts = project?.artifacts

  const [caption, setCaption] = useState(artifacts?.instagramCaption ?? '')
  const [hashtags, setHashtags] = useState(artifacts?.hashtags.join(' ') ?? '')

  const selectProject = (id: string) => {
    const next = projects.find((p) => p.id === id)
    setSelectedId(id)
    setParams({ project: id }, { replace: true })
    if (next?.artifacts) {
      setCaption(next.artifacts.instagramCaption)
      setHashtags(next.artifacts.hashtags.join(' '))
    }
  }

  const tagList = hashtags.split(/\s+/).map((tag) => tag.trim()).filter(Boolean)
  const dirty =
    Boolean(artifacts) &&
    (caption !== artifacts!.instagramCaption || hashtags !== artifacts!.hashtags.join(' '))

  const save = () => {
    if (!project) return
    actions.updateArtifact(project.id, {
      instagramCaption: caption,
      hashtags: tagList.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
    })
    pushToast({ tone: 'success', title: 'Instagram package saved', description: 'Captions and hashtags stored with the production.' })
  }

  const revert = () => {
    if (!artifacts) return
    setCaption(artifacts.instagramCaption)
    setHashtags(artifacts.hashtags.join(' '))
    pushToast({ tone: 'info', title: 'Unsaved edits reverted' })
  }

  const copyPackage = async () => {
    const ok = await copyText(`${caption}\n\n${tagList.join(' ')}`)
    pushToast(
      ok
        ? { tone: 'success', title: 'Instagram caption copied' }
        : { tone: 'error', title: 'Clipboard unavailable', description: 'Select the caption manually to copy it.' },
    )
  }

  const isReel = project?.platform === 'instagram-reel'
  const cover = artifacts?.coverDataUrl ?? artifacts?.thumbnailDataUrl

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Instagram Studio</h1>
            <Badge mono tone="warn">OAuth not connected</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Reels covers, captions and hashtags — packaged for manual posting. No automatic publishing.
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
          emptyNote="No completed productions yet. Finish a Reel to prepare its Instagram package."
        />
      </div>

      {project && artifacts ? (
        <>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="flex-1 text-[11px] leading-relaxed text-amber-100/85">
              Instagram integration is disconnected. Copy the caption and download the cover to post manually, or{' '}
              <Link to="/settings" className="underline underline-offset-2 hover:text-white">
                review integrations
              </Link>
              .
            </p>
            <Button size="sm" variant="secondary" icon={Share2} disabled>
              Share
            </Button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                  <span className="label text-[9px]">Cover preview</span>
                  <span className="font-mono text-[9px] text-txt-faint">9:16</span>
                </div>
                <div className="p-3">
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/12 bg-black">
                    {cover ? (
                      <img src={cover} alt="Instagram cover preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="shimmer h-full w-full" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 backdrop-blur">
                      <InstagramMark className="h-3 w-3 text-white/90" />
                      <span className="font-mono text-[8px] uppercase tracking-wider text-white/85">Reel</span>
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 right-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-4 w-4 rounded-full bg-[linear-gradient(135deg,#00D4FF,#8B5CF6)]" />
                        <span className="text-[9.5px] font-medium text-white/90">ai.viral.studio</span>
                        <span className="ml-auto font-mono text-[8px] text-white/60">{formatDuration(artifacts.durationSec)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[9.5px] leading-snug text-white/85">
                        {caption || 'Your caption will appear here.'}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[8.5px] text-cyan/80">{tagList.slice(0, 5).join(' ')}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Download}
                      className="flex-1"
                      onClick={() => {
                        if (!cover) return
                        downloadPng(cover, `${baseName(project)}-cover.jpg`)
                        pushToast({ tone: 'success', title: 'Cover downloaded' })
                      }}
                    >
                      Cover
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Download}
                      onClick={() => {
                        if (!artifacts.thumbnailDataUrl) return
                        downloadPng(artifacts.thumbnailDataUrl, `${baseName(project)}-thumbnail.jpg`)
                        pushToast({ tone: 'success', title: 'Thumbnail downloaded' })
                      }}
                    >
                      Thumbnail
                    </Button>
                  </div>
                </div>
              </div>

              <div className="panel p-4">
                <span className="label text-[9px]">Asset checklist</span>
                <div className="mt-1 divide-y divide-white/[0.04]">
                  <CheckRow status={project.approved ? 'pass' : 'warn'}>
                    {project.approved ? 'Deliverables approved' : 'Awaiting your approval'}
                  </CheckRow>
                  <CheckRow status={isReel ? 'pass' : 'warn'}>
                    {isReel ? 'Vertical 9:16 Reel format' : `Produced as ${platformLabel(project.platform)} — cover still usable`}
                  </CheckRow>
                  <CheckRow status={cover ? 'pass' : 'warn'}>
                    {cover ? 'Cover art ready (1080×1920)' : 'Cover art missing'}
                  </CheckRow>
                  <CheckRow status={artifacts.srt ? 'pass' : 'warn'}>
                    Burned-in captions in the cut · SRT available
                  </CheckRow>
                  <CheckRow status="fail">Instagram publishing — not connected</CheckRow>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="label text-[9px]">Caption package</span>
                  <div className="flex items-center gap-1.5">
                    {dirty ? <Badge mono tone="warn">Unsaved</Badge> : <Badge mono tone="success">Saved</Badge>}
                    <Button size="sm" variant="ghost" icon={Undo2} disabled={!dirty} onClick={revert}>
                      Revert
                    </Button>
                    <Button size="sm" variant="primary" icon={Save} disabled={!dirty || !caption.trim()} onClick={save}>
                      Save
                    </Button>
                  </div>
                </div>

                <label className="mt-3 block text-[11px] text-txt-muted">
                  <span className="flex items-center justify-between">
                    Caption
                    <span className={cx('font-mono text-[9.5px]', caption.length > 2200 ? 'text-rose-300' : 'text-txt-faint')}>
                      {caption.length}/2200
                    </span>
                  </span>
                  <Textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    rows={8}
                    className="mt-1 text-[12px] leading-relaxed"
                  />
                </label>

                <label className="mt-3 block text-[11px] text-txt-muted">
                  <span className="flex items-center justify-between">
                    Hashtags
                    <span className="font-mono text-[9.5px] text-txt-faint">{tagList.length} tags</span>
                  </span>
                  <Textarea
                    value={hashtags}
                    onChange={(event) => setHashtags(event.target.value)}
                    rows={3}
                    className="mt-1 text-[11.5px] leading-relaxed"
                  />
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tagList.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[9.5px] text-txt-faint">
                      <Hash className="h-2 w-2" aria-hidden="true" />
                      {tag.replace(/^#/, '')}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <Button size="sm" variant="secondary" icon={Copy} onClick={copyPackage}>
                    Copy caption
                  </Button>
                  <Button size="sm" variant="ghost" icon={ImageIcon} onClick={() => {
                    if (!cover) return
                    downloadPng(cover, `${baseName(project)}-cover.jpg`)
                    pushToast({ tone: 'success', title: 'Cover downloaded' })
                  }}>
                    Download cover
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

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="panel p-4">
                  <span className="label text-[9px]">Suggested hook</span>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-txt-muted">“{artifacts.hook}”</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Copy}
                    className="mt-2"
                    onClick={() => copyText(artifacts.hook)}
                  >
                    Copy hook
                  </Button>
                </div>
                <div className="panel p-4">
                  <span className="label text-[9px]">Posting plan</span>
                  <div className="mt-1.5 space-y-1 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-txt-faint">Format</span>
                      <span className="text-txt-muted">{platformLabel(project.platform)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-txt-faint">Runtime</span>
                      <span className="text-txt-muted">{formatDuration(artifacts.durationSec)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-txt-faint">Language</span>
                      <span className="text-txt-muted">{artifacts.languageLabel}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-txt-faint">Status</span>
                      <span className="text-txt-muted">{project.approved ? 'Approved' : 'Pending review'}</span>
                    </div>
                  </div>
                  <Link to="/calendar" className="mt-2 inline-block text-[10.5px] text-cyan/80 hover:text-cyan">
                    Plan a posting slot →
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-txt-faint">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Captions are demo copy. Review claims, tagging and rights before posting. No account is linked, so nothing is shared automatically.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Camera}
            title="No Instagram package yet"
            description="Finish a Reel production to prepare a cover, caption and hashtag set. Everything stays in this browser."
            action={
              <Link to="/">
                <Button variant="primary" icon={Camera}>
                  Start a Reel
                </Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}
