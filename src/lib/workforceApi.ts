// Client for the live AI workforce backend (/api/workforce/*). Every call hits
// the real server: agents, productions, events, improvements and render uploads.
// Nothing here fabricates state; when the backend is unreachable the caller gets
// a WorkforceApiError and the UI must say so.

export type WorkforcePlatform = 'instagram-reel' | 'youtube-short' | 'youtube-long'
export type WorkforceLanguage = 'en' | 'te' | 'hi' | 'ta' | 'kn'

export interface WorkforceEngineInfo {
  llm: { configured: boolean; provider: string | null; model: string | null; detail: string }
  video: { configured: boolean; provider: string | null; detail: string }
}

export interface WorkforceStatus {
  ok: boolean
  name: string
  version: string
  time: string
  engine: WorkforceEngineInfo
  counts: {
    agents: { total: number; active: number; retired: number }
    productions: { total: number; running: number; completed: number; failed: number }
    tasks: { pending: number; running: number; completed: number; failed: number }
    memory: number
    improvements: { pending: number }
  }
  workers: { concurrency: number; active: number }
  persistence: { path: string; savedAt: string | null }
}

export interface WorkerPerformance {
  tasks: number
  completed: number
  failed: number
  retries: number
  avgQuality: number | null
  completionRate: number | null
  avgDurationMs: number | null
  satisfaction: number | null
  lastRunAt: string | null
}

export interface WorkerPermissions {
  canCallModel: boolean
  canWriteFiles: boolean
  canPublish: boolean
}

export interface WorkerAgent {
  id: string
  slug: string
  name: string
  role: string
  capability: string
  icon: string
  hue: string
  status: 'active' | 'retired'
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
  tools: string[]
  permissions: WorkerPermissions
  memoryCount: number
  performance: WorkerPerformance
  currentTask: { id: string; title: string; productionId: string; status: string } | null
}

export interface WorkerMemoryEntry {
  id: string
  agentId: string
  kind: 'success' | 'failure' | 'correction' | 'feedback' | 'insight'
  content: string
  weight: number
  taskId?: string | null
  productionId?: string | null
  createdAt: string
}

export interface WorkerVersion {
  version: number
  status: string
  instructions: string
  createdAt: string
  createdBy: string
  evaluation: { score: number | null; note: string } | null
}

export interface WorkerEvaluation {
  id: string
  taskId: string
  productionId: string
  quality: number
  checks: QualityCheck[]
  durationMs: number
  createdAt: string
}

export interface WorkerAgentDetail extends WorkerAgent {
  instructions: string
  directives: Record<string, number | boolean>
  versions: WorkerVersion[]
  memory: WorkerMemoryEntry[]
  evaluations: WorkerEvaluation[]
  recentTasks: Array<WorkforceTask & { productionTitle: string }>
  improvements: WorkforceImprovement[]
}

export interface QualityCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface WorkforceTask {
  id: string
  productionId: string
  title: string
  capability: string
  agentId: string
  agentName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  dependsOn: string[]
  attempts: number
  maxAttempts: number
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  summary: string
  error: string | null
  quality: { score: number; checks: QualityCheck[] } | null
  engine: string
  qualityChecks: QualityCheck[]
}

export interface WorkforceRender {
  status: string
  mime: string | null
  size: number | null
  renderedAt: string | null
  durationSec?: number | null
  note: string
  url: string | null
}

export interface WorkforceProductionSummary {
  id: string
  topic: string
  title: string
  platform: WorkforcePlatform
  language: WorkforceLanguage
  durationSec: number
  status: string
  approved: boolean
  progress: number
  revision: number
  requireScriptApproval: boolean
  scriptApproved: boolean
  scriptApprovedAt: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  qualityScore: number | null
  engines: { llm: string; video: string }
  render: WorkforceRender
  taskCounts: { total: number; completed: number; running: number; pending: number; failed: number; skipped: number }
  plan: { agentIds: string[]; createdAgents?: string[]; capabilities?: string[]; notes: string }
}

export interface WorkforceProduction extends WorkforceProductionSummary {
  tasks: WorkforceTask[]
  artifacts: Record<string, any> | null
  evaluation: { score: number; checks: QualityCheck[]; summary?: string } | null
  feedback: Array<{ rating: number; note: string; at: string }>
  revisions: Array<{ revision: number; note: string; at: string; requestedBy: string; capabilities: string[] }>
  improvements: WorkforceImprovement[]
  researchSignals: Array<{ title: string; source: string; url: string; score: number; metricLabel?: string }>
  engineNotes: string[]
}

