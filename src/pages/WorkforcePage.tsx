import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Bot,
  Brain,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  ThumbsUp,
  Users,
  Video,
  Wand2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  SectionHeader,
  Select,
  Stat,
  StatusPill,
  Textarea,
} from '../components/ui'
import { useDemo } from '../lib/store'
import { renderDemoVideo, supportsVideoRender } from '../lib/render'
import type { Artifacts, Platform } from '../lib/types'
import {
  addWorkforceMemory,
  approveWorkforceProduction,
  controlWorkforceProduction,
  createWorkforceAgent,
  createWorkforceProduction,
  decideWorkforceImprovement,
  feedbackWorkforceProduction,
  fetchWorkforceAgent,
  fetchWorkforceAgents,
  fetchWorkforceEvents,
  fetchWorkforceImprovements,
  fetchWorkforceProductions,
  fetchWorkforceProduction,
  fetchWorkforceStatus,
  formatBytes,
  improveWorkforceProduction,
  retireWorkforceAgent,
  testWorkforceAgent,
  updateWorkforceAgent,
  uploadWorkforceRender,
  workforceArtifactUrl,
  workforceErrorMessage,
  workforceRenderUrl,
  type QualityCheck,
  type WorkerAgent,
  type WorkerAgentDetail,
  type WorkerMemoryEntry,
  type WorkforceEvent,
  type WorkforceImprovement,
  type WorkforceLanguage,
  type WorkforceProduction,
  type WorkforceProductionSummary,
  type WorkforceStatus,
} from '../lib/workforceApi'

const PLATFORM_LABEL: Record<string, string> = {
  'instagram-reel': 'Instagram Reel · 9:16',
  'youtube-short': 'YouTube Short · 9:16',
  'youtube-long': 'YouTube long-form · 16:9',
}

const LANGUAGE_LABEL: Record<string, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
  kn: 'Kannada',
}

const EVENT_TONE: Record<string, string> = {
  'task.completed': 'text-emerald-300',
  'task.failed': 'text-rose-300',
  'task.retry': 'text-amber-200',
  'task.skipped': 'text-txt-faint',
  'production.completed': 'text-emerald-300',
  'production.failed': 'text-rose-300',
  'production.paused': 'text-amber-200',
  'production.resumed': 'text-cyan',
  'improvement.proposed': 'text-violet-200',
  'improvement.approved': 'text-emerald-300',
  'improvement.rejected': 'text-rose-300',
  'improvement.rolled_back': 'text-amber-200',
  'agent.created': 'text-cyan',
  'memory.added': 'text-violet-200',
}

type Tab = 'board' | 'agents' | 'improvements'

function scorePct(value: number | null | undefined) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—'
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.max(0, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false })
}

