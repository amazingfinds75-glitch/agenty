import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarPlus,
  Captions,
  Check,
  Clock3,
  Copy,
  Download,
  FileJson,
  FileText,
  Images,
  Info,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  SquarePlay,
  Video,
} from 'lucide-react'
import { PlatformMark } from '../components/Brand'
import { AgentRoster, StageList } from '../components/production/ProductionPanel'
import {
  Badge,
  Button,
  Dot,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  Progress,
  RingProgress,
  Stat,
  StatusPill,
  Tabs,
  Textarea,
} from '../components/ui'
import { copyText, downloadBlob, downloadPng, downloadText, baseName, projectJson, scriptMarkdown } from '../lib/exports'
import { renderDemoVideo, supportsVideoRender } from '../lib/render'
import { AGENT_MAP } from '../lib/agents'
import { STAGES } from '../lib/pipeline'
import { projectAgentStates } from '../lib/agentRuntime'
import { useDemo } from '../lib/store'
import type { Project } from '../lib/types'
import { cx, formatBytes, formatDuration, platformLabel, relativeTime } from '../lib/utils'
import { speak, stopSpeaking, ttsSupported } from '../lib/voice'
import { overallProgress } from '../components/production/ProductionPanel'

function stamp(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type TabId = 'preview' | 'script' | 'metadata' | 'assets' | 'quality'

export default function ProductionDetailPage() {
  const { id } = useParams()
  const { state } = useDemo()
  const project = state.projects.find((p) => p.id === id)

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <EmptyState
          icon={SquarePlay}
          title="Production not found"
          description="This project may have been removed or the demo workspace was reset."
          action={
            <Link to="/productions">
              <Button variant="primary" icon={ArrowLeft}>
                Back to productions
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  return <ProductionView project={project} />
}

function ProductionView({ project }: { project: Project }) {
  const { state, actions, pushToast } = useDemo()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('preview')
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionText, setRevisionText] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [scheduleTime, setScheduleTime] = useState('18:30')
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [localRender, setLocalRender] = useState<{ url: string; mime: string; size: number } | null>(null)
  const [videoBroken, setVideoBroken] = useState(false)
  const [playingNarration, setPlayingNarration] = useState(false)

  const artifacts = project.artifacts
  const session = useMemo(
    () => state.sessions.find((s) => s.projectIds.includes(project.id)) ?? state.sessions.find((s) => s.id === project.sessionId),
    [state.sessions, project.id, project.sessionId],
  )
  const agents = projectAgentStates(project)
  const progress = overallProgress(project)
  const currentStage = STAGES[project.stageIndex]
  const working = Object.values(agents).filter((a) => a.status === 'working').length
  const videoUrl = !videoBroken ? localRender?.url ?? project.render?.url : undefined
  const canRender = supportsVideoRender()
  const narration = artifacts ? artifacts.scenes.map((s) => s.narration).join(' ') : ''

  useEffect(() => {
    setLocalRender(null)
    setVideoBroken(false)
    setRenderError(null)
    setTab('preview')
  }, [project.id])

  useEffect(() => () => stopSpeaking(), [])

  const handleApprove = () => {
    actions.approveProject(project.id)
    pushToast({
      tone: 'success',
      title: 'Deliverables approved',
      description: 'Approval is recorded locally. Publishing integrations remain disconnected.',
    })
  }

  const handleRender = async () => {
    if (!artifacts) return
    setRendering(true)
    setRenderProgress(0)
    setRenderError(null)
    setVideoBroken(false)
    try {
      const result = await renderDemoVideo(artifacts, project.platform, (p) => setRenderProgress(p))
      setLocalRender({ url: result.url, mime: result.mime, size: result.size })
      actions.setProjectRender(project.id, {
        url: result.url,
        mime: result.mime,
        renderedAt: new Date().toISOString(),
        size: result.size,
      })
      pushToast({
        tone: 'success',
        title: 'Demo cut rendered',
        description: `${result.width}×${result.height} · ${formatBytes(result.size)} · ${result.mime.split(';')[0]}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'render-failed'
      setRenderError(
        message === 'VIDEO_RENDER_UNSUPPORTED'
          ? 'This browser does not support canvas recording. The stitched poster preview and every asset are still available.'
          : message === 'VIDEO_RENDER_HIDDEN'
            ? 'The render stopped because this tab was hidden. Keep the tab visible and try again — nothing has been lost.'
            : message === 'VIDEO_RENDER_TIMEOUT'
              ? 'The render timed out before producing a clip. Retry with this tab visible.'
              : 'The demo render failed before finishing. You can retry — nothing has been lost.',
      )
    } finally {
      setRendering(false)
    }
  }

  const downloadRender = async () => {
    if (!videoUrl) return
    try {
      const response = await fetch(videoUrl)
      const blob = await response.blob()
      const ext = (project.render?.mime ?? localRender?.mime ?? 'video/webm').includes('mp4') ? 'mp4' : 'webm'
      downloadBlob(blob, `${baseName(project)}-demo-cut.${ext}`)
      pushToast({ tone: 'success', title: 'Video downloaded' })
    } catch {
      pushToast({
        tone: 'error',
        title: 'Render no longer available',
        description: 'Rendered clips live only in this tab. Render the cut again to download it.',
      })
    }
  }

  const copy = async (value: string, label: string) => {
    const ok = await copyText(value)
    pushToast(
      ok
        ? { tone: 'success', title: `${label} copied` }
        : { tone: 'error', title: 'Clipboard unavailable', description: 'Your browser blocked clipboard access. Select the text manually.' },
    )
  }

  const submitRevision = () => {
    const note = revisionText.trim()
    if (!note) return
    const result = actions.sendPrompt({
      text: `Revise this production: ${note}`,
      sessionId: session?.id ?? null,
      platform: project.platform,
      language: project.language,
    })
    setRevisionOpen(false)
    setRevisionText('')
    pushToast({
      tone: 'info',
      title: 'Revision requested',
      description: 'The Executive Producer is re-running the pipeline with your notes.',
    })
    navigate(result.sessionId ? `/c/${result.sessionId}` : '/')
  }

  const submitSchedule = () => {
    if (!project.approved) return
    actions.scheduleProject(project.id, scheduleDate, scheduleTime)
    setScheduleOpen(false)
    pushToast({
      tone: 'success',
      title: 'Added to content calendar',
      description: `${scheduleDate} · ${scheduleTime} · ${platformLabel(project.platform)}`,
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <Link
        to="/productions"
        className="inline-flex items-center gap-1.5 text-[11.5px] text-txt-faint transition-colors hover:text-txt-muted"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Active productions
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-txt-muted">
              <PlatformMark platform={project.platform} className="h-3 w-3 text-cyan/80" />
              {platformLabel(project.platform)}
            </span>
            <StatusPill status={project.approved ? 'approved' : project.status} />
            {project.demo ? <Badge mono className="border-amber-400/20 text-amber-200/80">Simulated team</Badge> : null}
          </div>
          <h1 className="mt-2 max-w-[26ch] font-display text-[24px] font-semibold leading-tight tracking-tight text-txt sm:text-[28px]">
            {artifacts?.title ?? project.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-txt-faint">
            <span>{project.artifacts?.languageLabel ?? project.language}</span>
            <span aria-hidden="true">·</span>
            <span>Revision {project.revision}</span>
            <span aria-hidden="true">·</span>
            <span>Created {relativeTime(project.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {relativeTime(project.updatedAt)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {session ? (
            <Link to={`/c/${session.id}`}>
              <Button variant="ghost" size="md" icon={MessageSquare}>
                <span className="hidden sm:inline">Conversation</span>
              </Button>
            </Link>
          ) : null}
          {project.status === 'running' ? (
            <Button variant="secondary" icon={Pause} onClick={() => actions.pauseProject(project.id)}>
              <span className="hidden sm:inline">Pause</span>
            </Button>
          ) : null}
          {project.status === 'paused' || project.status === 'failed' ? (
            <Button variant="secondary" icon={RotateCcw} onClick={() => actions.retryProject(project.id)}>
              {project.status === 'failed' ? 'Retry stage' : 'Resume'}
            </Button>
          ) : null}
          <Button variant="secondary" icon={RefreshCcw} onClick={() => setRevisionOpen(true)}>
            <span className="hidden sm:inline">Request</span> changes
          </Button>
          {project.status === 'completed' ? (
            project.approved ? (
              <Button variant="secondary" icon={Check} disabled>
                Approved
              </Button>
            ) : (
              <Button variant="primary" icon={Check} onClick={handleApprove}>
                Approve deliverables
              </Button>
            )
          ) : null}
          <Menu
            align="right"
            label="Project actions"
            trigger={<IconButton label="Project actions" icon={MoreHorizontal} />}
            items={[
              {
                label: 'Download project JSON',
                icon: FileJson,
                onClick: () => {
                  downloadText(projectJson(project), `${baseName(project)}.json`, 'application/json')
                  pushToast({ tone: 'success', title: 'Project JSON downloaded' })
                },
              },
              {
                label: 'Download script',
                icon: FileText,
                disabled: !artifacts,
                onClick: () => {
                  downloadText(scriptMarkdown(project), `${baseName(project)}-script.md`, 'text/markdown;charset=utf-8')
                  pushToast({ tone: 'success', title: 'Script downloaded' })
                },
              },
              {
                label: 'Refresh artwork',
                icon: RefreshCcw,
                onClick: () => void actions.refreshArtwork(project.id),
              },
              {
                label: 'Schedule to calendar',
                icon: CalendarPlus,
                disabled: !project.approved,
                onClick: () => setScheduleOpen(true),
              },
              ...(project.status === 'running' || project.status === 'paused'
                ? [
                    {
                      label: 'Cancel production',
                      icon: Square,
                      danger: true,
                      onClick: () => actions.cancelProject(project.id),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Current stage" value={project.status === 'completed' ? 'Delivered' : currentStage?.short ?? '—'} hint={`${Math.min(project.stageIndex + 1, 13)} of 13 stages`} icon={Radio} />
        <Stat label="Overall progress" value={`${Math.round(progress * 100)}%`} hint={`${project.stages.filter((s) => s.status === 'completed').length} stages complete`} icon={Sparkles} tone="violet" />
        <Stat label="Agents working" value={working} hint={working ? 'Parallel tasks live' : 'Team idle or finished'} icon={ShieldCheck} tone="emerald" />
        <Stat label="Approval" value={project.approved ? 'Approved' : 'Pending'} hint={project.approved ? 'Cleared for scheduling' : 'No publish without review'} icon={Check} tone="amber" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_350px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="panel overflow-hidden">
            <div className="border-b border-white/[0.07] px-3 py-2.5">
              <Tabs
                tabs={[
                  { id: 'preview', label: 'Preview', icon: SquarePlay },
                  { id: 'script', label: 'Script', icon: FileText },
                  { id: 'metadata', label: 'Metadata', icon: Captions },
                  { id: 'assets', label: 'Assets', icon: Images },
                  { id: 'quality', label: 'Quality', icon: ShieldCheck },
                ]}
                value={tab}
                onChange={setTab}
                size="sm"
                className="w-full overflow-x-auto sm:w-auto"
                ariaLabel="Deliverable sections"
              />
            </div>

            <div className="p-4 sm:p-5">
              {tab === 'preview' ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
                    {videoUrl ? (
                      <video
                        key={videoUrl}
                        src={videoUrl}
                        controls
                        playsInline
                        poster={artifacts?.thumbnailDataUrl}
                        className="aspect-video w-full bg-black object-contain"
                        onError={() => {
                          setVideoBroken(true)
                          setRenderError('This rendered clip is no longer available in this browser session. Render it again to preview.')
                        }}
                      />
                    ) : (
                      <div className="relative aspect-video w-full overflow-hidden">
                        {artifacts?.thumbnailDataUrl ? (
                          <img src={artifacts.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="shimmer h-full w-full" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                          {rendering ? (
                            <>
                              <Loader2 className="h-6 w-6 animate-spin text-cyan" aria-hidden="true" />
                              <div className="w-[min(320px,80%)]">
                                <div className="flex items-center justify-between text-[10px] text-white/70">
                                  <span>Recording real canvas + audio</span>
                                  <span className="font-mono tnum">{Math.round(renderProgress * 100)}%</span>
                                </div>
                                <Progress value={renderProgress} className="mt-1.5" height={3} />
                                <p className="mt-2 text-[10px] text-white/50">Runs in real time (~10s). Keep this tab visible.</p>
                              </div>
                            </>
                          ) : project.status === 'completed' && artifacts ? (
                            <>
                              <button
                                onClick={handleRender}
                                disabled={!canRender}
                                className="group flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Render demo cut"
                              >
                                <Play className="h-5 w-5 fill-current text-white" />
                              </button>
                              <div className="text-[11px] text-white/80">
                                {canRender ? 'Render the 10-second demo cut in-browser' : 'Video recording is not supported by this browser'}
                              </div>
                              <div className="font-mono text-[9px] uppercase tracking-widest text-white/45">
                                Poster preview · {platformLabel(project.platform)}
                              </div>
                            </>
                          ) : (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin text-cyan/80" aria-hidden="true" />
                              <div className="text-[11.5px] text-white/80">
                                {project.status === 'failed' ? 'Stage failed — retry to continue' : 'The cut unlocks after quality control'}
                              </div>
                              <div className="font-mono text-[9px] uppercase tracking-widest text-white/45">
                                {currentStage?.name} · {Math.round(project.stageProgress * 100)}%
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {renderError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-100/90">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{renderError}</span>
                      {artifacts ? (
                        <button className="shrink-0 underline underline-offset-2 hover:text-white" onClick={handleRender} disabled={!canRender}>
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {artifacts ? (
                      <>
                        <Button variant="primary" icon={videoUrl ? Download : canRender ? Play : SquarePlay} onClick={videoUrl ? downloadRender : handleRender} disabled={rendering || (!canRender && !videoUrl)}>
                          {rendering ? 'Rendering…' : videoUrl ? 'Download cut' : canRender ? 'Render demo cut' : 'Preview unavailable'}
                        </Button>
                        <Link to={`/design?project=${project.id}`}>
                          <Button variant="secondary" icon={Images}>
                            Edit artwork
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <Badge tone="warn" mono>
                        Deliverables unlock after QC
                      </Badge>
                    )}
                    {artifacts ? (
                      <span className="ml-auto font-mono text-[10px] text-txt-faint tnum">
                        {formatDuration(artifacts.durationSec)} · {artifacts.wordCount} words · {artifacts.scenes.length} scenes
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="label text-[9px]">Deliverable checklist</span>
                      <span className="font-mono text-[9px] text-txt-faint">Generated in-browser</span>
                    </div>
                    <div className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-2">
                      {[
                        { label: 'Vertical / landscape cut', done: Boolean(videoUrl) || project.status === 'completed', note: videoUrl ? project.render?.mime?.split(';')[0] : 'render on demand' },
                        { label: 'Thumbnail · 16:9', done: Boolean(artifacts?.thumbnailDataUrl), note: '1280×720 JPEG' },
                        { label: 'Instagram cover · 9:16', done: Boolean(artifacts?.coverDataUrl), note: '1080×1920 JPEG' },
                        { label: 'Script + scene breakdown', done: Boolean(artifacts), note: 'Markdown' },
                        { label: 'SRT subtitles', done: Boolean(artifacts), note: 'Timed cues' },
                        { label: 'Platform metadata', done: Boolean(artifacts), note: 'YouTube + Instagram' },
                        { label: 'Research sources', done: Boolean(artifacts), note: 'demo:// placeholders' },
                        { label: 'QC report', done: Boolean(artifacts?.qc.length), note: 'Illustrative checks' },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-2 py-1.5">
                          <span
                            className={cx(
                              'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                              item.done
                                ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                                : 'border-white/15 bg-white/[0.02] text-transparent',
                            )}
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 text-[11px] leading-relaxed text-txt-muted">
                            {item.label}
                            <span className="ml-1 text-[9.5px] text-txt-faint">· {item.note}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-txt-faint">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Video is assembled from a canvas timeline with a synthesized ambient bed — a real MediaRecorder render, not a stock clip. The script and metadata are demo-grade copy generated locally. Verify facts before publishing.
                    </span>
                  </div>
                </div>
              ) : null}

              {tab === 'script' ? (
                artifacts ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="label text-[9px]">Opening hook</div>
                        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-txt">“{artifacts.hook}”</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(scriptMarkdown(project), 'Script')}>
                          Copy script
                        </Button>
                        <Button size="sm" variant="ghost" icon={FileText} onClick={() => {
                          downloadText(scriptMarkdown(project), `${baseName(project)}-script.md`, 'text/markdown;charset=utf-8')
                        }}>
                          Download
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {artifacts.scenes.map((scene) => (
                        <div key={scene.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded border border-cyan/20 bg-cyan/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-cyan/90 tnum">
                                {stamp(scene.startSec)}–{stamp(scene.endSec)}
                              </span>
                              <span className="text-[12px] font-medium text-txt">{scene.label}</span>
                              <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">{scene.mood}</span>
                            </div>
                              <button
                                onClick={() => {
                                  if (!ttsSupported()) {
                                    pushToast({ tone: 'error', title: 'Speech synthesis unavailable' })
                                    return
                                  }
                                  speak(scene.narration, artifacts.language, {
                                    onError: () => pushToast({ tone: 'error', title: 'Narration preview failed' }),
                                  })
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-1 font-mono text-[9px] text-txt-faint transition-colors hover:border-cyan/30 hover:text-cyan"
                                aria-label={`Preview narration for ${scene.label}`}
                              >
                                <Play className="h-2.5 w-2.5" /> Narration
                              </button>
                            </div>
                            <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-txt-muted">{scene.narration}</p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-txt-faint">
                              <span><span className="text-txt-faint">Visual:</span> {scene.visual}</span>
                              <span><span className="text-txt-faint">Shot:</span> {scene.shot}</span>
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet/20 bg-violet/[0.05] px-3 py-2.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-200" aria-hidden="true" />
                      <span className="text-[11.5px] text-txt-muted">Want a different angle? Request a revision and the producer regenerates the cut locally.</span>
                      <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setRevisionOpen(true)}>
                        Request changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <LockedOutput project={project} />
                )
              ) : null}

              {tab === 'metadata' ? (
                artifacts ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <MetadataBlock
                        icon={<PlatformMark platform="youtube-short" className="h-4 w-4" />}
                        title="YouTube"
                        fields={[
                          { label: 'Title', value: artifacts.youtubeTitle, copyLabel: 'Title' },
                          { label: 'Description', value: artifacts.description, copyLabel: 'Description', multiline: true },
                          { label: 'Tags', value: artifacts.youtubeTags.join(', '), copyLabel: 'Tags' },
                        ]}
                        onCopy={copy}
                      />
                      <MetadataBlock
                        icon={<PlatformMark platform="instagram-reel" className="h-4 w-4" />}
                        title="Instagram"
                        fields={[
                          { label: 'Caption', value: artifacts.instagramCaption, copyLabel: 'Caption', multiline: true },
                          { label: 'Hashtags', value: artifacts.hashtags.join(' '), copyLabel: 'Hashtags' },
                        ]}
                        onCopy={copy}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2.5">
                      <CalendarPlus className="h-3.5 w-3.5 text-cyan/80" aria-hidden="true" />
                      <span className="text-[11.5px] text-txt-muted">
                        {project.approved ? 'Approved — you can slot this into the calendar.' : 'Approve the deliverables before scheduling or publishing.'}
                      </span>
                      <Button size="sm" variant={project.approved ? 'primary' : 'secondary'} className="ml-auto" disabled={!project.approved} onClick={() => setScheduleOpen(true)}>
                        Schedule slot
                      </Button>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-txt-faint">
                      Titles are generated from the brief and trend signal. Hashtags and descriptions are illustrative — review tone and claims before publishing.
                    </p>
                  </div>
                ) : (
                  <LockedOutput project={project} />
                )
              ) : null}

              {tab === 'assets' ? (
                artifacts ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ArtworkCard
                        title="YouTube thumbnail"
                        meta="1280×720 · 16:9"
                        src={artifacts.thumbnailDataUrl}
                        onDownload={() => {
                          if (!artifacts.thumbnailDataUrl) return
                          downloadPng(artifacts.thumbnailDataUrl, `${baseName(project)}-thumbnail.jpg`)
                          pushToast({ tone: 'success', title: 'Thumbnail downloaded' })
                        }}
                        onRefresh={() => void actions.refreshArtwork(project.id)}
                      />
                      <ArtworkCard
                        title="Instagram cover"
                        meta="1080×1920 · 9:16"
                        src={artifacts.coverDataUrl}
                        aspect="aspect-[4/5] sm:aspect-[9/16] max-h-[360px]"
                        onDownload={() => {
                          if (!artifacts.coverDataUrl) return
                          downloadPng(artifacts.coverDataUrl, `${baseName(project)}-cover.jpg`)
                          pushToast({ tone: 'success', title: 'Cover downloaded' })
                        }}
                        onRefresh={() => void actions.refreshArtwork(project.id)}
                      />
                    </div>

                    <div className="rounded-xl border border-white/[0.07]">
                      {[
                        {
                          label: 'Script',
                          detail: `${artifacts.wordCount} words · Markdown`,
                          action: () => downloadText(scriptMarkdown(project), `${baseName(project)}-script.md`, 'text/markdown;charset=utf-8'),
                        },
                        {
                          label: 'Subtitles',
                          detail: `${artifacts.srt.split('\n\n').length} cues · SRT`,
                          action: () => downloadText(artifacts.srt, `${baseName(project)}.srt`, 'application/x-subrip;charset=utf-8'),
                        },
                        {
                          label: 'Project package',
                          detail: 'Metadata, artifacts and QC · JSON',
                          action: () => downloadText(projectJson(project), `${baseName(project)}.json`, 'application/json'),
                        },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center gap-3 border-b border-white/[0.05] px-3.5 py-2.5 last:border-b-0">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-txt">{row.label}</div>
                            <div className="text-[10px] text-txt-faint">{row.detail}</div>
                          </div>
                          <IconButton
                            label={`Download ${row.label}`}
                            icon={Download}
                            onClick={() => {
                              row.action()
                              pushToast({ tone: 'success', title: `${row.label} downloaded` })
                            }}
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-3 border-t border-white/[0.05] px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] text-txt">Narration preview</div>
                          <div className="text-[10px] text-txt-faint">
                            {ttsSupported() ? `Browser text-to-speech · ${artifacts.languageLabel}` : 'No speech engine in this browser'}
                          </div>
                        </div>
                        <IconButton
                          label={playingNarration ? 'Stop narration' : 'Play narration'}
                          icon={playingNarration ? Square : Play}
                          onClick={() => {
                            if (playingNarration) {
                              stopSpeaking()
                              setPlayingNarration(false)
                              return
                            }
                            if (!ttsSupported()) {
                              pushToast({ tone: 'error', title: 'Speech synthesis unavailable', description: 'Use a browser with a voice engine to preview narration.' })
                              return
                            }
                            speak(narration, artifacts.language, {
                              onStart: () => setPlayingNarration(true),
                              onEnd: () => setPlayingNarration(false),
                              onError: (message) => {
                                setPlayingNarration(false)
                                pushToast({ tone: 'error', title: 'Narration preview failed', description: message })
                              },
                            })
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <LockedOutput project={project} />
                )
              ) : null}

              {tab === 'quality' ? (
                artifacts ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {(['pass', 'warn', 'fail'] as const).map((status) => {
                        const count = artifacts.qc.filter((q) => q.status === status).length
                        return (
                          <div key={status} className={cx(
                            'rounded-xl border px-3 py-2.5',
                            status === 'pass' ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : status === 'warn' ? 'border-amber-400/20 bg-amber-400/[0.05]' : 'border-rose-400/20 bg-rose-400/[0.05]',
                          )}>
                            <div className="label text-[9px]">{status}</div>
                            <div className="mt-1 font-display text-[20px] font-semibold leading-none text-txt tnum">{count}</div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="space-y-1.5">
                      {artifacts.qc.map((item) => (
                        <div key={item.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] px-3 py-2.5">
                          <span className={cx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', item.status === 'pass' ? 'bg-emerald-400' : item.status === 'warn' ? 'bg-amber-400' : 'bg-rose-400')} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-txt">{item.label}</span>
                              <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-txt-faint">{item.status}</span>
                            </div>
                            <p className="mt-0.5 text-[10.5px] leading-relaxed text-txt-faint">{item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="label text-[9px]">Research log</span>
                        <Badge mono tone="cyan">demo:// sources</Badge>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {artifacts.research.map((source) => (
                          <div key={source.id} className="rounded-lg border border-white/[0.06] px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[11.5px] text-txt">{source.title}</span>
                              <span className="ml-auto shrink-0 font-mono text-[9px] text-txt-faint">{Math.round(source.relevance * 100)}%</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9.5px] text-txt-faint">
                              <span>{source.source}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{source.url}</span>
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-txt-faint">{source.note}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-txt-faint">
                        Research items are illustrative placeholders, not live web results. Fact-checking warnings are intentional in this demo.
                      </p>
                    </div>
                  </div>
                ) : (
                  <LockedOutput project={project} />
                )
              ) : null}
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label text-[9px]">Original brief</div>
                <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-txt-muted">“{project.prompt}”</p>
              </div>
              {session ? (
                <Link to={`/c/${session.id}`} className="shrink-0">
                  <Button size="sm" variant="ghost" iconRight={ArrowUpRight}>
                    Open chat
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="label text-[9px]">Production status</span>
              {project.demo ? <Badge mono className="border-amber-400/20 text-amber-200/80">Simulated</Badge> : null}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RingProgress value={progress} size={58} stroke={4} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-txt">
                  {project.status === 'completed' ? 'Delivered for review' : currentStage?.name}
                </div>
                <div className="mt-0.5 text-[10.5px] text-txt-faint">
                  {project.stages.filter((s) => s.status === 'completed').length}/13 complete · {working} working
                </div>
                <Progress value={progress} className="mt-2" height={3} tone="mixed" />
              </div>
            </div>

            {project.status === 'failed' ? (
              <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/[0.06] p-2.5">
                <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-rose-100/90">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{project.error ?? 'A stage failed.'}</span>
                </div>
                <Button size="sm" variant="secondary" icon={RotateCcw} className="mt-2 w-full" onClick={() => actions.retryProject(project.id)}>
                  Retry failed stage
                </Button>
              </div>
            ) : null}
            {project.status === 'paused' ? (
              <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-2.5 text-[10.5px] text-amber-100/90">
                Paused — resume to continue from {currentStage?.short}.
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-1.5">
              {project.status === 'running' ? (
                <Button size="sm" variant="secondary" icon={Pause} className="flex-1" onClick={() => actions.pauseProject(project.id)}>
                  Pause
                </Button>
              ) : null}
              {project.status === 'paused' || project.status === 'failed' ? (
                <Button size="sm" variant="primary" icon={Play} className="flex-1" onClick={() => actions.retryProject(project.id)}>
                  {project.status === 'failed' ? 'Retry' : 'Resume'}
                </Button>
              ) : null}
              {project.status === 'completed' && !project.approved ? (
                <Button size="sm" variant="primary" icon={Check} className="flex-1" onClick={handleApprove}>
                  Approve
                </Button>
              ) : null}
              {project.status === 'completed' && project.approved ? (
                <Button size="sm" variant="secondary" icon={CalendarPlus} className="flex-1" onClick={() => setScheduleOpen(true)}>
                  Schedule
                </Button>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">Demo speed</span>
              <div className="flex items-center gap-1">
                {[1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => actions.setSimSpeed(speed)}
                    aria-pressed={state.simSpeed === speed}
                    className={cx(
                      'rounded-md px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                      state.simSpeed === speed ? 'bg-white/[0.08] text-cyan' : 'text-txt-faint hover:text-txt',
                    )}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="label text-[9px]">Pipeline</span>
              <span className="font-mono text-[9px] text-txt-faint">13 stages</span>
            </div>
            <div className="mt-2">
              <StageList project={project} />
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="label text-[9px]">Agent activity</span>
              <Link to="/team" className="text-[10px] text-cyan/80 hover:text-cyan">
                AI team
              </Link>
            </div>
            <div className="mt-1">
              <AgentRoster project={project} />
            </div>
          </div>

          <div className="panel p-4">
            <div className="label text-[9px]">Publishing</div>
            <div className="mt-2 space-y-1.5">
              <IntegrationRow label="YouTube" connected={state.settings.integrations.youtube} />
              <IntegrationRow label="Instagram" connected={state.settings.integrations.instagram} />
              <IntegrationRow label="Google Drive" connected={state.settings.integrations.drive} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-txt-faint">
              OAuth is not configured in this demo. Nothing can be uploaded or posted automatically.
            </p>
            <Link to="/settings" className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-cyan/80 hover:text-cyan">
              Manage integrations <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>

      <Modal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Request changes"
        description="The Executive Producer regenerates the script and artwork from your notes, bumps the revision and asks for approval again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Send} disabled={!revisionText.trim()} onClick={submitRevision}>
              Send to producer
            </Button>
          </>
        }
      >
        <Textarea
          value={revisionText}
          onChange={(event) => setRevisionText(event.target.value)}
          rows={4}
          placeholder="e.g. Make the hook punchier, keep the Telugu narration, and cut scene 3 to eight seconds."
          autoFocus
        />
        <p className="mt-2 text-[10.5px] leading-relaxed text-txt-faint">
          Revision {project.revision + 1} regenerates copy, captions and artwork from the same brief. Previous outputs stay in the conversation for reference.
        </p>
      </Modal>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule publishing slot"
        description="This adds a calendar reminder for a human-published post. It does not publish anything."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={CalendarPlus} disabled={!project.approved || !scheduleDate || !scheduleTime} onClick={submitSchedule}>
              Add to calendar
            </Button>
          </>
        }
      >
        {!project.approved ? (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Approve the deliverables before scheduling. This keeps the human review step intact.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[11px] text-txt-muted">
            Date
            <Input type="date" className="mt-1" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
          </label>
          <label className="text-[11px] text-txt-muted">
            Time
            <Input type="time" className="mt-1" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10.5px] text-txt-faint">
          <PlatformMark platform={project.platform} className="h-3.5 w-3.5 text-cyan/80" />
          {platformLabel(project.platform)} · {artifacts?.durationSec ? formatDuration(artifacts.durationSec) : '—'}
        </div>
      </Modal>
    </div>
  )
}

function LockedOutput({ project }: { project: Project }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 px-5 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
        <Clock3 className="h-4 w-4 text-txt-faint" aria-hidden="true" />
      </div>
      <div className="mt-3 text-[13px] font-medium text-txt">Deliverables unlock after QC</div>
      <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-txt-faint">
        Current stage: {STAGES[project.stageIndex]?.name}. This demo runs a live simulated pipeline — nothing is pre-baked.
      </p>
      <div className="mx-auto mt-3 max-w-xs">
        <Progress value={overallProgress(project)} height={4} tone="mixed" />
      </div>
    </div>
  )
}

function MetadataBlock({
  icon,
  title,
  fields,
  onCopy,
}: {
  icon: React.ReactNode
  title: string
  fields: Array<{ label: string; value: string; copyLabel: string; multiline?: boolean }>
  onCopy: (value: string, label: string) => void
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-txt-muted">{icon}</span>
        <span className="text-[12px] font-medium text-txt">{title}</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {fields.map((field) => (
          <div key={field.label} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="label text-[8.5px]">{field.label}</span>
              <IconButton label={`Copy ${field.copyLabel}`} icon={Copy} onClick={() => onCopy(field.value, field.copyLabel)} />
            </div>
            <div className={cx('mt-1 text-[11.5px] leading-relaxed text-txt-muted', field.multiline ? 'whitespace-pre-line' : 'line-clamp-2')}>
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArtworkCard({
  title,
  meta,
  src,
  onDownload,
  onRefresh,
  aspect = 'aspect-video',
}: {
  title: string
  meta: string
  src?: string
  onDownload: () => void
  onRefresh: () => void
  aspect?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
      <div className={cx('relative w-full overflow-hidden bg-black/40', aspect)}>
        {src ? (
          <img src={src} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="shimmer h-full w-full" />
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] text-txt">{title}</div>
          <div className="text-[9.5px] text-txt-faint">{meta}</div>
        </div>
        <IconButton label={`Regenerate ${title}`} icon={RefreshCcw} onClick={onRefresh} />
        <IconButton label={`Download ${title}`} icon={Download} onClick={onDownload} disabled={!src} />
      </div>
    </div>
  )
}

function IntegrationRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-2">
      <span className="text-[11px] text-txt-muted">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-txt-faint">
        <Dot tone={connected ? 'green' : 'slate'} />
        {connected ? 'Connected' : 'Not connected'}
      </span>
    </div>
  )
}
