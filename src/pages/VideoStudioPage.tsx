import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Download,
  Film,
  Info,
  Loader2,
  Mic,
  Play,
  RefreshCcw,
  Square,
  SquarePlay,
  Video,
} from 'lucide-react'
import { StudioProjectBar } from '../components/production/StudioProjectBar'
import { Button, EmptyState, Progress, StatusPill } from '../components/ui'
import { baseName, downloadBlob } from '../lib/exports'
import { formatAttachmentLabel, useDemo } from '../lib/store'
import { renderDemoVideo, supportsVideoRender } from '../lib/render'
import { speak, stopSpeaking, ttsSupported } from '../lib/voice'
import { cx, formatDuration, platformLabel } from '../lib/utils'

function stamp(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function VideoStudioPage() {
  const { state, actions, pushToast } = useDemo()
  const [params, setParams] = useSearchParams()
  const projects = useMemo(
    () => state.projects.filter((p) => p.artifacts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.projects],
  )
  const paramId = params.get('project')
  const initial = projects.find((p) => p.id === paramId) ?? projects[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const project = projects.find((p) => p.id === selectedId) ?? projects[0]
  const artifacts = project?.artifacts

  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [localRender, setLocalRender] = useState<{ url: string; mime: string; size: number } | null>(null)
  const [videoBroken, setVideoBroken] = useState(false)
  const [playing, setPlaying] = useState(false)

  const selectProject = (id: string) => {
    stopSpeaking()
    setPlaying(false)
    setSelectedId(id)
    setParams({ project: id }, { replace: true })
    setLocalRender(null)
    setVideoBroken(false)
    setError(null)
  }

  const render = async () => {
    if (!project || !artifacts) return
    setRendering(true)
    setProgress(0)
    setError(null)
    setVideoBroken(false)
    try {
      const result = await renderDemoVideo(artifacts, project.platform, (value) => setProgress(value))
      setLocalRender({ url: result.url, mime: result.mime, size: result.size })
      actions.setProjectRender(project.id, {
        url: result.url,
        mime: result.mime,
        renderedAt: new Date().toISOString(),
        size: result.size,
      })
      pushToast({ tone: 'success', title: 'Demo cut rendered', description: `${formatAttachmentLabel(result.size)} · ${result.width}×${result.height}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(
        message === 'VIDEO_RENDER_UNSUPPORTED'
          ? 'Canvas recording is unavailable in this browser. Storyboards, narration and downloadable assets still work.'
          : message === 'VIDEO_RENDER_HIDDEN'
            ? 'The render stopped because this tab was hidden. Keep the tab visible and retry — the project is unchanged.'
            : message === 'VIDEO_RENDER_TIMEOUT'
              ? 'The render timed out before producing a clip. Retry with this tab visible.'
              : 'Rendering failed before completion. Retry — the project is unchanged.',
      )
    } finally {
      setRendering(false)
    }
  }

  const videoUrl = !videoBroken ? localRender?.url ?? project?.render?.url : undefined

  const downloadVideo = async () => {
    if (!videoUrl || !project) return
    try {
      const response = await fetch(videoUrl)
      const blob = await response.blob()
      const ext = (project.render?.mime ?? localRender?.mime ?? '').includes('mp4') ? 'mp4' : 'webm'
      downloadBlob(blob, `${baseName(project)}-demo-cut.${ext}`)
      pushToast({ tone: 'success', title: 'Video downloaded' })
    } catch {
      pushToast({ tone: 'error', title: 'Render expired', description: 'Blob URLs live for this tab only. Render again to download.' })
    }
  }

  const narrationText = artifacts ? artifacts.scenes.map((s) => s.narration).join(' ') : ''
  const total = artifacts ? artifacts.scenes.reduce((max, s) => Math.max(max, s.endSec), 0) : 0

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Video Production Studio</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Storyboard, voiceover and render — a real canvas + MediaRecorder demo cut assembled in your browser.
          </p>
        </div>
        {project ? (
          <Link to={`/productions/${project.id}`}>
            <Button variant="secondary" icon={ArrowUpRight}>
              Full production
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <StudioProjectBar
          projects={projects}
          selectedId={project?.id}
          onSelect={selectProject}
          emptyNote="No media yet. Finish a production to storyboard and render its cut."
        />
      </div>

      {project && artifacts ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <span className="label text-[9px]">Scene preview</span>
                <div className="flex items-center gap-1.5">
                  <StatusPill status={project.status} />
                  <span className="font-mono text-[9px] text-txt-faint">{platformLabel(project.platform)}</span>
                </div>
              </div>
              <div className="relative aspect-video bg-black">
                {videoUrl ? (
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    playsInline
                    poster={artifacts.thumbnailDataUrl}
                    className="h-full w-full object-contain"
                    onError={() => {
                      setVideoBroken(true)
                      setError('This rendered file is no longer available in this tab. Render the cut again.')
                    }}
                  />
                ) : artifacts.thumbnailDataUrl ? (
                  <>
                    <img src={artifacts.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/35" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      {rendering ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-cyan" aria-hidden="true" />
                          <div className="w-[min(300px,75%)]">
                            <Progress value={progress} height={3} />
                            <div className="mt-1.5 text-center font-mono text-[9px] text-white/70">
                              Recording canvas + audio · {Math.round(progress * 100)}%
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={render}
                            disabled={!supportsVideoRender()}
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur transition-transform hover:scale-105 disabled:opacity-40"
                            aria-label="Render demo cut"
                          >
                            <Play className="h-4 w-4 fill-current text-white" />
                          </button>
                          <span className="text-[10px] text-white/75">
                            {supportsVideoRender() ? 'Render 10s demo cut (~real time)' : 'Recording unsupported in this browser'}
                          </span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="shimmer h-full w-full" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
                <Button size="sm" variant="primary" icon={videoUrl ? Download : Play} onClick={videoUrl ? downloadVideo : render} disabled={rendering || (!videoUrl && !supportsVideoRender())}>
                  {rendering ? 'Rendering…' : videoUrl ? 'Download cut' : 'Render demo cut'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={playing ? Square : Mic}
                  onClick={() => {
                    if (playing) {
                      stopSpeaking()
                      setPlaying(false)
                      return
                    }
                    if (!ttsSupported()) {
                      pushToast({ tone: 'error', title: 'Speech synthesis unavailable', description: 'Preview narration in a browser with a local voice engine.' })
                      return
                    }
                    speak(narrationText, artifacts.language, {
                      onStart: () => setPlaying(true),
                      onEnd: () => setPlaying(false),
                      onError: () => {
                        setPlaying(false)
                        pushToast({ tone: 'error', title: 'Narration preview failed' })
                      },
                    })
                  }}
                >
                  {playing ? 'Stop narration' : 'Narration preview'}
                </Button>
                <Button size="sm" variant="ghost" icon={RefreshCcw} onClick={render} disabled={rendering || !supportsVideoRender()}>
                  Re-render
                </Button>
                <span className="ml-auto font-mono text-[9px] text-txt-faint tnum">
                  {formatDuration(total)} · {artifacts.scenes.length} scenes
                </span>
              </div>
              {error ? (
                <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-100/90">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{error}</span>
                  <button className="underline underline-offset-2 hover:text-white" onClick={render}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>

            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="label text-[9px]">Timeline</span>
                <span className="font-mono text-[9px] text-txt-faint">Top-down assembly</span>
              </div>
              <div className="mt-2 flex h-9 gap-0.5 overflow-hidden rounded-lg border border-white/10 bg-black/40 p-0.5">
                {artifacts.scenes.map((scene, index) => {
                  const width = total > 0 ? ((scene.endSec - scene.startSec) / total) * 100 : 0
                  const palette = ['bg-cyan/60', 'bg-violet/55', 'bg-cyan/40', 'bg-violet/40', 'bg-cyan/30']
                  return (
                    <button
                      key={scene.id}
                      onClick={() => {
                        const el = document.getElementById(`storyboard-${scene.id}`)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      className={cx(
                        'group relative h-full rounded-[3px] transition-opacity hover:opacity-100',
                        palette[index % palette.length],
                      )}
                      style={{ width: `${Math.max(4, width)}%` }}
                      aria-label={`Scene ${index + 1}: ${scene.label}`}
                      title={`${scene.label} — ${stamp(scene.startSec)}–${stamp(scene.endSec)}`}
                    />
                  )
                })}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[8.5px] text-txt-faint">
                <span>0:00</span>
                <span>{stamp(total / 2)}</span>
                <span>{stamp(total)}</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {artifacts.scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  id={`storyboard-${scene.id}`}
                  className="panel flex flex-col gap-3 p-3 sm:flex-row"
                >
                  <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40 sm:h-[92px] sm:w-[150px]">
                    {artifacts.thumbnailDataUrl ? (
                      <img src={artifacts.thumbnailDataUrl} alt="" className="h-full w-full object-cover opacity-80" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 font-mono text-[8px] text-white/80">
                      S{String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[9px] font-medium leading-tight text-white/90">
                      {scene.label}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-txt-faint tnum">
                        {stamp(scene.startSec)}–{stamp(scene.endSec)}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">{scene.mood}</span>
                      <span className="ml-auto font-mono text-[9px] text-txt-faint">
                        {Math.max(1, Math.round(scene.endSec - scene.startSec))}s
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-txt-muted">{scene.narration}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-txt-faint">
                      <span>Visual: {scene.visual}</span>
                      <span>Shot: {scene.shot}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="panel p-4">
              <span className="label text-[9px]">Render status</span>
              <div className="mt-2 flex items-start gap-2">
                <span className={cx(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                  videoUrl ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300' : 'border-white/10 bg-white/[0.03] text-txt-faint',
                )}>
                  <Video className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] text-txt">{videoUrl ? 'Demo cut available' : 'No rendered file'}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-txt-faint">
                    {videoUrl
                      ? `${project.render?.mime?.split(';')[0] ?? localRender?.mime.split(';')[0] ?? 'video'} · ${project.render?.size ? formatAttachmentLabel(project.render.size) : localRender ? formatAttachmentLabel(localRender.size) : '—'}`
                      : 'Renders on demand. Nothing is pre-baked.'}
                  </div>
                  {project.render?.renderedAt ? (
                    <div className="mt-1 font-mono text-[9px] text-txt-faint">
                      Last render {new Date(project.render.renderedAt).toLocaleTimeString()}
                    </div>
                  ) : null}
                </div>
              </div>
              {videoUrl ? (
                <Button size="sm" variant="secondary" icon={Download} className="mt-2 w-full" onClick={downloadVideo}>
                  Download {project.render?.mime?.includes('mp4') ? 'MP4' : 'WebM'}
                </Button>
              ) : null}
            </div>

            <div className="panel p-4">
              <span className="label text-[9px]">Voice & captions</span>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-2">
                  <span className="text-[11px] text-txt-muted">Voice</span>
                  <span className="font-mono text-[9px] text-txt-faint">{artifacts.languageLabel}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-2">
                  <span className="text-[11px] text-txt-muted">Narration</span>
                  <span className="font-mono text-[9px] text-txt-faint">Browser TTS preview</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-2">
                  <span className="text-[11px] text-txt-muted">Subtitles</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] text-emerald-300">
                    <Check className="h-2.5 w-2.5" /> SRT ready
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[9.5px] leading-relaxed text-txt-faint">
                The demo cut draws scene cards and burned-in captions with an ambient audio bed. The voice preview is separate and never mixed into the recording.
              </p>
            </div>

            <div className="panel p-4">
              <span className="label text-[9px]">Assembly details</span>
              <div className="mt-2 space-y-1 text-[10.5px]">
                <div className="flex justify-between"><span className="text-txt-faint">Platform</span><span className="text-txt-muted">{platformLabel(project.platform)}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Aspect</span><span className="text-txt-muted">{project.platform === 'youtube-long' ? '16:9' : '9:16'}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Runtime</span><span className="text-txt-muted">{formatDuration(total)}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Scenes</span><span className="text-txt-muted">{artifacts.scenes.length}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Revision</span><span className="text-txt-muted">{project.revision}</span></div>
              </div>
            </div>

            <div className="flex items-start gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[9.5px] leading-relaxed text-txt-faint">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              Clips are recorded live and held as blob URLs. Download before leaving this tab; re-render any time.
            </div>
          </aside>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={SquarePlay}
            title="No footage to assemble"
            description="Once a production reaches the edit stage, its storyboard and render controls appear here."
            action={
              <Link to="/">
                <Button variant="primary" icon={Film}>
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