function CheckList({ checks }: { checks: QualityCheck[] }) {
  if (!checks.length) return <p className="text-[11px] text-txt-faint">No checks recorded.</p>
  return (
    <ul className="space-y-1">
      {checks.map((check) => (
        <li key={`${check.id}-${check.label}`} className="flex items-start gap-2 text-[11.5px] leading-relaxed">
          <span
            className={
              check.status === 'pass'
                ? 'mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400'
                : check.status === 'warn'
                  ? 'mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400'
                  : 'mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400'
            }
          />
          <span className="min-w-0">
            <span className="text-txt">{check.label}</span>
            <span className="text-txt-faint"> — {check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function EngineNote({ status }: { status: WorkforceStatus | null }) {
  if (!status) return null
  const llm = status.engine.llm
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge mono tone={llm.configured ? 'success' : 'warn'}>
        {llm.configured ? `model · ${llm.provider}/${llm.model}` : 'local directive engine · no model key'}
      </Badge>
      <Badge mono tone="cyan">
        video · browser canvas + server signature check
      </Badge>
      <Badge mono tone={status.engine.video.configured ? 'success' : 'default'}>
        external video provider {status.engine.video.configured ? 'configured' : 'not configured'}
      </Badge>
    </div>
  )
}

export default function WorkforcePage() {
  const { pushToast } = useDemo()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('board')
  const [status, setStatus] = useState<WorkforceStatus | null>(null)
  const [agents, setAgents] = useState<WorkerAgent[]>([])
  const [productions, setProductions] = useState<WorkforceProductionSummary[]>([])
  const [improvements, setImprovements] = useState<WorkforceImprovement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('p'))
  const [production, setProduction] = useState<WorkforceProduction | null>(null)
  const [events, setEvents] = useState<WorkforceEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [agentDetail, setAgentDetail] = useState<WorkerAgentDetail | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentTest, setAgentTest] = useState<{ score: number; checks: QualityCheck[]; note: string } | null>(null)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memoryKind, setMemoryKind] = useState<WorkerMemoryEntry['kind']>('feedback')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newAgent, setNewAgent] = useState({ name: '', role: '', capability: 'content-strategy', instructions: '', tools: '' })
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackNote, setFeedbackNote] = useState('')
  const seqRef = useRef(0)
  const refreshing = useRef(false)

  const loadAll = useCallback(async () => {
    const [nextStatus, agentData, productionData, improvementData] = await Promise.all([
      fetchWorkforceStatus(),
      fetchWorkforceAgents(),
      fetchWorkforceProductions(60),
      fetchWorkforceImprovements(),
    ])
    setStatus(nextStatus)
    setAgents(agentData.agents)
    setProductions(productionData.productions)
    setImprovements(improvementData.improvements)
    setError(null)
    return productionData.productions
  }, [])

  useEffect(() => {
    let cancelled = false
    loadAll()
      .then((rows) => {
        if (cancelled) return
        setSelectedId((current) => current ?? rows[0]?.id ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(workforceErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [loadAll])

  const loadProduction = useCallback(async (productionId: string, resetSeq = false) => {
    if (resetSeq) {
      seqRef.current = 0
      setEvents([])
    }
    const [detail, eventData] = await Promise.all([
      fetchWorkforceProduction(productionId),
      fetchWorkforceEvents(seqRef.current, productionId, 200),
    ])
    setProduction(detail.production)
    if (eventData.events.length) {
      seqRef.current = Math.max(seqRef.current, eventData.seq)
      setEvents((prev) => [...prev, ...eventData.events].slice(-400))
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setProduction(null)
      setEvents([])
      return
    }
    let cancelled = false
    loadProduction(selectedId, true)
      .then(() => setError(null))
      .catch((err) => {
        if (!cancelled) setError(workforceErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, loadProduction])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (refreshing.current) return
      refreshing.current = true
      try {
        const rows = await loadAll()
        if (selectedId) {
          const stillThere = rows.some((row) => row.id === selectedId)
          if (stillThere) await loadProduction(selectedId)
          else setSelectedId(rows[0]?.id ?? null)
        }
      } catch (err) {
        setError(workforceErrorMessage(err))
      } finally {
        refreshing.current = false
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [loadAll, loadProduction, selectedId])

  const selectProduction = (productionId: string) => {
    setSelectedId(productionId)
    setSearchParams({ p: productionId })
    setTab('board')
  }

  const refreshAfter = async (productionId: string, message: string) => {
    await loadAll()
    await loadProduction(productionId)
    pushToast({ tone: 'success', title: message, description: 'State reloaded from the persisted workforce store.' })
  }

  const runControl = async (action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (!production) return
    setBusy(action)
    try {
      await controlWorkforceProduction(production.id, action)
      await refreshAfter(production.id, `Production ${action}d`)
    } catch (err) {
      pushToast({ tone: 'error', title: `Could not ${action} production`, description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const runApprove = async (approved: boolean) => {
    if (!production) return
    setBusy(approved ? 'approve' : 'unapprove')
    try {
      await approveWorkforceProduction(production.id, approved)
      await refreshAfter(production.id, approved ? 'Production approved' : 'Approval withdrawn')
    } catch (err) {
      pushToast({ tone: 'error', title: 'Approval failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const runImprove = async () => {
    if (!production) return
    setBusy('improve')
    try {
      const result = await improveWorkforceProduction(production.id)
      await refreshAfter(production.id, 'Improvement analysis complete')
      if (!result.improvements.length) {
        pushToast({ tone: 'info', title: 'No weakness found', description: 'Every measured check already passes; no improvement was proposed.' })
      }
    } catch (err) {
      pushToast({ tone: 'error', title: 'Improvement failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const runFeedback = async () => {
    if (!production) return
    setBusy('feedback')
    try {
      await feedbackWorkforceProduction(production.id, feedbackRating, feedbackNote)
      setFeedbackNote('')
      await refreshAfter(production.id, 'Feedback recorded')
    } catch (err) {
      pushToast({ tone: 'error', title: 'Feedback failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const decide = async (improvement: WorkforceImprovement, action: 'approve' | 'reject' | 'rollback') => {
    setBusy(`${action}-${improvement.id}`)
    try {
      await decideWorkforceImprovement(improvement.id, action, {
        approver: 'operator',
        reason: action === 'reject' ? 'Rejected from the workforce dashboard.' : undefined,
      })
      await loadAll()
      if (production) await loadProduction(production.id)
      if (agentDetail && agentDetail.id === improvement.agentId) {
        const refreshed = await fetchWorkforceAgent(agentDetail.id)
        setAgentDetail(refreshed.agent)
      }
      pushToast({ tone: 'success', title: `Improvement ${action}d`, description: `${improvement.agentName} · v${improvement.fromVersion} → v${improvement.toVersion}` })
    } catch (err) {
      pushToast({ tone: 'error', title: `Could not ${action}`, description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const openAgent = async (agentId: string) => {
    setAgentError(null)
    setAgentTest(null)
    setAgentDetail(null)
    try {
      const result = await fetchWorkforceAgent(agentId)
      setAgentDetail(result.agent)
      setInstructionsDraft(result.agent.instructions)
    } catch (err) {
      setAgentError(workforceErrorMessage(err))
    }
  }

  const runAgentTest = async () => {
    if (!agentDetail) return
    setBusy('agent-test')
    try {
      const result = await testWorkforceAgent(agentDetail.id, `Sandbox brief for ${agentDetail.capability}`)
      setAgentTest(result.test)
      pushToast({ tone: 'success', title: 'Sandbox test complete', description: `${agentDetail.name} scored ${Math.round(result.test.score * 100)}% (local engine).` })
    } catch (err) {
      pushToast({ tone: 'error', title: 'Agent test failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const saveInstructions = async () => {
    if (!agentDetail) return
    setBusy('agent-save')
    try {
      const result = await updateWorkforceAgent(agentDetail.id, { instructions: instructionsDraft })
      setAgentDetail(result.agent)
      await loadAll()
      pushToast({ tone: 'success', title: 'Instructions updated', description: `New version v${result.agent.version} is active.` })
    } catch (err) {
      pushToast({ tone: 'error', title: 'Update failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const addMemory = async () => {
    if (!agentDetail || memoryDraft.trim().length < 3) return
    setBusy('agent-memory')
    try {
      await addWorkforceMemory(agentDetail.id, memoryKind, memoryDraft.trim(), production?.id ?? null)
      setMemoryDraft('')
      const refreshed = await fetchWorkforceAgent(agentDetail.id)
      setAgentDetail(refreshed.agent)
      await loadAll()
      pushToast({ tone: 'success', title: 'Memory stored', description: 'This lesson is now part of the agent’s persistent memory.' })
    } catch (err) {
      pushToast({ tone: 'error', title: 'Memory failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const retire = async () => {
    if (!agentDetail) return
    setBusy('agent-retire')
    try {
      const result = await retireWorkforceAgent(agentDetail.id)
      setAgentDetail(result.agent)
      await loadAll()
      pushToast({ tone: 'info', title: 'Agent retired', description: `${agentDetail.name} will not be assigned new tasks.` })
    } catch (err) {
      pushToast({ tone: 'error', title: 'Retire failed', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const createAgent = async () => {
    setBusy('agent-create')
    try {
      const tools = newAgent.tools.split(',').map((tool) => tool.trim()).filter(Boolean)
      await createWorkforceAgent({
        name: newAgent.name,
        role: newAgent.role,
        capability: newAgent.capability,
        instructions: newAgent.instructions,
        tools,
        permissions: { canCallModel: false, canWriteFiles: false, canPublish: false },
      })
      setCreateOpen(false)
      setNewAgent({ name: '', role: '', capability: 'content-strategy', instructions: '', tools: '' })
      await loadAll()
      pushToast({ tone: 'success', title: 'Specialist registered', description: 'The Agent Factory stored the new agent in the persistent registry.' })
    } catch (err) {
      pushToast({ tone: 'error', title: 'Could not register agent', description: workforceErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const running = production && ['running', 'planning'].includes(production.status)

  return (
    <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Live workforce"
        title="Agent Workforce"
        description="A self-managing production company. The manager plans specialists, the factory creates missing roles, tasks run in parallel with retries, and every output is persisted before it appears here."
        actions={
          <>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => loadAll().catch((err) => setError(workforceErrorMessage(err)))}>
              Refresh
            </Button>
            <Button size="sm" variant="primary" icon={Bot} onClick={() => setCreateOpen(true)}>
              Register specialist
            </Button>
          </>
        }
      />

      <div className="mt-3">
        <EngineNote status={status} />
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-3 text-[12.5px] text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Live backend unavailable</p>
            <p className="mt-0.5 text-rose-100/80">{error} Nothing on this page is simulated; start the backend with "npm run server" to see real state.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active specialists" value={status?.counts.agents.active ?? '—'} hint={status ? `${status.counts.agents.total} registered` : 'Loading'} icon={Users} />
        <Stat label="Tasks running" value={status?.counts.tasks.running ?? '—'} hint={status ? `${status.workers.active}/${status.workers.concurrency} workers busy` : 'Loading'} icon={Activity} tone="violet" />
        <Stat label="Awaiting review" value={status?.counts.productions.completed ?? '—'} hint={status ? `${status.counts.productions.failed} failed` : 'Loading'} icon={ShieldCheck} tone="emerald" />
        <Stat label="Memory entries" value={status?.counts.memory ?? '—'} hint="Lessons persisted across runs" icon={Brain} tone="violet" />
        <Stat label="Improvements" value={status?.counts.improvements.pending ?? '—'} hint="Proposals awaiting approval" icon={Wand2} tone="amber" />
        <Stat label="Queue" value={status ? `${status.counts.tasks.pending}` : '—'} hint="Tasks waiting on dependencies" icon={Clock3} tone="cyan" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
        {(
          [
            { id: 'board', label: 'Live board', icon: Activity, count: productions.length },
            { id: 'agents', label: 'Specialists', icon: Users, count: agents.length },
            { id: 'improvements', label: 'Improvements', icon: Wand2, count: improvements.filter((row) => row.status === 'proposed').length },
          ] as Array<{ id: Tab; label: string; icon: typeof Activity; count: number }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? 'inline-flex items-center gap-1.5 rounded-lg bg-cyan/12 px-3 py-1.5 text-[12px] font-medium text-cyan'
                : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-txt-muted hover:bg-white/[0.04] hover:text-txt'
            }
          >
            <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-txt-faint">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            <StartProductionForm
              busy={busy === 'start'}
              onStart={async (input) => {
                setBusy('start')
                try {
                  const result = await createWorkforceProduction(input)
                  await loadAll()
                  selectProduction(result.production.id)
                  pushToast({
                    tone: 'success',
                    title: 'Production queued',
                    description: `${result.production.id} planned by the manager. Specialists are being assigned now.`,
                  })
                } catch (err) {
                  pushToast({ tone: 'error', title: 'Could not start production', description: workforceErrorMessage(err) })
                } finally {
                  setBusy(null)
                }
              }}
            />
            <div className="space-y-2">
              {productions.length ? (
                productions.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectProduction(row.id)}
                    className={
                      selectedId === row.id
                        ? 'panel w-full border-cyan/30 p-3 text-left'
                        : 'panel w-full p-3 text-left transition-colors hover:border-white/15'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-txt">{row.title}</span>
                      <StatusPill status={row.status} className="shrink-0" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-txt-faint">
                      <span className="font-mono">{row.id}</span>
                      <span>·</span>
                      <span>{PLATFORM_LABEL[row.platform] ?? row.platform}</span>
                    </div>
                    <div className="mt-2">
                      <Progress value={row.progress} height={4} label={`${row.title} progress`} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-txt-faint">
                      <span>
                        {row.taskCounts.completed}/{row.taskCounts.total} tasks · {scorePct(row.qualityScore)}
                      </span>
                      <span className={row.render.status === 'uploaded' ? 'text-emerald-300' : ''}>
                        {row.render.status === 'uploaded' ? 'render stored' : 'no render'}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState icon={Sparkles} title="No productions yet" description="Describe a topic above. The manager will decide which specialists are needed and the factory will create any that do not exist." />
              )}
            </div>
          </div>

          <div>
            {production ? (
              <ProductionPanel
                production={production}
                events={events}
                improvements={improvements.filter((row) => row.productionId === production.id)}
                running={Boolean(running)}
                busy={busy}
                onControl={runControl}
                onApprove={runApprove}
                onImprove={runImprove}
                onFeedback={runFeedback}
                feedbackRating={feedbackRating}
                setFeedbackRating={setFeedbackRating}
                feedbackNote={feedbackNote}
                setFeedbackNote={setFeedbackNote}
                onDecide={decide}
                onOpenAgent={(agentId) => {
                  setTab('agents')
                  openAgent(agentId).catch(() => undefined)
                }}
                onRendered={() => loadProduction(production.id)}
                notify={pushToast}
              />
            ) : (
              <EmptyState icon={Activity} title="Select a production" description="Pick a production on the left to watch task assignments, handoffs, quality checks and render output in real time." />
            )}
          </div>
        </div>
      ) : null}

      {tab === 'agents' ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <button key={agent.id} type="button" onClick={() => openAgent(agent.id)} className="panel p-3.5 text-left transition-colors hover:border-cyan/25">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-txt">{agent.name}</span>
                    <Badge mono tone={agent.status === 'active' ? 'success' : 'default'}>{agent.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-txt-muted">{agent.role}</p>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-txt-faint">v{agent.version}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5 text-[10px]">
                <div>
                  <div className="text-txt-faint">Quality</div>
                  <div className="mt-0.5 text-txt">{scorePct(agent.performance.avgQuality)}</div>
                </div>
                <div>
                  <div className="text-txt-faint">Complete</div>
                  <div className="mt-0.5 text-txt">{agent.performance.completionRate == null ? '—' : `${Math.round(agent.performance.completionRate * 100)}%`}</div>
                </div>
                <div>
                  <div className="text-txt-faint">Memory</div>
                  <div className="mt-0.5 text-txt">{agent.memoryCount}</div>
                </div>
              </div>
              {agent.currentTask ? (
                <p className="mt-2.5 flex items-center gap-1.5 truncate text-[10px] text-cyan">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
                  {agent.currentTask.title}
                </p>
              ) : (
                <p className="mt-2.5 text-[10px] text-txt-faint">Idle · capability “{agent.capability}”</p>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'improvements' ? (
        <div className="mt-4 space-y-3">
          {improvements.length ? (
            improvements.map((row) => (
              <ImprovementCard key={row.id} improvement={row} busy={busy} onDecide={decide} />
            ))
          ) : (
            <EmptyState
              icon={Wand2}
              title="No improvement proposals"
              description="After a production finishes, the evaluator names its weakest measured checks and tests a candidate configuration against the current one. Proposals appear here for approval."
            />
          )}
        </div>
      ) : null}

      <Modal
        open={Boolean(agentDetail) || Boolean(agentError)}
        onClose={() => {
          setAgentDetail(null)
          setAgentError(null)
          setAgentTest(null)
        }}
        title={agentDetail?.name ?? 'Specialist'}
        description={agentDetail ? `${agentDetail.role} · capability ${agentDetail.capability} · v${agentDetail.version}` : undefined}
        size="xl"
      >
        {agentError ? <p className="text-[12.5px] text-rose-200">{agentError}</p> : null}
        {agentDetail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge mono tone={agentDetail.status === 'active' ? 'success' : 'default'}>{agentDetail.status}</Badge>
              <Badge mono tone="cyan">created by {agentDetail.createdBy}</Badge>
              <Badge mono tone={agentDetail.permissions.canCallModel ? 'success' : 'warn'}>
                model {agentDetail.permissions.canCallModel ? 'permitted' : 'blocked'}
              </Badge>
              <Badge mono tone={agentDetail.permissions.canPublish ? 'warn' : 'default'}>
                publishing {agentDetail.permissions.canPublish ? 'permitted' : 'manual only'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Avg quality" value={scorePct(agentDetail.performance.avgQuality)} hint={`${agentDetail.performance.completed} completed`} />
              <Stat label="Completion" value={agentDetail.performance.completionRate == null ? '—' : `${Math.round(agentDetail.performance.completionRate * 100)}%`} hint={`${agentDetail.performance.failed} failed`} />
              <Stat label="Retries" value={agentDetail.performance.retries} hint="Across all runs" />
              <Stat label="Satisfaction" value={agentDetail.performance.satisfaction == null ? '—' : `${agentDetail.performance.satisfaction.toFixed(1)}/5`} hint="Operator feedback" />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="label text-[9px]">Instructions</div>
                <Textarea
                  value={instructionsDraft}
                  onChange={(event) => setInstructionsDraft(event.target.value)}
                  rows={6}
                  className="mt-2 text-[11.5px]"
                  aria-label="Agent instructions"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy === 'agent-save'} onClick={saveInstructions}>
                    Save as new version
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div className="label text-[9px]">Memory</div>
                  <span className="text-[10px] text-txt-faint">{agentDetail.memoryCount} entries</span>
                </div>
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {agentDetail.memory.length ? (
                    agentDetail.memory.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-white/[0.05] px-2 py-1.5">
                        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-txt-faint">
                          <Badge mono tone={entry.kind === 'failure' ? 'error' : entry.kind === 'feedback' ? 'warn' : entry.kind === 'success' ? 'success' : 'violet'}>
                            {entry.kind}
                          </Badge>
                          <span>{timeAgo(entry.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-txt-muted">{entry.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-txt-faint">No memory yet. Run a production or add a correction.</p>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Select value={memoryKind} onChange={(event) => setMemoryKind(event.target.value as WorkerMemoryEntry['kind'])} className="h-8 text-[11px]">
                    <option value="feedback">Feedback</option>
                    <option value="correction">Correction</option>
                    <option value="insight">Insight</option>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                  </Select>
                  <Input
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    placeholder="Add a lesson"
                    className="h-8 text-[11.5px]"
                    aria-label="New memory"
                  />
                  <Button size="sm" variant="secondary" icon={Brain} loading={busy === 'agent-memory'} onClick={addMemory} disabled={memoryDraft.trim().length < 3}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div className="label text-[9px]">Sandbox test</div>
                  <Button size="sm" variant="secondary" icon={FlaskConical} loading={busy === 'agent-test'} onClick={runAgentTest}>
                    Run test
                  </Button>
                </div>
                {agentTest ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-[12px] text-txt">
                      <span className="font-display text-[18px] font-semibold">{Math.round(agentTest.score * 100)}%</span>
                      <span className="text-txt-faint">score</span>
                    </div>
                    <CheckList checks={agentTest.checks} />
                    <p className="text-[10px] text-txt-faint">{agentTest.note}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-txt-faint">Runs the local directive engine with this agent’s capability and a sandbox brief. No production record is created.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div className="label text-[9px]">Versions & rollback</div>
                  {agentDetail.status === 'active' ? (
                    <Button size="sm" variant="danger" icon={CircleSlash} loading={busy === 'agent-retire'} onClick={retire}>
                      Retire
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {agentDetail.versions.slice().reverse().map((version) => (
                    <div key={version.version} className="rounded-lg border border-white/[0.05] px-2 py-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-txt">v{version.version} · {version.createdBy}</span>
                        <span className="text-txt-faint">{version.status}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-txt-faint">{version.instructions.slice(-160)}</p>
                      {version.evaluation ? (
                        <p className="mt-0.5 text-[9.5px] text-cyan">test {scorePct(version.evaluation.score)} · {version.evaluation.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="label text-[9px]">Recent evaluations</div>
              {agentDetail.evaluations.length ? (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {agentDetail.evaluations.slice(0, 6).map((evaluation) => (
                    <div key={evaluation.id} className="flex items-center justify-between rounded-lg border border-white/[0.05] px-2 py-1.5 text-[10.5px]">
                      <span className="text-txt-muted">{evaluation.taskId}</span>
                      <span className="flex items-center gap-2 text-txt-faint">
                        <span>{scorePct(evaluation.quality)}</span>
                        <span>{Math.round(evaluation.durationMs)}ms</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] text-txt-faint">No scored tasks yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register a specialist"
        description="The factory validates and stores the agent in the persistent registry. It becomes eligible for assignment immediately."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Bot}
              loading={busy === 'agent-create'}
              onClick={createAgent}
              disabled={newAgent.name.trim().length < 2 || newAgent.role.trim().length < 2 || newAgent.instructions.trim().length < 20}
            >
              Create agent
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="wf-agent-name">
            <Input id="wf-agent-name" value={newAgent.name} onChange={(event) => setNewAgent((prev) => ({ ...prev, name: event.target.value }))} placeholder="Hook Scientist" />
          </Field>
          <Field label="Role" htmlFor="wf-agent-role">
            <Input id="wf-agent-role" value={newAgent.role} onChange={(event) => setNewAgent((prev) => ({ ...prev, role: event.target.value }))} placeholder="Tests hooks against retention data" />
          </Field>
          <Field label="Capability" hint="Known pipeline capability or custom">
            <Select value={newAgent.capability} onChange={(event) => setNewAgent((prev) => ({ ...prev, capability: event.target.value }))}>
              <option value="content-strategy">content-strategy</option>
              <option value="trend-research">trend-research</option>
              <option value="script">script</option>
              <option value="fact-check">fact-check</option>
              <option value="storyboard">storyboard</option>
              <option value="narration">narration</option>
              <option value="visual-design">visual-design</option>
              <option value="video-edit">video-edit</option>
              <option value="captions">captions</option>
              <option value="thumbnail">thumbnail</option>
              <option value="seo-metadata">seo-metadata</option>
              <option value="quality-control">quality-control</option>
              <option value="producer-review">producer-review</option>
              <option value="custom">custom</option>
            </Select>
          </Field>
          <Field label="Tools" hint="Comma separated">
            <Input value={newAgent.tools} onChange={(event) => setNewAgent((prev) => ({ ...prev, tools: event.target.value }))} placeholder="retention-model, copy-variants" />
          </Field>
          <Field label="Instructions" hint="At least 20 characters">
            <Textarea
              value={newAgent.instructions}
              onChange={(event) => setNewAgent((prev) => ({ ...prev, instructions: event.target.value }))}
              rows={4}
              placeholder="Describe exactly how this agent should work and what it must return."
            />
          </Field>
          <p className="text-[10.5px] leading-relaxed text-txt-faint">
            New agents start with model calls, file writes and publishing blocked. Only an operator approval flow can grant sensitive permissions, and external model calls stay disabled until a provider key is configured.
          </p>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------ start form -------------------------------- */

function StartProductionForm({
  busy,
  onStart,
}: {
  busy: boolean
  onStart: (input: { topic: string; platform: 'instagram-reel' | 'youtube-short' | 'youtube-long'; language: WorkforceLanguage }) => Promise<void>
}) {
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState<'instagram-reel' | 'youtube-short' | 'youtube-long'>('instagram-reel')
  const [language, setLanguage] = useState<WorkforceLanguage>('en')

  return (
    <div className="panel p-3.5">
      <div className="flex items-center justify-between">
        <div className="label text-[9px]">New production</div>
        <Badge mono tone="cyan">manager decides the team</Badge>
      </div>
      <Textarea
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        rows={3}
        placeholder="Describe the topic. Example: Why small AI agent teams are replacing solo creator workflows."
        className="mt-2 text-[12px]"
        aria-label="Production topic"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)} aria-label="Platform">
          <option value="instagram-reel">Instagram Reel · 30s</option>
          <option value="youtube-short">YouTube Short · 45s</option>
          <option value="youtube-long">YouTube long · 8m</option>
        </Select>
        <Select value={language} onChange={(event) => setLanguage(event.target.value as WorkforceLanguage)} aria-label="Language">
          {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        block
        variant="primary"
        icon={Send}
        className="mt-2"
        loading={busy}
        disabled={topic.trim().length < 3}
        onClick={() => {
          void onStart({ topic: topic.trim(), platform, language })
          setTopic('')
        }}
      >
        Start workforce production
      </Button>
      <p className="mt-2 text-[10px] leading-relaxed text-txt-faint">
        Live feeds are read for research. Scripting, checks, captions and metadata run on the local directive engine; narration audio and external video models stay clearly blocked until providers are configured.
      </p>
    </div>
  )
}

/* --------------------------- production panel ----------------------------- */

function ProductionPanel({
  production,
  events,
  improvements,
  running,
  busy,
  onControl,
  onApprove,
  onImprove,
  onFeedback,
  feedbackRating,
  setFeedbackRating,
  feedbackNote,
  setFeedbackNote,
  onDecide,
  onOpenAgent,
  onRendered,
  notify,
}: {
  production: WorkforceProduction
  events: WorkforceEvent[]
  improvements: WorkforceImprovement[]
  running: boolean
  busy: string | null
  onControl: (action: 'pause' | 'resume' | 'cancel' | 'retry') => Promise<void>
  onApprove: (approved: boolean) => Promise<void>
  onImprove: () => Promise<void>
  onFeedback: () => Promise<void>
  feedbackRating: number
  setFeedbackRating: (value: number) => void
  feedbackNote: string
  setFeedbackNote: (value: string) => void
  onDecide: (improvement: WorkforceImprovement, action: 'approve' | 'reject' | 'rollback') => Promise<void>
  onOpenAgent: (agentId: string) => void
  onRendered: () => Promise<void>
  notify: (toast: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void
}) {
  const [renderState, setRenderState] = useState<{ phase: 'idle' | 'rendering' | 'uploading' | 'done'; progress: number; mime: string; error: string | null }>({
    phase: 'idle',
    progress: 0,
    mime: '',
    error: null,
  })
  const artifacts = production.artifacts ?? {}
  const qcChecks: QualityCheck[] = Array.isArray(artifacts.qc) ? (artifacts.qc as QualityCheck[]) : []
  const blocked: string[] = Array.isArray(production.artifacts?.blocked)
    ? (production.artifacts?.blocked as string[])
    : Array.isArray((production.evaluation as unknown as { blocked?: string[] })?.blocked)
      ? ((production.evaluation as unknown as { blocked?: string[] }).blocked as string[])
      : []

  const canRender = Boolean(artifacts.scenes && (artifacts.scenes as unknown[]).length) && supportsVideoRender()
  const renderUrl = production.render.status === 'uploaded' ? workforceRenderUrl(production.id) : null

  const runRender = async () => {
    if (!production.artifacts) return
    const scenes = (production.artifacts.scenes ?? []) as Artifacts['scenes']
    if (!scenes.length) {
      notify({ tone: 'error', title: 'Nothing to render', description: 'The script scenes are missing from persisted artifacts.' })
      return
    }
    setRenderState({ phase: 'rendering', progress: 0, mime: '', error: null })
    try {
      const renderArtifacts = {
        title: String(production.artifacts.title ?? production.title),
        titleOptions: [],
        hook: String(production.artifacts.hook ?? ''),
        scenes,
        description: '',
        youtubeTitle: '',
        youtubeTags: [],
        instagramCaption: '',
        hashtags: [],
        research: [],
        qc: [],
        srt: String(production.artifacts.srt ?? ''),
        wordCount: Number(production.artifacts.wordCount ?? 0),
        durationSec: production.durationSec,
        theme: (production.artifacts.theme as Artifacts['theme']) ?? { from: '#0B1E3A', to: '#08213B', accent: '#00D4FF' },
        language: production.language as Artifacts['language'],
        languageLabel: String(production.artifacts.languageLabel ?? LANGUAGE_LABEL[production.language] ?? 'English'),
        demoCopy: false,
      } as Artifacts
      const result = await renderDemoVideo(renderArtifacts, production.platform as Platform, (progress) => {
        setRenderState((prev) => ({ ...prev, progress }))
      }, production.durationSec)
      setRenderState({ phase: 'uploading', progress: 1, mime: result.mime, error: null })
      await uploadWorkforceRender(production.id, result.blob, result.mime, result.durationSec)
      setRenderState({ phase: 'done', progress: 1, mime: result.mime, error: null })
      await onRendered()
      notify({
        tone: 'success',
        title: 'Render stored and verified',
        description: `${result.mime} · ${formatBytes(result.size)} · server checked the container signature.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render failed.'
      setRenderState({ phase: 'idle', progress: 0, mime: '', error: message })
      notify({ tone: 'error', title: 'Render failed', description: message })
    }
  }

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[18px] font-semibold leading-tight text-txt">{production.title}</h2>
              <StatusPill status={production.status} />
              {production.approved ? <Badge mono tone="success">approved</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-txt-faint">
              <span className="font-mono">{production.id}</span>
              <span>·</span>
              <span>{PLATFORM_LABEL[production.platform] ?? production.platform}</span>
              <span>·</span>
              <span>{production.durationSec}s</span>
              <span>·</span>
              <span>{LANGUAGE_LABEL[production.language] ?? production.language}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="label text-[9px]">Quality</div>
            <div className="font-display text-[24px] font-semibold leading-none text-txt">{scorePct(production.qualityScore)}</div>
            <div className="mt-1 text-[10px] text-txt-faint">{production.evaluation ? 'measured by evaluateProduction' : 'pending'}</div>
          </div>
        </div>

        <div className="mt-3">
          <Progress value={production.progress} tone="mixed" label="Production progress" />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {running ? (
            <Button size="sm" variant="secondary" icon={Pause} loading={busy === 'pause'} onClick={() => onControl('pause')}>
              Pause
            </Button>
          ) : null}
          {production.status === 'paused' ? (
            <Button size="sm" variant="secondary" icon={Play} loading={busy === 'resume'} onClick={() => onControl('resume')}>
              Resume
            </Button>
          ) : null}
          {production.status === 'failed' ? (
            <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === 'retry'} onClick={() => onControl('retry')}>
              Retry failed tasks
            </Button>
          ) : null}
          {['running', 'paused', 'planning', 'queued'].includes(production.status) ? (
            <Button size="sm" variant="danger" icon={Square} loading={busy === 'cancel'} onClick={() => onControl('cancel')}>
              Cancel
            </Button>
          ) : null}
          {['awaiting_approval', 'approved'].includes(production.status) && !production.approved ? (
            <Button size="sm" variant="primary" icon={ThumbsUp} loading={busy === 'approve'} onClick={() => onApprove(true)}>
              Approve delivery
            </Button>
          ) : null}
          {production.approved ? (
            <Button size="sm" variant="secondary" icon={X} loading={busy === 'unapprove'} onClick={() => onApprove(false)}>
              Withdraw approval
            </Button>
          ) : null}
          <Button size="sm" variant="outline" icon={Wand2} loading={busy === 'improve'} onClick={onImprove}>
            Run improvement cycle
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {production.engineNotes.map((note, index) => (
            <Badge key={`${note}-${index}`} mono tone="default">
              {note}
            </Badge>
          ))}
          <Badge mono tone="cyan">{production.engines.llm}</Badge>
          <Badge mono tone="default">video · {production.engines.video}</Badge>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="label text-[9px]">Task board</div>
            <span className="text-[10px] text-txt-faint">
              {production.taskCounts.completed}/{production.taskCounts.total} complete · {production.taskCounts.running} running · {production.taskCounts.failed} failed
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {production.tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-white/[0.06] px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-medium text-txt">{task.title}</span>
                      <Badge mono tone="default">{task.capability}</Badge>
                      {task.attempts > 1 ? <Badge mono tone="warn">attempt {task.attempts}/{task.maxAttempts}</Badge> : null}
                    </div>
                    <button type="button" onClick={() => onOpenAgent(task.agentId)} className="mt-1 inline-flex items-center gap-1 text-[10px] text-cyan hover:underline">
                      {task.agentName}
                      <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                    {task.summary ? <p className="mt-1 text-[10.5px] leading-relaxed text-txt-muted">{task.summary}</p> : null}
                    {task.error ? <p className="mt-1 text-[10.5px] text-rose-300">{task.error}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusPill status={task.status} />
                    <div className="mt-1 text-[9.5px] text-txt-faint">
                      {task.quality ? `${scorePct(task.quality.score)} · ` : ''}
                      {task.durationMs != null ? `${(task.durationMs / 1000).toFixed(1)}s` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="panel p-3.5">
            <div className="flex items-center justify-between">
              <div className="label text-[9px]">Render & download</div>
              {production.render.status === 'uploaded' ? <Badge mono tone="success">verified</Badge> : <Badge mono tone="warn">not rendered</Badge>}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-txt-muted">
              {production.render.status === 'uploaded'
                ? `Stored ${production.render.mime} · ${formatBytes(production.render.size)}${production.render.durationSec ? ` · ${production.render.durationSec}s` : ''} · ${timeAgo(production.render.renderedAt)}. The server verified the file header before accepting it.`
                : production.render.note}
            </p>
            {renderState.error ? <p className="mt-1.5 text-[10.5px] text-rose-300">{renderState.error}</p> : null}
            {renderState.phase !== 'idle' ? (
              <div className="mt-2">
                <Progress value={renderState.progress} height={4} label="Render progress" />
                <p className="mt-1 text-[10px] text-txt-faint">
                  {renderState.phase === 'rendering'
                    ? `Rendering ${Math.round(renderState.progress * 100)}% — keep this tab visible; MediaRecorder pauses when hidden.`
                    : renderState.phase === 'uploading'
                      ? 'Uploading bytes to the backend for signature verification…'
                      : 'Stored. The download below serves the uploaded file.'}
                </p>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="primary"
                icon={Video}
                loading={renderState.phase === 'rendering' || renderState.phase === 'uploading'}
                disabled={!canRender}
                onClick={runRender}
              >
                {production.render.status === 'uploaded' ? 'Re-render & upload' : `Render ${production.durationSec}s video`}
              </Button>
              {renderUrl ? (
                <a
                  href={renderUrl}
                  download
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-[12.5px] font-medium text-txt hover:border-white/20"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download {production.render.mime?.includes('mp4') ? 'MP4' : 'video'}
                </a>
              ) : null}
            </div>
            {renderUrl ? (
              <video key={renderUrl} src={renderUrl} controls className="mt-2 max-h-72 w-full rounded-lg border border-white/10 bg-black" />
            ) : null}
            {!supportsVideoRender() ? (
              <p className="mt-1.5 text-[10px] text-amber-200">This browser does not expose canvas capture or MediaRecorder, so video bytes cannot be produced here.</p>
            ) : null}
            <p className="mt-2 text-[9.5px] leading-relaxed text-txt-faint">
              Format is whatever this browser’s MediaRecorder can encode. Chrome often exposes MP4 (H.264); other browsers fall back to WebM. The UI reports the actual stored MIME type — no format is claimed that was not produced.
            </p>
          </div>

          <div className="panel p-3.5">
            <div className="label text-[9px]">Deliverable files</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(
                [
                  ['script.txt', 'Script'],
                  ['narration.txt', 'Narration'],
                  ['captions.srt', 'Captions'],
                  ['metadata.json', 'Metadata'],
                  ['thumbnail.svg', 'Thumbnail'],
                  ['cover.svg', 'Cover'],
                ] as const
              ).map(([file, label]) => (
                <a
                  key={file}
                  href={workforceArtifactUrl(production.id, file)}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[10.5px] text-txt-muted hover:border-cyan/30 hover:text-txt"
                >
                  <ArrowDownToLine className="h-3 w-3 shrink-0 text-cyan/80" aria-hidden="true" />
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-2">
              <Link to={`/productions/${production.id}`} className="text-[10px] text-txt-faint hover:text-cyan">
                Production ids differ from studio previews · open studio view
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-3.5">
          <div className="label text-[9px]">Quality gate</div>
          <div className="mt-2">
            {qcChecks.length ? <CheckList checks={qcChecks} /> : <p className="text-[11px] text-txt-faint">QC has not produced a report yet.</p>}
          </div>
          {blocked.length ? (
            <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1.5">
              <div className="text-[10px] font-medium text-amber-200">Blocked and disclosed</div>
              <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-100/80">
                {blocked.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {production.evaluation ? (
            <div className="mt-3 border-t border-white/[0.06] pt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-txt-muted">Production evaluation</span>
                <span className="font-medium text-txt">{scorePct(production.evaluation.score)}</span>
              </div>
              <div className="mt-1.5">
                <CheckList checks={production.evaluation.checks} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="label text-[9px]">Live event log</div>
            <span className="flex items-center gap-1 text-[10px] text-txt-faint">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
              {events.length} events · 3s polling
            </span>
          </div>
          <div className="mt-2 max-h-[340px] space-y-1 overflow-y-auto pr-1">
            {events.length ? (
              events
                .slice()
                .reverse()
                .map((event) => (
                  <div key={event.seq} className="flex gap-2 rounded-md px-1 py-1 hover:bg-white/[0.03]">
                    <span className="w-9 shrink-0 pt-0.5 font-mono text-[9px] text-txt-faint">{clock(event.at)}</span>
                    <div className="min-w-0">
                      <span className={`font-mono text-[9px] uppercase tracking-wide ${EVENT_TONE[event.type] ?? 'text-cyan/80'}`}>{event.type}</span>
                      <p className="text-[10.5px] leading-relaxed text-txt-muted">{event.message}</p>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-[11px] text-txt-faint">No events yet for this production.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="label text-[9px]">Improvement proposals</div>
            <Badge mono tone="violet">{improvements.length} for this run</Badge>
          </div>
          <div className="mt-2 space-y-2">
            {improvements.length ? (
              improvements.map((row) => <ImprovementCard key={row.id} improvement={row} busy={busy} onDecide={onDecide} compact />)
            ) : (
              <p className="text-[11px] leading-relaxed text-txt-faint">
                No proposal for this production yet. Finish all tasks, then use “Run improvement cycle”. Proposals require a passing before/after test and an operator decision.
              </p>
            )}
          </div>
        </div>

        <div className="panel p-3.5">
          <div className="label text-[9px]">Operator feedback</div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-txt-muted">
            Feedback is stored against the production and pushed into every participating agent’s persistent memory and satisfaction score.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Select value={String(feedbackRating)} onChange={(event) => setFeedbackRating(Number(event.target.value))} className="h-9 w-28 text-[12px]" aria-label="Rating">
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} / 5
                </option>
              ))}
            </Select>
            <Input value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="What should improve next time?" className="h-9 text-[12px]" aria-label="Feedback note" />
            <Button size="sm" variant="secondary" icon={Gauge} loading={busy === 'feedback'} onClick={onFeedback}>
              Submit
            </Button>
          </div>
          {production.feedback.length ? (
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[10.5px]">
              {production.feedback.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="flex items-start gap-2 rounded-md border border-white/[0.05] px-2 py-1.5">
                  <Badge mono tone={entry.rating >= 4 ? 'success' : entry.rating >= 3 ? 'warn' : 'error'}>{entry.rating}/5</Badge>
                  <div className="min-w-0">
                    <p className="text-txt-muted">{entry.note || 'No note'}</p>
                    <p className="text-[9px] text-txt-faint">{timeAgo(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel p-3.5">
        <div className="label text-[9px]">Manager plan</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-txt-muted">{production.plan.notes}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(production.plan.capabilities ?? production.tasks.map((task) => task.capability)).map((capability) => (
            <span key={capability} className="rounded-md border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-txt-faint">
              {capability}
            </span>
          ))}
        </div>
        {production.researchSignals.length ? (
          <div className="mt-3 border-t border-white/[0.06] pt-2">
            <div className="label text-[9px]">Live signals used</div>
            <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
              {production.researchSignals.slice(0, 6).map((signal) => (
                <a key={signal.url} href={signal.url} target="_blank" rel="noreferrer" className="truncate rounded-md px-1 text-[10px] text-txt-muted hover:text-cyan">
                  {signal.title} · {signal.source}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------- improvement ------------------------------ */

function ImprovementCard({
  improvement,
  busy,
  onDecide,
  compact,
}: {
  improvement: WorkforceImprovement
  busy: string | null
  onDecide: (improvement: WorkforceImprovement, action: 'approve' | 'reject' | 'rollback') => Promise<void>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const test = improvement.test
  const statusTone = improvement.status === 'approved' ? 'success' : improvement.status === 'rejected' ? 'error' : improvement.status === 'rolled_back' ? 'warn' : 'violet'
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-medium text-txt">{improvement.agentName}</span>
            <Badge mono tone={statusTone}>{improvement.status}</Badge>
            <Badge mono tone="default">
              v{improvement.fromVersion} → v{improvement.toVersion}
            </Badge>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-txt-muted">{improvement.weakness}</p>
        </div>
        {test ? (
          <div className="text-right text-[10px] text-txt-faint">
            <div>
              test {scorePct(test.baselineScore)} → <span className={test.passed ? 'text-emerald-300' : 'text-rose-300'}>{scorePct(test.candidateScore)}</span>
            </div>
            <div className={test.passed ? 'text-emerald-300' : 'text-rose-300'}>{test.passed ? 'test passed' : 'test not improved'}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {improvement.status === 'proposed' ? (
          <>
            <Button size="sm" variant="primary" icon={CheckCircle2} loading={busy === `approve-${improvement.id}`} disabled={!test?.passed} onClick={() => onDecide(improvement, 'approve')}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" icon={X} loading={busy === `reject-${improvement.id}`} onClick={() => onDecide(improvement, 'reject')}>
              Reject
            </Button>
          </>
        ) : null}
        {improvement.status === 'approved' ? (
          <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === `rollback-${improvement.id}`} onClick={() => onDecide(improvement, 'rollback')}>
            Roll back
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide change' : 'View change'}
        </Button>
      </div>

      {open ? (
        <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2">
          {improvement.change.lessons?.length ? (
            <div>
              <div className="text-[10px] font-medium text-txt-muted">Learned directives</div>
              <ul className="mt-1 space-y-0.5 text-[10px] text-txt-faint">
                {improvement.change.lessons.map((lesson) => (
                  <li key={lesson}>· {lesson}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!compact && test ? <p className="text-[10px] leading-relaxed text-txt-faint">Test harness: {test.note}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-medium text-txt-muted">Instructions before</div>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-[9.5px] leading-relaxed text-txt-faint">{improvement.change.instructionsBefore}</p>
            </div>
            <div>
              <div className="text-[10px] font-medium text-txt-muted">Instructions after</div>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-[9.5px] leading-relaxed text-cyan/80">{improvement.change.instructionsAfter}</p>
            </div>
          </div>
        </div>
      ) : null}
      {improvement.decidedAt ? (
        <p className="mt-1.5 text-[9px] text-txt-faint">
          {improvement.status} by {improvement.decidedBy ?? 'operator'} · {timeAgo(improvement.decidedAt)}
        </p>
      ) : null}
    </div>
  )
}
