import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Info,
  PenLine,
  Play,
  Save,
  Send,
  Sparkles,
  Square,
  Undo2,
} from 'lucide-react'
import { StudioProjectBar } from '../components/production/StudioProjectBar'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  StatusPill,
  Textarea,
} from '../components/ui'
import { baseName, copyText, downloadText, scriptMarkdown } from '../lib/exports'
import { speak, stopSpeaking, ttsSupported } from '../lib/voice'
import { useDemo } from '../lib/store'
import type { Project, Scene } from '../lib/types'
import { cx, formatDuration, platformLabel } from '../lib/utils'

function stamp(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export default function ScriptStudioPage() {
  const { state, actions, pushToast } = useDemo()
  const navigate = useNavigate()
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

  const [hook, setHook] = useState(artifacts?.hook ?? '')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sceneId, setSceneId] = useState(artifacts?.scenes[0]?.id ?? '')
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteText, setRewriteText] = useState('')
  const [speakingScene, setSpeakingScene] = useState<string | null>(null)

  const activeScene: Scene | undefined = artifacts?.scenes.find((s) => s.id === sceneId) ?? artifacts?.scenes[0]
  const activeNarration = activeScene ? drafts[activeScene.id] ?? activeScene.narration : ''

  const dirty =
    Boolean(artifacts) &&
    (hook !== artifacts!.hook ||
      artifacts!.scenes.some((scene) => drafts[scene.id] !== undefined && drafts[scene.id] !== scene.narration))

  const selectProject = (id: string) => {
    const next = projects.find((p) => p.id === id)
    setSelectedId(id)
    setParams({ project: id }, { replace: true })
    setDrafts({})
    setHook(next?.artifacts?.hook ?? '')
    setSceneId(next?.artifacts?.scenes[0]?.id ?? '')
  }

  const save = () => {
    if (!project || !artifacts) return
    actions.updateArtifact(project.id, {
      hook,
      scenes: artifacts.scenes.map((scene) => ({
        ...scene,
        narration: drafts[scene.id] ?? scene.narration,
      })),
    })
    pushToast({
      tone: 'success',
      title: 'Script saved',
      description: 'Edits are stored with the production. Regenerate artwork or render to reflect changes.',
    })
  }

  const revert = () => {
    if (!artifacts) return
    setDrafts({})
    setHook(artifacts.hook)
    pushToast({ tone: 'info', title: 'Unsaved edits reverted' })
  }

  const copyScene = async () => {
    if (!activeScene) return
    const ok = await copyText(activeNarration)
    pushToast(ok ? { tone: 'success', title: 'Scene copied' } : { tone: 'error', title: 'Clipboard unavailable' })
  }

  const openRewrite = () => {
    if (!activeScene) return
    setRewriteText(`Tighten scene “${activeScene.label}”. Keep the same claims and runtime, but make the narration more concrete and conversational.`)
    setRewriteOpen(true)
  }

  const submitRewrite = () => {
    if (!project || !rewriteText.trim()) return
    const session = state.sessions.find((s) => s.projectIds.includes(project.id))
    const result = actions.sendPrompt({
      text: `Revise this production: ${rewriteText.trim()}`,
      sessionId: session?.id ?? null,
      platform: project.platform,
      language: project.language,
    })
    setRewriteOpen(false)
    pushToast({ tone: 'info', title: 'Rewrite requested', description: 'The Executive Producer is revising the production.' })
    navigate(result.sessionId ? `/c/${result.sessionId}` : '/')
  }

  const totalWords = artifacts
    ? artifacts.scenes.reduce((sum, scene) => sum + words(drafts[scene.id] ?? scene.narration), 0)
    : 0

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Script Studio</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Edit hooks, scene narration and voice pacing. Saved edits stay attached to the production.
          </p>
        </div>
        {project ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={project.approved ? 'approved' : project.status} />
            <Link to={`/productions/${project.id}`}>
              <Button variant="secondary" icon={ArrowUpRight}>
                Deliverables
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
          emptyNote="No scripts yet. Start a production and the Scriptwriter will draft the first version."
        />
      </div>

      {project && artifacts ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="label text-[9px]">Scenes</span>
                <span className="font-mono text-[9px] text-txt-faint">{artifacts.scenes.length}</span>
              </div>
              <div className="scroll-thin max-h-[520px] overflow-y-auto p-1.5">
                {artifacts.scenes.map((scene, index) => {
                  const active = activeScene?.id === scene.id
                  const edited = drafts[scene.id] !== undefined && drafts[scene.id] !== scene.narration
                  return (
                    <button
                      key={scene.id}
                      onClick={() => {
                        stopSpeaking()
                        setSpeakingScene(null)
                        setSceneId(scene.id)
                      }}
                      className={cx(
                        'mb-1 flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors last:mb-0',
                        active ? 'border-cyan/25 bg-cyan/[0.06]' : 'border-transparent hover:bg-white/[0.03]',
                      )}
                    >
                      <span className={cx('mt-px font-mono text-[9px]', active ? 'text-cyan' : 'text-txt-faint')}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className={cx('truncate text-[11px]', active ? 'text-txt' : 'text-txt-muted')}>{scene.label}</span>
                          {edited ? <span className="h-1 w-1 shrink-0 rounded-full bg-amber-300" aria-label="Edited" /> : null}
                        </span>
                        <span className="mt-0.5 block font-mono text-[8.5px] text-txt-faint">
                          {stamp(scene.startSec)}–{stamp(scene.endSec)} · {words(drafts[scene.id] ?? scene.narration)}w
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="panel p-3">
              <span className="label text-[9px]">Script stats</span>
              <div className="mt-2 space-y-1 text-[10.5px]">
                <div className="flex justify-between"><span className="text-txt-faint">Runtime</span><span className="text-txt-muted">{formatDuration(artifacts.durationSec)}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Words</span><span className="text-txt-muted tnum">{totalWords}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Language</span><span className="text-txt-muted">{artifacts.languageLabel}</span></div>
                <div className="flex justify-between"><span className="text-txt-faint">Platform</span><span className="text-txt-muted">{platformLabel(project.platform)}</span></div>
              </div>
            </div>

            <div className="flex items-start gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5 text-[9.5px] leading-relaxed text-txt-faint">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              Text-to-speech is a browser preview only. Final narration would need a connected voice provider.
            </div>
          </aside>

          <div className="space-y-4">
            <div className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label text-[9px]">Opening hook</span>
                <div className="flex items-center gap-1.5">
                  {dirty ? <Badge mono tone="warn">Unsaved edits</Badge> : <Badge mono tone="success">Saved</Badge>}
                  <Button size="sm" variant="ghost" icon={Undo2} disabled={!dirty} onClick={revert}>
                    Revert
                  </Button>
                  <Button size="sm" variant="primary" icon={Save} disabled={!dirty} onClick={save}>
                    Save script
                  </Button>
                </div>
              </div>
              <Textarea
                value={hook}
                onChange={(event) => setHook(event.target.value)}
                rows={2}
                className="mt-2 text-[13px]"
                aria-label="Opening hook"
              />
              <div className="mt-1 flex justify-between font-mono text-[9px] text-txt-faint">
                <span>{words(hook)} words</span>
                <span>{hook.length} characters</span>
              </div>
            </div>

            {activeScene ? (
              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-cyan/20 bg-cyan/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-cyan/90 tnum">
                      {stamp(activeScene.startSec)}–{stamp(activeScene.endSec)}
                    </span>
                    <span className="text-[13px] font-medium text-txt">{activeScene.label}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">{activeScene.mood}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={speakingScene === activeScene.id ? 'Stop narration preview' : 'Preview narration'}
                      icon={speakingScene === activeScene.id ? Square : Play}
                      onClick={() => {
                        if (speakingScene === activeScene.id) {
                          stopSpeaking()
                          setSpeakingScene(null)
                          return
                        }
                        if (!ttsSupported()) {
                          pushToast({ tone: 'error', title: 'Speech synthesis unavailable' })
                          return
                        }
                        speak(activeNarration, artifacts.language, {
                          onStart: () => setSpeakingScene(activeScene.id),
                          onEnd: () => setSpeakingScene(null),
                          onError: () => {
                            setSpeakingScene(null)
                            pushToast({ tone: 'error', title: 'Narration preview failed' })
                          },
                        })
                      }}
                    />
                    <IconButton label="Copy scene narration" icon={Copy} onClick={() => void copyScene()} />
                  </div>
                </div>

                <Textarea
                  value={activeNarration}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [activeScene.id]: event.target.value }))}
                  rows={9}
                  className="mt-3 text-[13px] leading-[1.8]"
                  aria-label={`Narration for ${activeScene.label}`}
                />
                <div className="mt-1 flex justify-between font-mono text-[9px] text-txt-faint">
                  <span>{words(activeNarration)} words · target ≈ {Math.round(words(activeNarration) / Math.max(1, activeScene.endSec - activeScene.startSec) * 60)} wpm</span>
                  <span>
                    {drafts[activeScene.id] !== undefined && drafts[activeScene.id] !== activeScene.narration ? 'edited' : 'unchanged'}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                    <div className="label text-[8.5px]">Visual direction</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-txt-muted">{activeScene.visual}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                    <div className="label text-[8.5px]">Camera / shot</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-txt-muted">{activeScene.shot}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" icon={Sparkles} onClick={openRewrite}>
                Request rewrite
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
                Download .md
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={async () => {
                  const ok = await copyText(scriptMarkdown(project))
                  pushToast(ok ? { tone: 'success', title: 'Full script copied' } : { tone: 'error', title: 'Clipboard unavailable' })
                }}
              >
                Copy full script
              </Button>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] text-txt-faint">
                <Check className="h-2.5 w-2.5" /> saved locally
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={PenLine}
            title="No script to edit yet"
            description="Start a production and the Scriptwriter will produce a hook, scene breakdown and narration draft you can refine here."
            action={
              <Link to="/">
                <Button variant="primary" icon={PenLine}>
                  Start a production
                </Button>
              </Link>
            }
          />
        </div>
      )}

      <Modal
        open={rewriteOpen}
        onClose={() => setRewriteOpen(false)}
        title="Ask for a rewrite"
        description="This starts a new revision through the Executive Producer. Your current edits should be saved first."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRewriteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Send} disabled={!rewriteText.trim()} onClick={submitRewrite}>
              Send request
            </Button>
          </>
        }
      >
        <Textarea
          rows={4}
          value={rewriteText}
          onChange={(event) => setRewriteText(event.target.value)}
          autoFocus
        />
        <p className="mt-2 text-[10px] leading-relaxed text-txt-faint">
          The pipeline re-runs from strategy. Existing deliverables remain accessible until the revision completes.
        </p>
      </Modal>
    </div>
  )
}