export interface WorkforceImprovement {
  id: string
  agentId: string
  agentName: string
  capability: string
  productionId?: string
  fromVersion: number
  toVersion: number
  status: 'proposed' | 'approved' | 'rejected' | 'rolled_back'
  weakness: string
  change: {
    instructionsBefore: string
    instructionsAfter: string
    directivesBefore: Record<string, number | boolean>
    directivesAfter: Record<string, number | boolean>
    lessons?: string[]
  }
  test: {
    baselineScore: number
    candidateScore: number
    passed: boolean
    cases: number
    engine: string
    note: string
  } | null
  createdAt: string
  decidedAt?: string
  decidedBy?: string
}

export interface WorkforceEvent {
  seq: number
  type: string
  at: string
  productionId?: string | null
  taskId?: string | null
  agentId?: string | null
  agentName?: string | null
  message: string
  data?: Record<string, unknown> | null
}

export type WorkforceRuntimeKind = 'local-runtime' | 'qoder-cloud' | 'qoder-ide'

export interface WorkforceRuntimeRow {
  id: string
  name: string
  kind: WorkforceRuntimeKind
  status: 'connected' | 'not_configured' | 'unauthorized' | 'error' | 'detected_not_callable' | 'not_detected'
  externallyCallable: boolean
  execution: string
  detail: string
  agents: number | null
  activeTasks: number | null
  configured?: boolean
  apiBaseHost?: string
}

export interface WorkforceRuntimeStatus {
  ok: boolean
  generatedAt: string
  runtimes: WorkforceRuntimeRow[]
  qoderCloud: {
    configured: boolean
    status: string
    reachable: boolean | null
    authorized: boolean | null
    latencyMs: number | null
    checkedAt: string
    detail: string
    tokenEnv: string
    apiBaseHost: string
    agentConfigured: boolean
    environmentConfigured: boolean
    agentId: string | null
    environmentId: string | null
  }
  qoderDesktop: { callable: boolean; count: number; detail: string }
  local: {
    activeAgents: number
    totalAgents: number
    tasksRunning: number
    tasksPending: number
    workers: { concurrency: number; active: number }
    persistence: { path: string; savedAt: string | null }
  }
}

export interface WorkforceRuntimeAgent {
  id: string
  name: string
  description: string | null
  role?: string | null
  capability: string | null
  status: string | null
  version: string | number | null
  model: string | null
  runtime: WorkforceRuntimeKind
  runtimeLabel: string
  externallyCallable: boolean
  callable: boolean
  execution: string
  tools?: string[]
  permissions?: WorkerPermissions | null
  performance?: WorkerPerformance | null
  currentTask?: { id: string; title: string; productionId: string; status: string } | null
  permissionMode?: string | null
  source?: string
  reason?: string
}

export interface WorkforceRuntimeAgents {
  ok: boolean
  generatedAt: string
  agents: WorkforceRuntimeAgent[]
  sources: Array<{ id: string; label: string; callable: boolean; count: number; detail: string; error?: string | null }>
}

export interface QoderSession {
  id: string
  remoteId: string
  title: string
  task: string
  agentId: string
  environmentId: string
  status: string
  createdAt: string
  updatedAt: string
  lastError: string | null
  usage: Record<string, unknown> | null
}

export interface QoderDiscovery {
  configured: boolean
  agents: Array<{ id: string; name: string; description?: string | null; version?: string | null; model?: string | null; status?: string | null; createdAt?: string | null }>
  environments: Array<{ id: string; name: string; status: string | null; createdAt: string | null }>
  detail?: string
  tokenEnv?: string
  apiBaseHost?: string
  agentConfigured?: boolean
  environmentConfigured?: boolean
  agentId?: string | null
  environmentId?: string | null
}

export class WorkforceApiError extends Error {
  status: number
  payload?: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'WorkforceApiError'
    this.status = status
    this.payload = payload
  }
}

