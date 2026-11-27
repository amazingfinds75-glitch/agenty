import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { attachArtwork } from './render'
import { STAGES, initialStageStates } from './pipeline'
import {
  buildArtifacts,
  detectLanguage,
  detectPlatform,
  formatFor,
  projectTitle,
  titleFromPrompt,
} from './generate'
import { createSeedState } from './seed'
import type {
  Artifacts,
  Attachment,
  CalendarEvent,
  DemoState,
  Language,
  MediaAsset,
  Message,
  Platform,
  Project,
  Session,
  Settings,
  Toast,
} from './types'
import { LANGUAGE_LABELS, formatBytes, uid } from './utils'
import { createWorkforceProduction, workforceErrorMessage } from './workforceApi'

const STORAGE_KEY = 'ai-viral-studio-v1'

interface LoadedState {
  state: DemoState
  recovered: number
  storageOk: boolean
}

function sanitizeForStorage(state: DemoState): DemoState {
  return {
    ...state,
    projects: state.projects.map((p) => ({
      ...p,
      render: p.render
        ? { renderedAt: p.render.renderedAt, mime: p.render.mime, size: p.render.size }
        : undefined,
    })),
    media: state.media.map((m) => {
      const keep = !!m.url && m.url.startsWith('data:') && m.url.length < 350_000
      return { ...m, url: keep ? m.url : undefined, sessionOnly: m.sessionOnly || !keep }
    }),
  }
}

function stripImages(state: DemoState): DemoState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.artifacts
        ? { ...p, artifacts: { ...p.artifacts, thumbnailDataUrl: undefined, coverDataUrl: undefined } }
        : p,
    ),
    media: state.media.map((m) => ({ ...m, thumbnail: undefined, url: undefined })),
  }
}

function writeStorage(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(state)))
    return true
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripImages(sanitizeForStorage(state))))
    } catch {
      /* storage unavailable — the demo keeps running in memory */
    }
    return false
  }
}

function loadState(): LoadedState {
  const seed = createSeedState()
  if (typeof window === 'undefined') return { state: seed, recovered: 0, storageOk: false }
  let storageOk = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: seed, recovered: 0, storageOk }
    const parsed = JSON.parse(raw) as DemoState
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return { state: seed, recovered: 0, storageOk }
    }
    let recovered = 0
    const projects = parsed.projects.map((p) => {
      if (p.status === 'running') {
        recovered += 1
        return { ...p, status: 'paused' as const }
      }
      return p
    })
    return {
      state: {
        ...seed,
        ...parsed,
        projects,
        settings: { ...seed.settings, ...parsed.settings, notifications: { ...seed.settings.notifications, ...parsed.settings?.notifications }, integrations: { ...seed.settings.integrations, ...parsed.settings?.integrations } },
        trends: seed.trends,
        activeSessionId: null,
      },
      recovered,
      storageOk,
    }
  } catch {
    storageOk = false
    return { state: seed, recovered: 0, storageOk }
  }
}

function nowISO() {
  return new Date().toISOString()
}

function makeMessage(partial: Omit<Message, 'id' | 'createdAt'> & { createdAt?: string }): Message {
  return { id: uid('msg'), createdAt: partial.createdAt ?? nowISO(), ...partial }
}

function bumpSession(sessions: Session[], sessionId: string, message: Message): Session[] {
  return sessions.map((s) =>
    s.id === sessionId
      ? { ...s, messages: [...s.messages, message], updatedAt: message.createdAt }
      : s,
  )
}

function detectIntent(text: string): 'plan' | 'trend' | 'production' {
  const t = text.toLowerCase()
  if (/content plan|content calendar|weekly plan|weekly calendar|schedule my week|posting plan/.test(t)) {
    return 'plan'
  }
  const wantsProduce =
    /create|make|generate|produce|write|script|reel|short|video|documentary|explainer|edit/.test(t)
  const wantsTrend = /trend|trending|what'?s hot|worth covering|topics/.test(t)
  if (wantsTrend && !wantsProduce) return 'trend'
  return 'production'
}

function looksLikeRevision(text: string) {
  const t = text.toLowerCase()
  const revisionary =
    /(change|rewrite|revise|revision|shorter|longer|stronger|hook|title|tone|regenerate|redo|fix|adjust|instead|swap|improve|tighten|punchier|calmer|faster|clearer)/.test(
      t,
    )
  const newWork = /(new|another|from scratch|create|start|fresh|second|different topic)/.test(t)
  return revisionary && !newWork
}