function timeoutSignal(ms: number) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => window.clearTimeout(timer) }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const timed = timeoutSignal(timeoutMs)
  try {
    const response = await fetch(path, {
      ...init,
      signal: timed.signal,
      headers: {
        ...(init?.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    if (!response.ok || record?.ok === false) {
      const message =
        (typeof record?.error === 'string' && record.error) ||
        `Workforce request failed (${response.status})`
      throw new WorkforceApiError(message, response.status, payload)
    }
    return payload as T
  } catch (error) {
    if (error instanceof WorkforceApiError) throw error
    if ((error as Error)?.name === 'AbortError') {
      throw new WorkforceApiError('The workforce backend did not respond in time.', 0)
    }
    throw new WorkforceApiError('The workforce backend is unreachable. Start it with "npm run server".', 0)
  } finally {
    timed.clear()
  }
}

export function workforceErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unexpected workforce error'
}

/* ------------------------------- endpoints -------------------------------- */

export function fetchWorkforceStatus() {
  return request<WorkforceStatus>('/api/workforce/status', undefined, 6_000)
}

export function fetchWorkforceAgents() {
  return request<{ ok: boolean; agents: WorkerAgent[] }>('/api/workforce/agents')
}

export function fetchWorkforceAgent(agentId: string) {
  return request<{ ok: boolean; agent: WorkerAgentDetail }>(`/api/workforce/agents/${encodeURIComponent(agentId)}`)
}

export interface NewAgentInput {
  name: string
  role: string
  capability: string
  instructions: string
  tools?: string[]
  permissions?: Partial<WorkerPermissions>
}

export function createWorkforceAgent(input: NewAgentInput) {
  return request<{ ok: boolean; agent: WorkerAgentDetail }>('/api/workforce/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateWorkforceAgent(agentId: string, patch: Partial<Pick<NewAgentInput, 'instructions' | 'role' | 'tools' | 'permissions'>>) {
  return request<{ ok: boolean; agent: WorkerAgentDetail }>(`/api/workforce/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function retireWorkforceAgent(agentId: string) {
  return request<{ ok: boolean; agent: WorkerAgentDetail }>(`/api/workforce/agents/${encodeURIComponent(agentId)}/retire`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function addWorkforceMemory(agentId: string, kind: WorkerMemoryEntry['kind'], content: string, productionId?: string | null) {
  return request<{ ok: boolean; memory: WorkerMemoryEntry }>(`/api/workforce/agents/${encodeURIComponent(agentId)}/memory`, {
    method: 'POST',
    body: JSON.stringify({ kind, content, productionId: productionId ?? null }),
  })
}

export function testWorkforceAgent(agentId: string, input?: string) {
  return request<{
    ok: boolean
    test: { score: number; checks: QualityCheck[]; output: { summary: string; engine: string; data: unknown }; engine: string; durationMs: number; note: string }
  }>(`/api/workforce/agents/${encodeURIComponent(agentId)}/test`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  }, 30_000)
}

export function fetchWorkforceProductions(limit = 50) {
  return request<{ ok: boolean; productions: WorkforceProductionSummary[] }>(`/api/workforce/productions?limit=${limit}`)
}

export interface NewProductionInput {
  topic: string
  platform: WorkforcePlatform
  language: WorkforceLanguage
  durationSec?: number
  requireScriptApproval?: boolean
}

export function createWorkforceProduction(input: NewProductionInput) {
  return request<{ ok: boolean; production: WorkforceProductionSummary }>('/api/workforce/productions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchWorkforceProduction(productionId: string) {
  return request<{ ok: boolean; production: WorkforceProduction }>(`/api/workforce/productions/${encodeURIComponent(productionId)}`)
}

export function controlWorkforceProduction(productionId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') {
  return request<{ ok: boolean; production: WorkforceProductionSummary }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function approveWorkforceProduction(productionId: string, approved: boolean) {
  return request<{ ok: boolean; production: WorkforceProductionSummary }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved }),
  })
}

export function approveWorkforceScript(productionId: string, approved = true) {
  return request<{ ok: boolean; production: WorkforceProduction }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/approve-script`, {
    method: 'POST',
    body: JSON.stringify({ approved }),
  })
}

export function requestWorkforceRevision(productionId: string, note: string) {
  return request<{ ok: boolean; production: WorkforceProduction }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/revision`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export function feedbackWorkforceProduction(productionId: string, rating: number, note: string) {
  return request<{ ok: boolean; production: WorkforceProductionSummary }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, note }),
  })
}

export function improveWorkforceProduction(productionId: string) {
  return request<{ ok: boolean; improvements: WorkforceImprovement[] }>(`/api/workforce/productions/${encodeURIComponent(productionId)}/improve`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, 30_000)
}

export function fetchWorkforceImprovements(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<{ ok: boolean; improvements: WorkforceImprovement[] }>(`/api/workforce/improvements${query}`)
}

export function decideWorkforceImprovement(improvementId: string, action: 'approve' | 'reject' | 'rollback', body?: { approver?: string; reason?: string }) {
  return request<{ ok: boolean; improvement: WorkforceImprovement; agent: WorkerAgentDetail }>(
    `/api/workforce/improvements/${encodeURIComponent(improvementId)}/${action}`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  )
}

export function fetchWorkforceEvents(after = 0, productionId?: string | null, limit = 200) {
  const params = new URLSearchParams({ after: String(after), limit: String(limit) })
  if (productionId) params.set('productionId', productionId)
  return request<{ ok: boolean; events: WorkforceEvent[]; seq: number }>(`/api/workforce/events?${params.toString()}`)
}

export interface UploadRenderResult {
  ok: boolean
  render: {
    status: string
    mime: string
    size: number
    renderedAt: string
    note: string
    url: string
  }
  production: WorkforceProductionSummary
}

export async function uploadWorkforceRender(productionId: string, blob: Blob, mime: string, durationSec: number) {
  const response = await fetch(`/api/workforce/productions/${encodeURIComponent(productionId)}/render`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-render-mime': mime,
      'x-render-duration': String(durationSec),
    },
    body: blob,
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  if (!response.ok || record?.ok === false) {
    throw new WorkforceApiError(
      (typeof record?.error === 'string' && record.error) || `Render upload failed (${response.status})`,
      response.status,
      payload,
    )
  }
  return payload as UploadRenderResult
}

export function workforceRenderUrl(productionId: string) {
  return `/api/workforce/productions/${encodeURIComponent(productionId)}/render/file`
}

export function workforceArtifactUrl(productionId: string, name: 'script.txt' | 'narration.txt' | 'captions.srt' | 'metadata.json' | 'thumbnail.svg' | 'cover.svg') {
  return `/api/workforce/productions/${encodeURIComponent(productionId)}/artifacts/${name}`
}

/* -------------------------------- runtime --------------------------------- */

export function fetchWorkforceRuntime(probe = false) {
  return request<WorkforceRuntimeStatus>(`/api/workforce/runtime/status${probe ? '?probe=1' : ''}`, undefined, probe ? 20_000 : 8_000)
}

export function fetchRuntimeAgents() {
  return request<WorkforceRuntimeAgents>('/api/workforce/runtime/agents', undefined, 20_000)
}

export function fetchRuntimeDiscovery() {
  return request<QoderDiscovery>('/api/workforce/runtime/discovery', undefined, 20_000)
}

export function fetchQoderSessions() {
  return request<{ ok: boolean; sessions: QoderSession[] }>('/api/workforce/runtime/sessions')
}

export interface NewQoderSessionInput {
  task: string
  agentId?: string
  environmentId?: string
}

export function createQoderSession(input: NewQoderSessionInput) {
  return request<{ ok: boolean; session: QoderSession }>('/api/workforce/runtime/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  }, 35_000)
}

export function fetchQoderSession(sessionId: string, refresh = false) {
  return request<{ ok: boolean; session: QoderSession }>(
    `/api/workforce/runtime/sessions/${encodeURIComponent(sessionId)}${refresh ? '?refresh=1' : ''}`,
    undefined,
    20_000,
  )
}

export function cancelQoderSession(sessionId: string) {
  return request<{ ok: boolean; session: QoderSession }>(`/api/workforce/runtime/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function fetchQoderSessionEvents(sessionId: string, limit = 100) {
  return request<{ ok: boolean; events: unknown[] }>(
    `/api/workforce/runtime/sessions/${encodeURIComponent(sessionId)}/events?limit=${limit}`,
    undefined,
    20_000,
  )
}

export function qoderSessionStreamUrl(sessionId: string) {
  return `/api/workforce/runtime/sessions/${encodeURIComponent(sessionId)}/stream`
}

export function workforceEventsStreamUrl(productionId?: string | null, after = 0) {
  const params = new URLSearchParams()
  if (productionId) params.set('productionId', productionId)
  if (after > 0) params.set('after', String(after))
  const query = params.toString()
  return `/api/workforce/events/stream${query ? `?${query}` : ''}`
}


export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