function planEvent(state: DemoState) {
  const base = new Date()
  const items: Array<{ offset: number; title: string; platform: Platform }> = [
    { offset: 1, title: 'Short · today’s strongest AI signal', platform: 'youtube-short' },
    { offset: 2, title: 'Reel · behind the headline explainer', platform: 'instagram-reel' },
    { offset: 3, title: 'Short · myth vs. reality', platform: 'youtube-short' },
    { offset: 4, title: 'Reel · creator workflow teardown', platform: 'instagram-reel' },
    { offset: 5, title: 'Short · week in review', platform: 'youtube-short' },
  ]
  const events: CalendarEvent[] = items.map((item, index) => {
    const d = new Date(base)
    d.setDate(d.getDate() + item.offset)
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      id: uid('cal'),
      title: item.title,
      date: isoDate,
      time: index % 2 === 0 ? '09:30' : '18:30',
      platform: item.platform,
      status: 'planned',
    }
  })
  return { events, summary: items }
}

function advanceProjects(state: DemoState, deltaMs: number): DemoState {
  if (!state.projects.some((p) => p.status === 'running')) return state
  let sessions = state.sessions
  const speed = state.simSpeed
  const tone = state.settings.tone

  const projects = state.projects.map((project) => {
    if (project.status !== 'running') return project

    let stageIndex = project.stageIndex
    let progress = project.stageProgress
    const stages = project.stages.map((s) => ({ ...s }))
    let status: Project['status'] = 'running'
    let artifacts = project.artifacts
    let completedAt: string | undefined
    let guard = 0

    while (status === 'running' && guard < 24) {
      guard += 1
      const def = STAGES[stageIndex]
      if (!def) {
        status = 'completed'
        break
      }
      progress += (deltaMs * speed) / def.durationMs
      if (progress < 1) break

      const completedTime = nowISO()
      stages[stageIndex] = {
        ...stages[stageIndex],
        status: 'completed',
        progress: 1,
        completedAt: completedTime,
      }
      const carry = progress - 1
      stageIndex += 1

      if (stageIndex >= STAGES.length) {
        status = 'completed'
        completedAt = completedTime
        artifacts = buildArtifacts({
          prompt: project.prompt,
          platform: project.platform,
          language: project.language,
          seed: project.seed,
          tone,
        })
        break
      }

      stages[stageIndex] = {
        ...stages[stageIndex],
        status: 'working',
        progress: 0,
        startedAt: completedTime,
      }
      const nextDef = STAGES[stageIndex]
      progress = (carry * def.durationMs) / nextDef.durationMs

      if (nextDef.id === 'edit' && project.sessionId) {
        sessions = bumpSession(
          sessions,
          project.sessionId,
          makeMessage({
            role: 'assistant',
            kind: 'progress',
            content:
              'Assembly cut is in. Narration, visuals and caption tracks are locked — quality control runs next, then I’ll bring you the deliverables.',
            projectId: project.id,
          }),
        )
      }
      if (nextDef.id === 'qc' && project.sessionId) {
        sessions = bumpSession(
          sessions,
          project.sessionId,
          makeMessage({
            role: 'assistant',
            kind: 'progress',
            content:
              'Quality control is checking playback, audio levels, captions and platform compliance. This is where problems get caught before you see them.',
            projectId: project.id,
          }),
        )
      }
    }

    if (status === 'completed' && project.sessionId) {
      const title = artifacts?.title ?? project.title
      sessions = bumpSession(
        sessions,
        project.sessionId,
        makeMessage({
          role: 'assistant',
          kind: 'deliverable',
          content: `Production complete. “${title}” is cut, captioned and packaged for ${formatFor(project.platform).format}. Open the deliverables to review, download or request changes. Nothing is published automatically.`,
          projectId: project.id,
          meta: { title },
        }),
      )
    }

    return {
      ...project,
      stages,
      stageIndex: Math.min(stageIndex, STAGES.length - 1),
      stageProgress: status === 'completed' ? 1 : Math.min(0.99, progress),
      stageStartedAt: stages[stageIndex]?.startedAt,
      status,
      artifacts,
      completedAt: completedAt ?? project.completedAt,
      updatedAt: completedAt ?? nowISO(),
    }
  })

  return { ...state, projects, sessions }
}

interface SendPromptInput {
  text: string
  attachments?: Attachment[]
  sessionId?: string | null
  platform?: Platform | 'auto'
  language?: Language | 'auto'
}

interface SendPromptResult {
  sessionId: string
  projectId?: string
  intent: 'plan' | 'trend' | 'production' | 'revision'
}

interface DemoActions {
  sendPrompt: (input: SendPromptInput) => SendPromptResult
  newChat: () => void
  setActiveSession: (id: string | null) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
  togglePinSession: (id: string) => void
  pauseProject: (id: string) => void
  resumeProject: (id: string) => void
  cancelProject: (id: string) => void
  retryProject: (id: string) => void
  failProject: (id: string) => void
  approveProject: (id: string) => void
  setSimSpeed: (speed: number) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetDemo: () => void
  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => void
  updateCalendarEvent: (id: string, patch: Partial<CalendarEvent>) => void
  deleteCalendarEvent: (id: string) => void
  scheduleProject: (id: string, date: string, time: string) => void
  addUploads: (files: File[]) => Promise<void>
  removeMedia: (id: string) => void
  setProjectRender: (id: string, render: NonNullable<Project['render']>) => void
  updateArtifact: (id: string, patch: Partial<Artifacts>) => void
  refreshArtwork: (id: string) => Promise<void>
}

interface DemoContextValue {
  state: DemoState
  actions: DemoActions
  toasts: Toast[]
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const loaded = useMemo(loadState, [])
  const [state, setState] = useState<DemoState>(loaded.state)
  const [toasts, setToasts] = useState<Toast[]>([])
  const stateRef = useRef(state)
  stateRef.current = state
  const artworkInFlight = useRef<Set<string>>(new Set())
  const statusRef = useRef<Record<string, Project['status']>>(
    Object.fromEntries(loaded.state.projects.map((p) => [p.id, p.status])),
  )
  const saveTimer = useRef<number | null>(null)
  const recoveredShown = useRef(false)

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = uid('toast')
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4800)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (recoveredShown.current) return
    recoveredShown.current = true
    if (loaded.recovered > 0) {
      pushToast({
        tone: 'info',
        title: 'Recovered an interrupted production',
        description: `${loaded.recovered} job${loaded.recovered > 1 ? 's were' : ' was'} paused when the page closed. Resume it from Active Productions.`,
      })
    }
    if (!loaded.storageOk) {
      pushToast({
        tone: 'error',
        title: 'Local storage unavailable',
        description: 'This demo keeps state in memory only, so a reload resets the workspace.',
      })
    }
  }, [loaded, pushToast])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) return
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      writeStorage(stateRef.current)
    }, 1400)
  }, [])

  useEffect(() => {
    scheduleSave()
  }, [state, scheduleSave])

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      writeStorage(stateRef.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const prefersReduced =
      state.settings.motion === 'off' ||
      (state.settings.motion === 'system' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    root.dataset.motion = prefersReduced ? 'off' : 'on'
  }, [state.settings.motion])

  // production clock
  useEffect(() => {
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const delta = now - last
      last = now
      const hasRunning = stateRef.current.projects.some((p) => p.status === 'running')
      if (!hasRunning) return
      setState((prev) => advanceProjects(prev, delta))
    }
    const interval = window.setInterval(tick, 600)
    const onVisible = () => {
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // completion / failure toasts
  useEffect(() => {
    for (const project of state.projects) {
      const prev = statusRef.current[project.id]
      if (prev !== project.status) {
        if (project.status === 'completed' && prev) {
          pushToast({
            tone: 'success',
            title: 'Production complete',
            description: `${project.title} is ready for review.`,
          })
        }
        if (project.status === 'failed') {
          pushToast({
            tone: 'error',
            title: 'A production stage failed',
            description: 'Open the production panel to retry the failed stage.',
          })
        }
        statusRef.current[project.id] = project.status
      }
    }
  }, [state.projects, pushToast])

  // artwork generation for completed projects
  useEffect(() => {
    for (const project of state.projects) {
      if (project.status !== 'completed') continue
      if (project.artifacts?.thumbnailDataUrl) continue
      if (!project.artifacts) continue
      if (artworkInFlight.current.has(project.id)) continue
      artworkInFlight.current.add(project.id)
      attachArtwork(project.artifacts, project.platform)
        .then((artifacts) => {
          setState((prev) => ({
            ...prev,
            projects: prev.projects.map((p) =>
              p.id === project.id ? { ...p, artifacts } : p,
            ),
            media: mergeMedia(prev.media, buildMediaForProject(project.id, artifacts, project)),
          }))
        })
        .catch(() => undefined)
        .finally(() => {
          artworkInFlight.current.delete(project.id)
        })
    }
  }, [state.projects])

  const actions = useMemo<DemoActions>(() => {
    const update = (fn: (prev: DemoState) => DemoState) => setState(fn)

    const sendPrompt: DemoActions['sendPrompt'] = (input) => {
      const text = input.text.trim()
      const prev = stateRef.current
      const existing = input.sessionId
        ? prev.sessions.find((s) => s.id === input.sessionId)
        : undefined
      const sessionId = existing?.id ?? input.sessionId ?? uid('session')
      const attachments = input.attachments ?? []
      const userMsg = makeMessage({
        role: 'user',
        kind: 'text',
        content: text,
        projectId: undefined,
        attachments: attachments.length ? attachments : undefined,
      })
      const prevProjects = prev.projects.filter((p) => p.sessionId === sessionId)
      const latestProject = prevProjects.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0]
      const revisionIntent = !!latestProject && looksLikeRevision(text)
      let intent = detectIntent(text)
      if (revisionIntent) intent = 'production'
      const resultIntent: SendPromptResult['intent'] = revisionIntent
        ? 'revision'
        : intent === 'production'
          ? 'production'
          : intent
      const platform: Platform =
        (input.platform && input.platform !== 'auto' ? input.platform : undefined) ??
        detectPlatform(text) ??
        (latestProject ? latestProject.platform : prev.settings.defaultPlatform)
      const language: Language =
        (input.language && input.language !== 'auto' ? input.language : undefined) ??
        detectLanguage(text) ??
        (latestProject ? latestProject.language : prev.settings.language)
      const seed = Math.floor(Math.random() * 90000) + 1000

      if (revisionIntent && latestProject) {
        const nextSeed = latestProject.seed + 97 * (latestProject.revision + 1)
        const rebuilt = latestProject.artifacts
          ? buildArtifacts({
              prompt: latestProject.prompt,
              platform: latestProject.platform,
              language: latestProject.language,
              seed: nextSeed,
              tone: prev.settings.tone,
            })
          : undefined
        const artifacts =
          rebuilt && latestProject.artifacts
            ? {
                ...rebuilt,
                title: latestProject.artifacts.title,
                titleOptions: [latestProject.artifacts.title, ...rebuilt.titleOptions.slice(1)],
                youtubeTitle: latestProject.artifacts.youtubeTitle,
              }
            : rebuilt
        update((current) => {
          const sessionExists = current.sessions.some((s) => s.id === sessionId)
          const withUser: Session[] = sessionExists
            ? current.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: [...s.messages, userMsg],
                      updatedAt: userMsg.createdAt,
                      projectIds: s.projectIds.includes(latestProject.id)
                        ? s.projectIds
                        : [...s.projectIds, latestProject.id],
                    }
                  : s,
              )
            : [
                {
                  id: sessionId,
                  title: latestProject.title,
                  createdAt: nowISO(),
                  updatedAt: nowISO(),
                  projectIds: [latestProject.id],
                  messages: [userMsg],
                },
                ...current.sessions,
              ]
          return {
            ...current,
            sessions: bumpSession(
              withUser,
              sessionId,
              makeMessage({
                role: 'assistant',
                kind: 'revision',
                content:
                  'Revision is in. I reworked the opening beats and refreshed the hook around your note. The thumbnail and captions are regenerating now — open the deliverables to compare the new cut.',
                projectId: latestProject.id,
                meta: {
                  title: latestProject.title,
                  actionLabel: 'Open deliverables',
                  actionTo: `/productions/${latestProject.id}`,
                },
              }),
            ),
            projects: current.projects.map((p) =>
              p.id === latestProject.id
                ? {
                    ...p,
                    revision: p.revision + 1,
                    approved: false,
                    artifacts,
                    updatedAt: nowISO(),
                  }
                : p,
            ),
            activeSessionId: sessionId,
          }
        })
        if (artifacts) {
          attachArtwork(artifacts, latestProject.platform)
            .then((withArt) => {
              setState((curr) => ({
                ...curr,
                projects: curr.projects.map((p) =>
                  p.id === latestProject.id && p.artifacts ? { ...p, artifacts: { ...withArt, title: p.artifacts.title } } : p,
                ),
                media: mergeMedia(curr.media, buildMediaForProject(latestProject.id, withArt, latestProject)),
              }))
            })
            .catch(() => undefined)
        }
        pushToast({
          tone: 'success',
          title: 'Revision applied',
          description: 'New script variant and refreshed artwork generated locally.',
        })
        return { sessionId, projectId: latestProject.id, intent: 'revision' }
      }

      if (intent === 'trend') {
        update((current) => {
          const top = current.trends.slice(0, 3)
          const content = `Here’s what stands out in the studio’s demo signal set:\n\n${top
            .map(
              (t, i) =>
                `${i + 1}. ${t.title} — ${t.growth}% momentum, ${t.volume} sampled reach. ${t.hooks[0]}.`,
            )
            .join('\n\n')}\n\nRecommendation: lead with “${top[0]?.hooks[0]}” as a Short, and keep the visual trend for a Reel. This demo dataset is illustrative, not live research.`
          const sessions = current.sessions.some((s) => s.id === sessionId)
            ? bumpSession(current.sessions, sessionId, userMsg)
            : [
                {
                  id: sessionId,
                  title: titleFromPrompt(text),
                  createdAt: nowISO(),
                  updatedAt: nowISO(),
                  projectIds: [],
                  messages: [userMsg],
                },
                ...current.sessions,
              ]
          return {
            ...current,
            sessions: bumpSession(
              sessions,
              sessionId,
              makeMessage({
                role: 'assistant',
                kind: 'text',
                content,
                meta: { actionLabel: 'Open Trend Intelligence', actionTo: '/trends' },
              }),
            ),
            activeSessionId: sessionId,
          }
        })
        return { sessionId, intent: 'trend' }
      }

      if (intent === 'plan') {
        const { events, summary } = planEvent(prev)
        update((current) => {
          const sessions = current.sessions.some((s) => s.id === sessionId)
            ? bumpSession(current.sessions, sessionId, userMsg)
            : [
                {
                  id: sessionId,
                  title: titleFromPrompt(text),
                  createdAt: nowISO(),
                  updatedAt: nowISO(),
                  projectIds: [],
                  messages: [userMsg],
                },
                ...current.sessions,
              ]
          return {
            ...current,
            sessions: bumpSession(
              sessions,
              sessionId,
              makeMessage({
                role: 'assistant',
                kind: 'text',
                content: `Drafted a five-day publishing plan and added it to your calendar:\n\n${summary
                  .map((s, i) => `${i + 1}. Day +${s.offset} · ${s.title} (${s.platform === 'instagram-reel' ? 'Reel' : 'Short'})`)
                  .join('\n')}\n\nEach slot is editable in the calendar. Pick a slot and I’ll turn it into a full production.`,
                meta: { actionLabel: 'Open Content Calendar', actionTo: '/calendar' },
              }),
            ),
            calendar: [...current.calendar, ...events],
            activeSessionId: sessionId,
          }
        })
        pushToast({ tone: 'success', title: 'Weekly plan created', description: '5 slots added to the content calendar.' })
        return { sessionId, intent: 'plan' }
      }

      // production
      const projectId = uid('proj')
      const planMessageId = uid('msg')
      const title = projectTitle(text, platform, language)
      update((current) => {
        const sessions = current.sessions.some((s) => s.id === sessionId)
          ? bumpSession(current.sessions, sessionId, userMsg)
          : [
              {
                id: sessionId,
                title,
                createdAt: nowISO(),
                updatedAt: nowISO(),
                projectIds: [],
                messages: [userMsg],
              },
              ...current.sessions,
            ]
        const project: Project = {
          id: projectId,
          sessionId,
          title,
          prompt: text,
          platform,
          language,
          format: formatFor(platform).format,
          status: 'running',
          createdAt: nowISO(),
          updatedAt: nowISO(),
          stageIndex: 0,
          stageProgress: 0,
          stageStartedAt: nowISO(),
          stages: initialStageStates(),
          approved: false,
          demo: true,
          seed,
          revision: 0,
          quality: current.settings.quality === 'high' ? 'high' : 'balanced',
        }
        const planMessage: Message = {
          id: planMessageId,
          role: 'assistant',
          kind: 'plan',
          createdAt: nowISO(),
          projectId,
          content: `Brief parsed. ${formatFor(platform).format} in ${LANGUAGE_LABELS[language]}, built for ${platform === 'instagram-reel' ? 'feed-first discovery' : platform === 'youtube-long' ? 'search and long-session watch' : 'fast-paced retention'}. This canvas is the studio preview (simulated). The same brief is being sent to the live workforce now — its manager picks the specialists, and the real task board, memory and render live in Agent Workforce.`,
          meta: {
            title: 'Production plan',
            stages: STAGES.map((s) => s.name),
          },
        }
        return {
          ...current,
          sessions: [
            ...bumpSession(sessions, sessionId, planMessage).map((s) =>
              s.id === sessionId ? { ...s, projectIds: [...s.projectIds, projectId], title } : s,
            ),
          ],
          projects: [project, ...current.projects],
          activeSessionId: sessionId,
        }
      })

      const durationSec = platform === 'instagram-reel' ? 30 : platform === 'youtube-short' ? 45 : 480
      void createWorkforceProduction({ topic: text, platform, language, durationSec })
        .then(({ production }) => {
          const specialists = production.plan.agentIds.length
          const created = production.plan.createdAgents?.length ?? 0
          setState((current) => ({
            ...current,
            projects: current.projects.map((p) =>
              p.id === projectId ? { ...p, workforceId: production.id } : p,
            ),
            sessions: bumpSession(
              current.sessions,
              sessionId,
              makeMessage({
                role: 'assistant',
                kind: 'note',
                content: `The live workforce accepted this brief as ${production.id}. The manager planned ${production.plan.capabilities?.length ?? specialists} tasks across ${specialists} specialists${created ? ` and the factory created ${created} new ${created === 1 ? 'role' : 'roles'}` : ''}. Real task, memory and render state is in Agent Workforce. Narration audio and external video models remain blocked until providers are configured; the browser renderer produces the video file.`,
                projectId,
                meta: {
                  title: 'Live workforce production',
                  actionLabel: 'Open live workforce',
                  actionTo: `/workforce?p=${production.id}`,
                },
              }),
            ),
          }))
          pushToast({
            tone: 'success',
            title: 'Live workforce production started',
            description: `${production.id} · ${specialists} specialists · ${created} created by the factory.`,
          })
        })
        .catch((error) => {
          pushToast({
            tone: 'info',
            title: 'Live workforce not started',
            description: `${workforceErrorMessage(error)} The canvas preview above is simulated and no real production was created.`,
          })
        })
      return { sessionId, projectId, intent: 'production' }
    }

    return {
      sendPrompt,
      newChat: () => setState((prev) => ({ ...prev, activeSessionId: null })),
      setActiveSession: (id) => setState((prev) => ({ ...prev, activeSessionId: id })),
      renameSession: (id, title) =>
        setState((prev) => ({
          ...prev,
          sessions: prev.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        })),
      deleteSession: (id) =>
        setState((prev) => {
          const session = prev.sessions.find((s) => s.id === id)
          return {
            ...prev,
            sessions: prev.sessions.filter((s) => s.id !== id),
            projects: prev.projects.filter((p) => !session?.projectIds.includes(p.id)),
            activeSessionId: prev.activeSessionId === id ? null : prev.activeSessionId,
          }
        }),
      togglePinSession: (id) =>
        setState((prev) => ({
          ...prev,
          sessions: prev.sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
        })),
      pauseProject: (id) =>
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id && p.status === 'running' ? { ...p, status: 'paused' } : p,
          ),
        })),
      resumeProject: (id) =>
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id && (p.status === 'paused' || p.status === 'failed')
              ? {
                  ...p,
                  status: 'running',
                  error: undefined,
                  stages: p.stages.map((s) =>
                    s.status === 'failed' ? { ...s, status: 'working' } : s,
                  ),
                }
              : p,
          ),
        })),
      cancelProject: (id) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id && (p.status === 'running' || p.status === 'paused')
              ? { ...p, status: 'cancelled', stageProgress: p.stageProgress }
              : p,
          ),
          sessions: project?.sessionId
            ? bumpSession(
                prev.sessions,
                project.sessionId,
                makeMessage({
                  role: 'assistant',
                  kind: 'note',
                  content:
                    'Production cancelled. Work already completed is preserved in the project, and nothing was published.',
                  projectId: id,
                }),
              )
            : prev.sessions,
        }))
        pushToast({ tone: 'info', title: 'Production cancelled' })
      },
      retryProject: (id) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        if (!project) return
        setState((prev) => {
          const projects = prev.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: 'running' as const,
                  error: undefined,
                  updatedAt: nowISO(),
                  stages: p.stages.map((s, i) =>
                    s.status === 'failed'
                      ? { ...s, status: 'working' as const, error: undefined, progress: Math.max(0.2, s.progress) }
                      : i === p.stageIndex && s.status === 'pending'
                        ? { ...s, status: 'working' as const }
                        : s,
                  ),
                }
              : p,
          )
          const sessions = project.sessionId
            ? bumpSession(
                prev.sessions,
                project.sessionId,
                makeMessage({
                  role: 'assistant',
                  kind: 'progress',
                  content: `Retrying “${STAGES[project.stageIndex]?.name ?? 'the failed stage'}”. The team keeps everything completed so far — you won’t lose the cut.`,
                  projectId: id,
                }),
              )
            : prev.sessions
          return { ...prev, projects, sessions }
        })
        pushToast({ tone: 'info', title: 'Stage retry started' })
      },
      failProject: (id) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        if (!project || project.status !== 'running') return
        const stage = STAGES[project.stageIndex]
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: 'failed',
                  error: `The ${stage.agentIds.join(', ')} stage did not return a usable result.`,
                  stages: p.stages.map((s, i) =>
                    i === p.stageIndex ? { ...s, status: 'failed', error: 'Stage timeout' } : s,
                  ),
                }
              : p,
          ),
          sessions: project.sessionId
            ? bumpSession(
                prev.sessions,
                project.sessionId,
                makeMessage({
                  role: 'assistant',
                  kind: 'error',
                  content: `A stage failed during “${stage.name}”. The rest of the project is intact. Retry the stage to continue from here — this failure was triggered manually from the demo controls.`,
                  projectId: id,
                  meta: { errorKind: 'AGENT_FAILURE' },
                }),
              )
            : prev.sessions,
        }))
      },
      approveProject: (id) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        if (!project) return
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id ? { ...p, approved: true, updatedAt: nowISO() } : p,
          ),
          calendar: prev.calendar.some((c) => c.projectId === id && c.status === 'ready')
            ? prev.calendar
            : [
                ...prev.calendar,
                {
                  id: uid('cal'),
                  title: `Publish · ${project.title}`,
                  date: new Date().toISOString().slice(0, 10),
                  time: '18:00',
                  platform: project.platform,
                  status: 'ready',
                  projectId: id,
                },
              ],
        }))
        pushToast({
          tone: 'success',
          title: 'Deliverable approved',
          description: 'Publishing is not connected, so nothing is uploaded automatically.',
        })
      },
      setSimSpeed: (speed) => setState((prev) => ({ ...prev, simSpeed: speed })),
      updateSettings: (patch) =>
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...patch,
            notifications: { ...prev.settings.notifications, ...(patch.notifications ?? {}) },
            integrations: { ...prev.settings.integrations, ...(patch.integrations ?? {}) },
          },
        })),
      resetDemo: () => {
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* ignore */
        }
        const fresh = createSeedState()
        statusRef.current = Object.fromEntries(fresh.projects.map((p) => [p.id, p.status]))
        artworkInFlight.current.clear()
        setState(fresh)
        pushToast({ tone: 'info', title: 'Demo workspace reset' })
      },
      addCalendarEvent: (event) =>
        setState((prev) => ({
          ...prev,
          calendar: [...prev.calendar, { ...event, id: uid('cal') }],
        })),
      updateCalendarEvent: (id, patch) =>
        setState((prev) => ({
          ...prev,
          calendar: prev.calendar.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteCalendarEvent: (id) =>
        setState((prev) => ({ ...prev, calendar: prev.calendar.filter((c) => c.id !== id) })),
      scheduleProject: (id, date, time) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        if (!project) return
        setState((prev) => ({
          ...prev,
          calendar: [
            ...prev.calendar,
            {
              id: uid('cal'),
              title: `Publish · ${project.title}`,
              date,
              time,
              platform: project.platform,
              status: 'ready',
              projectId: id,
            },
          ],
        }))
        pushToast({ tone: 'success', title: 'Added to content calendar' })
      },
      addUploads: async (files) => {
        const accepted = files.filter((f) => f.size <= 5 * 1024 * 1024)
        if (accepted.length !== files.length) {
          pushToast({
            tone: 'error',
            title: 'Some files were skipped',
            description: 'The demo accepts files up to 5 MB.',
          })
        }
        const assets: MediaAsset[] = []
        for (const file of accepted) {
          const isImage = file.type.startsWith('image/')
          const isVideo = file.type.startsWith('video/')
          const isAudio = file.type.startsWith('audio/')
          let url: string | undefined
          if (isImage && file.size < 1_200_000) {
            url = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = () => resolve('')
              reader.readAsDataURL(file)
            })
          }
          assets.push({
            id: uid('media'),
            name: file.name,
            type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document',
            size: file.size,
            createdAt: nowISO(),
            source: 'uploaded',
            url: url || undefined,
            thumbnail: isImage ? url : undefined,
            sessionOnly: !url,
            assetKind: 'upload',
            detail: `${file.type || 'file'} · ${
              !url ? 'preview is session-only in this demo' : 'stored in local demo storage'
            }`,
          })
        }
        setState((prev) => ({ ...prev, media: [...assets, ...prev.media] }))
        pushToast({
          tone: 'success',
          title: `${assets.length} file${assets.length === 1 ? '' : 's'} attached to the media library`,
          description: 'Uploads stay in this browser — nothing is sent to a server.',
        })
      },
      removeMedia: (id) =>
        setState((prev) => ({ ...prev, media: prev.media.filter((m) => m.id !== id) })),
      setProjectRender: (id, render) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => (p.id === id ? { ...p, render } : p)),
          media: project
            ? [
                {
                  id: `media-${id}-video`,
                  name: `${project.title} — demo render`,
                  type: 'video',
                  size: render.size ?? 0,
                  createdAt: nowISO(),
                  projectId: id,
                  source: 'generated',
                  url: render.url,
                  sessionOnly: true,
                  assetKind: 'video',
                  detail: `${render.mime ?? 'video'} · rendered locally · session only`,
                },
                ...prev.media.filter((m) => m.id !== `media-${id}-video`),
              ]
            : prev.media,
        }))
      },
      updateArtifact: (id, patch) => {
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === id && p.artifacts
              ? {
                  ...p,
                  artifacts: { ...p.artifacts, ...patch, thumbnailDataUrl: undefined, coverDataUrl: undefined },
                }
              : p,
          ),
        }))
      },
      refreshArtwork: async (id) => {
        const project = stateRef.current.projects.find((p) => p.id === id)
        if (!project?.artifacts) return
        const artifacts = await attachArtwork(project.artifacts, project.platform)
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => (p.id === id ? { ...p, artifacts } : p)),
          media: mergeMedia(prev.media, buildMediaForProject(id, artifacts, project)),
        }))
        pushToast({ tone: 'success', title: 'Artwork refreshed' })
      },
    }
  }, [pushToast])

  const value = useMemo(
    () => ({ state, actions, toasts, pushToast, dismissToast }),
    [state, actions, toasts, pushToast, dismissToast],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

function buildMediaForProject(projectId: string, artifacts: Artifacts, project: Project): MediaAsset[] {
  const createdAt = nowISO()
  const items: MediaAsset[] = []
  if (artifacts.thumbnailDataUrl) {
    items.push({
      id: `media-${projectId}-thumb`,
      name: `${artifacts.title} — thumbnail`,
      type: 'image',
      size: Math.round(artifacts.thumbnailDataUrl.length * 0.72),
      createdAt,
      projectId,
      source: 'generated',
      thumbnail: artifacts.thumbnailDataUrl,
      url: artifacts.thumbnailDataUrl,
      assetKind: 'thumbnail',
      detail: '16:9 · 1280×720 · JPEG',
    })
  }
  if (artifacts.coverDataUrl) {
    items.push({
      id: `media-${projectId}-cover`,
      name: `${artifacts.title} — Reel cover`,
      type: 'image',
      size: Math.round(artifacts.coverDataUrl.length * 0.72),
      createdAt,
      projectId,
      source: 'generated',
      thumbnail: artifacts.coverDataUrl,
      url: artifacts.coverDataUrl,
      assetKind: 'cover',
      detail: '9:16 · 720×1280 · JPEG',
    })
  }
  items.push(
    {
      id: `media-${projectId}-script`,
      name: `${artifacts.title} — script`,
      type: 'document',
      size: artifacts.srt.length * 3 + 2048,
      createdAt,
      projectId,
      source: 'generated',
      assetKind: 'script',
      detail: 'Markdown · 6 scenes · demo copy',
    },
    {
      id: `media-${projectId}-srt`,
      name: `${artifacts.title} — captions.srt`,
      type: 'document',
      size: artifacts.srt.length,
      createdAt,
      projectId,
      source: 'generated',
      assetKind: 'srt',
      detail: `SRT · ${artifacts.languageLabel} · ${artifacts.srt.split('\n\n').length} cues`,
    },
    {
      id: `media-${projectId}-voice`,
      name: `${artifacts.title} — narration preview`,
      type: 'audio',
      size: 0,
      createdAt,
      projectId,
      source: 'generated',
      assetKind: 'narration',
      detail: `${artifacts.languageLabel} · browser voice preview`,
    },
  )
  void project
  return items
}

function mergeMedia(existing: MediaAsset[], incoming: MediaAsset[]) {
  const incomingIds = new Set(incoming.map((m) => m.id))
  return [...incoming, ...existing.filter((m) => !incomingIds.has(m.id))]
}

export function useDemo() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside DemoProvider')
  return ctx
}

export function useSessionProject(sessionId?: string | null) {
  const { state } = useDemo()
  const session = sessionId ? state.sessions.find((s) => s.id === sessionId) : undefined
  const projects = session
    ? state.projects.filter((p) => session.projectIds.includes(p.id))
    : []
  const project = projects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]
  return { session, project, projects }
}

export function useProject(id?: string | null) {
  const { state } = useDemo()
  return id ? state.projects.find((p) => p.id === id) : undefined
}

export function formatAttachmentLabel(size: number) {
  return formatBytes(size)
}
