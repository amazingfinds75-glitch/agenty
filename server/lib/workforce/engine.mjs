import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONFIG } from '../env.mjs'
import { markStoreDirty, readStore } from '../store.mjs'
import { getLiveTrends } from '../sources.mjs'
import { truncate } from '../util.mjs'
import {
  CAPABILITY_TEMPLATES,
  DEFAULT_DIRECTIVES,
  LANGUAGES,
  PLATFORMS,
  capabilitiesForProduction,
  dependenciesFor,
} from './capabilities.mjs'
import { localGenerate } from './generators.mjs'
import { callModel, resolveLlm } from './providers.mjs'
import {
  emptyPerformance,
  evaluateProduction,
  performanceView,
  qualityFromChecks,
  recordPerformance,
  recordSatisfaction,
} from './evaluators.mjs'

const STORE = 'workforce.json'
const CONCURRENCY = 2
const MAX_ATTEMPTS = 2
const EVENT_LIMIT = 2000
const MEMORY_LIMIT = 200
const RENDERS_DIR = join(CONFIG.dataDir, 'renders')

const state = {
  version: 2,
  seq: 0,
  agents: [],
  productions: [],
  events: [],
  improvements: [],
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), seeded: false },
}

let initialized = false
let worker = null
const inFlight = new Set()
const failureBreaker = new Map()
const eventListeners = new Set()

/**
 * Subscribe to the live workforce event stream. The listener receives the same
 * persisted entry that is written to the store, so SSE clients cannot observe
 * anything that was not recorded.
 */
export function subscribeEvents(listener) {
  if (typeof listener !== 'function') return () => {}
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

function nowISO() {
  return new Date().toISOString()
}

function id(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

function save() {
  state.meta.updatedAt = nowISO()
  markStoreDirty(STORE)
}

function emit(type, payload = {}) {
  state.seq += 1
  const entry = {
    seq: state.seq,
    id: id('evt'),
    at: nowISO(),
    type,
    productionId: payload.productionId ?? null,
    agentId: payload.agentId ?? null,
    agentName: payload.agentName ?? null,
    taskId: payload.taskId ?? null,
    message: String(payload.message ?? ''),
    data: payload.data ?? null,
  }
  state.events.push(entry)
  if (state.events.length > EVENT_LIMIT) state.events.splice(0, state.events.length - EVENT_LIMIT)
  for (const listener of eventListeners) {
    try {
      listener(entry)
    } catch {
      // A broken dashboard connection must never affect production work.
    }
  }
  return entry
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function uniqueSlug(base) {
  const root = slugify(base) || 'agent'
  let candidate = root
  let index = 2
  while (state.agents.some((agent) => agent.slug === candidate)) {
    candidate = `${root}-${index}`
    index += 1
  }
  return candidate
}

function normalizeDirectives(value) {
  const source = value && typeof value === 'object' ? value : {}
  const merged = { ...DEFAULT_DIRECTIVES, ...source }
  return {
    hooks: Math.max(1, Math.min(6, Number(merged.hooks) || 3)),
    sceneMaxSec: Math.max(3, Math.min(30, Number(merged.sceneMaxSec) || 8)),
    minWordsPerMin: Math.max(60, Math.min(240, Number(merged.minWordsPerMin) || 120)),
    requireCta: Boolean(merged.requireCta),
    labelUnverified: Boolean(merged.labelUnverified),
    strictJson: Boolean(merged.strictJson),
  }
}

function normalizePermissions(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    canCallModel: source.canCallModel !== false,
    canPublish: Boolean(source.canPublish),
    canRender: Boolean(source.canRender),
    canApprove: Boolean(source.canApprove),
  }
}

function pushVersion(agent, { instructions, tools, permissions, directives, createdBy, evaluation = null }) {
  for (const version of agent.versions) {
    if (version.status === 'active') version.status = 'superseded'
  }
  const version = agent.version + 1
  agent.version = version
  agent.instructions = instructions
  agent.tools = tools ?? agent.tools
  agent.permissions = permissions ?? agent.permissions
  agent.directives = directives ?? agent.directives
  agent.updatedAt = nowISO()
  agent.versions.push({
    version,
    status: 'active',
    instructions: agent.instructions,
    tools: agent.tools,
    permissions: agent.permissions,
    directives: agent.directives,
    createdAt: agent.updatedAt,
    createdBy: createdBy ?? 'system',
    evaluation,
  })
  if (agent.versions.length > 50) agent.versions.splice(0, agent.versions.length - 50)
  return version
}

function makeAgent({ name, role, capability, instructions, tools, permissions, directives, icon, hue, createdBy }) {
  const created = nowISO()
  return {
    id: id('agt'),
    slug: uniqueSlug(name || capability),
    name,
    role,
    capability,
    icon: icon || 'search',
    hue: hue || 'cyan',
    instructions,
    tools: Array.isArray(tools) ? tools.map((tool) => truncate(String(tool), 40)).slice(0, 20) : [],
    permissions: normalizePermissions(permissions),
    directives: normalizeDirectives(directives),
    status: 'active',
    version: 1,
    createdBy: createdBy ?? 'factory',
    createdAt: created,
    updatedAt: created,
    versions: [
      {
        version: 1,
        status: 'active',
        instructions,
        tools: Array.isArray(tools) ? tools : [],
        permissions: normalizePermissions(permissions),
        directives: normalizeDirectives(directives),
        createdAt: created,
        createdBy: createdBy ?? 'factory',
        evaluation: null,
      },
    ],
    performance: emptyPerformance(),
    memory: [],
    evaluations: [],
  }
}

function factoryAgent(capability) {
  const template = CAPABILITY_TEMPLATES[capability]
  if (!template) throw new Error(`Unknown capability ${capability}`)
  return makeAgent({
    name: template.role,
    role: template.role,
    capability,
    instructions: template.instructions,
    tools: template.tools,
    permissions: template.permissions,
    directives: template.directives,
    icon: template.icon,
    hue: template.hue,
    createdBy: 'factory',
  })
}

function seedIfEmpty() {
  if (state.agents.length) return
  const producer = factoryAgent('producer-review')
  producer.createdBy = 'seed'
  producer.versions[0].createdBy = 'seed'
  state.agents.push(producer)
  state.meta.seeded = true
  emit('agent.created', {
    agentId: producer.id,
    agentName: producer.name,
    message: `${producer.name} registered as the founding agent (v1, seeded).`,
    data: { createdBy: 'seed', capability: producer.capability },
  })
}

function hydrate(store) {
  state.version = 2
  state.seq = Number(store.seq) || 0
  state.agents = Array.isArray(store.agents) ? store.agents : []
  state.productions = Array.isArray(store.productions) ? store.productions : []
  state.events = Array.isArray(store.events) ? store.events : []
  state.improvements = Array.isArray(store.improvements) ? store.improvements : []
  state.meta = { ...state.meta, ...(store.meta ?? {}) }
  for (const agent of state.agents) {
    agent.performance = { ...emptyPerformance(), ...(agent.performance ?? {}) }
    agent.memory = Array.isArray(agent.memory) ? agent.memory : []
    agent.evaluations = Array.isArray(agent.evaluations) ? agent.evaluations : []
    agent.versions = Array.isArray(agent.versions) && agent.versions.length
      ? agent.versions
      : [{ version: agent.version ?? 1, status: 'active', instructions: agent.instructions ?? '', createdAt: agent.createdAt ?? nowISO(), createdBy: agent.createdBy ?? 'system', evaluation: null }]
    agent.directives = normalizeDirectives(agent.directives)
  }
  for (const production of state.productions) {
    production.tasks = Array.isArray(production.tasks) ? production.tasks : []
    production.feedback = Array.isArray(production.feedback) ? production.feedback : []
    production.researchSignals = Array.isArray(production.researchSignals) ? production.researchSignals : []
    production.revisions = Array.isArray(production.revisions) ? production.revisions : []
    production.revision = Number(production.revision) || 0
    production.requireScriptApproval = Boolean(production.requireScriptApproval)
    production.scriptApproved = Boolean(production.scriptApproved)
    if (!production.render) production.render = { status: 'not_rendered', note: 'No render uploaded yet.' }
  }
}

export async function initWorkforce() {
  if (initialized) return state
  const store = await readStore(STORE, {
    version: 2,
    seq: 0,
    agents: [],
    productions: [],
    events: [],
    improvements: [],
    meta: {},
  })
  hydrate(store)
  seedIfEmpty()

  // Resume work interrupted by a restart. In-flight tasks are reset to pending
  // so they re-run with their attempt count preserved.
  let resumed = 0
  const unplanned = []
  for (const production of state.productions) {
    if (!['running', 'planning', 'queued'].includes(production.status)) continue
    if (production.status === 'queued' || production.status === 'planning') {
      production.status = 'running'
    }
    if (!production.tasks.length) {
      unplanned.push(production)
      continue
    }
    for (const task of production.tasks) {
      if (task.status === 'running') {
        task.status = 'pending'
        task.readyAt = Date.now() + 500
        task.error = 'Server restarted mid-task; queued for another attempt.'
        resumed += 1
      }
    }
    production.updatedAt = nowISO()
  }
  if (resumed > 0) {
    emit('workforce.resumed', {
      message: `Recovered ${resumed} interrupted task${resumed === 1 ? '' : 's'} from the previous process.`,
      data: { resumed },
    })
  }
  if (!state.meta.persistedAt) {
    state.meta.persistedAt = nowISO()
  }
  save()

  initialized = true
  if (!worker) {
    worker = setInterval(() => {
      void tick()
    }, 700)
    worker.unref?.()
  }
  for (const production of unplanned) {
    void planProduction(production)
  }
  return state
}

function findAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId) ?? null
}

function ensureAgentFor(capability, production) {
  const existing = state.agents.find((agent) => agent.capability === capability && agent.status === 'active')
  if (existing) return { agent: existing, created: false }
  const agent = factoryAgent(capability)
  state.agents.push(agent)
  emit('agent.created', {
    productionId: production?.id ?? null,
    agentId: agent.id,
    agentName: agent.name,
    message: `Agent Factory created ${agent.name} (v1) for capability “${capability}” after the manager found no active specialist.`,
    data: { capability, createdBy: 'factory', version: 1 },
  })
  return { agent, created: true }
}

function memoryDigest(agent, limit = 5) {
  const entries = [...agent.memory]
    .sort((a, b) => b.weight - a.weight || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
  return entries.map((entry) => `- [${entry.kind}] ${entry.content}`).join('\n')
}

function addMemory(agent, { kind, content, weight, taskId, productionId }) {
  if (!agent || !content) return null
  const entry = {
    id: id('mem'),
    agentId: agent.id,
    kind: ['success', 'failure', 'correction', 'feedback', 'insight'].includes(kind) ? kind : 'insight',
    content: truncate(String(content), 600),
    weight: Math.max(0.1, Math.min(2, Number(weight) || 0.6)),
    taskId: taskId ?? null,
    productionId: productionId ?? null,
    createdAt: nowISO(),
  }
  agent.memory.unshift(entry)
  if (agent.memory.length > MEMORY_LIMIT) agent.memory.length = MEMORY_LIMIT
  emit('memory.added', {
    agentId: agent.id,
    agentName: agent.name,
    productionId,
    message: `${agent.name} stored a ${entry.kind} memory.`,
    data: { memoryId: entry.id, kind: entry.kind, weight: entry.weight },
  })
  return entry
}

function progressFor(production) {
  const tasks = production.tasks
  if (!tasks.length) return 0
  const completed = tasks.filter((task) => task.status === 'completed' || task.status === 'skipped').length
  const running = tasks.filter((task) => task.status === 'running').length
  return Math.min(1, Math.round(((completed + running * 0.5) / tasks.length) * 100) / 100)
}

function productionSummary(production) {
  const tasks = production.tasks
  return {
    id: production.id,
    topic: production.topic,
    title: production.title,
    platform: production.platform,
    language: production.language,
    durationSec: production.durationSec,
    status: production.status,
    approved: Boolean(production.approved),
    progress: progressFor(production),
    revision: production.revision ?? 0,
    requireScriptApproval: Boolean(production.requireScriptApproval),
    scriptApproved: Boolean(production.scriptApproved),
    scriptApprovedAt: production.scriptApprovedAt ?? null,
    createdAt: production.createdAt,
    updatedAt: production.updatedAt,
    startedAt: production.startedAt ?? null,
    completedAt: production.completedAt ?? null,
    qualityScore: production.qualityScore ?? null,
    engines: production.engines ?? { llm: 'local-heuristic', video: 'browser-canvas' },
    render: renderView(production),
    taskCounts: {
      total: tasks.length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      running: tasks.filter((task) => task.status === 'running').length,
      pending: tasks.filter((task) => task.status === 'pending').length,
      failed: tasks.filter((task) => task.status === 'failed').length,
      skipped: tasks.filter((task) => task.status === 'skipped').length,
    },
    plan: production.plan ?? { agentIds: [], notes: '' },
  }
}

function renderView(production) {
  const render = production.render ?? { status: 'not_rendered', note: 'No render uploaded yet.' }
  return {
    status: render.status,
    mime: render.mime ?? null,
    size: render.size ?? null,
    renderedAt: render.renderedAt ?? null,
    durationSec: render.durationSec ?? null,
    note: render.note,
    url: render.status === 'uploaded' ? `/api/workforce/productions/${production.id}/render/file` : null,
  }
}

function taskView(task) {
  return {
    id: task.id,
    productionId: task.productionId,
    title: task.title,
    capability: task.capability,
    agentId: task.agentId,
    agentName: task.agentName,
    status: task.status,
    dependsOn: task.dependsOn ?? [],
    attempts: task.attempts ?? 0,
    maxAttempts: task.maxAttempts ?? MAX_ATTEMPTS,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    durationMs: task.durationMs ?? null,
    summary: task.summary ?? '',
    error: task.error ?? null,
    quality: task.quality ?? null,
    engine: task.engine ?? 'local-heuristic',
    qualityChecks: task.quality?.checks ?? [],
  }
}

function productionDetail(production) {
  return {
    ...productionSummary(production),
    tasks: production.tasks.map(taskView),
    artifacts: production.artifacts ?? null,
    evaluation: production.evaluation ?? null,
    feedback: production.feedback ?? [],
    revisions: (production.revisions ?? []).slice(0, 20),
    improvements: state.improvements.filter((row) => row.productionId === production.id),
    researchSignals: (production.researchSignals ?? []).slice(0, 18),
    engineNotes: production.engineNotes ?? [],
  }
}

function agentSummary(agent) {
  const running = state.productions
    .flatMap((production) => production.tasks.map((task) => ({ task, production })))
    .find(({ task }) => task.agentId === agent.id && task.status === 'running')
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    capability: agent.capability,
    icon: agent.icon,
    hue: agent.hue,
    status: agent.status,
    version: agent.version,
    createdBy: agent.createdBy,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    tools: agent.tools,
    permissions: agent.permissions,
    memoryCount: agent.memory.length,
    performance: performanceView(agent.performance),
    currentTask: running
      ? { id: running.task.id, title: running.task.title, productionId: running.production.id, status: running.task.status }
      : null,
  }
}

function agentDetail(agent) {
  return {
    ...agentSummary(agent),
    instructions: agent.instructions,
    directives: agent.directives,
    versions: agent.versions.map((version) => ({
      version: version.version,
      status: version.status,
      instructions: version.instructions,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      evaluation: version.evaluation ?? null,
    })),
    memory: agent.memory.slice(0, 40),
    evaluations: agent.evaluations.slice(0, 20),
    recentTasks: state.productions
      .flatMap((production) => production.tasks.map((task) => ({ task, production })))
      .filter(({ task }) => task.agentId === agent.id)
      .sort((a, b) => String(b.task.completedAt ?? b.task.startedAt ?? '').localeCompare(String(a.task.completedAt ?? a.task.startedAt ?? '')))
      .slice(0, 12)
      .map(({ task, production }) => ({ ...taskView(task), productionTitle: production.title })),
    improvements: state.improvements.filter((row) => row.agentId === agent.id),
  }
}

export function statusView() {
  const llm = resolveLlm()
  const activeTasks = state.productions.flatMap((production) => production.tasks).filter((task) => task.status === 'running')
  const running = state.productions.filter((production) => production.status === 'running' || production.status === 'planning').length
  return {
    ok: true,
    name: 'AI Viral Studio workforce',
    version: '2.0.0',
    time: nowISO(),
    engine: {
      llm: {
        configured: llm.configured,
        provider: llm.provider,
        model: llm.model,
        detail: llm.detail,
      },
      video: {
        configured: false,
        provider: null,
        detail: 'Video bytes are produced by the browser canvas renderer. External video providers are not configured; the server verifies and stores the file the browser uploads.',
      },
    },
    counts: {
      agents: {
        total: state.agents.length,
        active: state.agents.filter((agent) => agent.status === 'active').length,
        retired: state.agents.filter((agent) => agent.status === 'retired').length,
      },
      productions: {
        total: state.productions.length,
        running,
        completed: state.productions.filter((production) => ['awaiting_approval', 'approved', 'completed'].includes(production.status)).length,
        failed: state.productions.filter((production) => production.status === 'failed').length,
      },
      tasks: {
        pending: state.productions.flatMap((production) => production.tasks).filter((task) => task.status === 'pending').length,
        running: activeTasks.length,
        completed: state.productions.flatMap((production) => production.tasks).filter((task) => task.status === 'completed').length,
        failed: state.productions.flatMap((production) => production.tasks).filter((task) => task.status === 'failed').length,
      },
      memory: state.agents.reduce((sum, agent) => sum + agent.memory.length, 0),
      improvements: { pending: state.improvements.filter((row) => row.status === 'proposed').length },
    },
    workers: { concurrency: CONCURRENCY, active: inFlight.size },
    persistence: {
      path: join(CONFIG.dataDir, STORE).replace(/\\/g, '/'),
      savedAt: state.meta.updatedAt ?? null,
    },
  }
}

export function listAgents() {
  return state.agents.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function listAgentSummaries() {
  return listAgents().map(agentSummary)
}

export function getAgent(agentId) {
  const agent = findAgent(agentId)
  return agent ? agentDetail(agent) : null
}

function validateAgentInput(body) {
  const name = truncate(String(body?.name ?? '').trim(), 80)
  const role = truncate(String(body?.role ?? '').trim(), 100)
  const capability = truncate(String(body?.capability ?? '').trim(), 40)
  const instructions = truncate(String(body?.instructions ?? '').trim(), 4000)
  if (name.length < 2) throw badRequest('Agent name must be at least 2 characters.')
  if (role.length < 2) throw badRequest('Agent role must be at least 2 characters.')
  if (!capability) throw badRequest('Capability is required.')
  if (instructions.length < 20) throw badRequest('Instructions must be at least 20 characters.')
  if (capability !== 'custom' && !CAPABILITY_TEMPLATES[capability]) {
    throw badRequest(`Unknown capability “${capability}”. Use a known capability or "custom".`)
  }
  return { name, role, capability, instructions }
}

function badRequest(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

export function createAgent(body) {
  const input = validateAgentInput(body)
  const template = CAPABILITY_TEMPLATES[input.capability]
  const agent = makeAgent({
    ...input,
    tools: Array.isArray(body?.tools)
      ? body.tools.filter((tool) => typeof tool === 'string')
      : template?.tools ?? [],
    permissions: body?.permissions ?? template?.permissions ?? {},
    directives: body?.directives ?? template?.directives ?? {},
    icon: truncate(String(body?.icon ?? template?.icon ?? 'search'), 20),
    hue: truncate(String(body?.hue ?? template?.hue ?? 'cyan'), 20),
    createdBy: 'user',
  })
  state.agents.push(agent)
  emit('agent.created', {
    agentId: agent.id,
    agentName: agent.name,
    message: `Registered ${agent.name} (v1) from the Agent Factory console for capability “${agent.capability}”.`,
    data: { createdBy: 'user', capability: agent.capability },
  })
  save()
  return agentDetail(agent)
}

export function updateAgent(agentId, body) {
  const agent = findAgent(agentId)
  if (!agent) return null
  const patch = {}
  if (typeof body?.instructions === 'string') {
    const instructions = truncate(body.instructions.trim(), 4000)
    if (instructions.length < 20) throw badRequest('Instructions must be at least 20 characters.')
    patch.instructions = instructions
  }
  if (typeof body?.role === 'string' && body.role.trim()) patch.role = truncate(body.role.trim(), 100)
  if (Array.isArray(body?.tools)) {
    patch.tools = body.tools.filter((tool) => typeof tool === 'string').map((tool) => truncate(tool, 40)).slice(0, 20)
  }
  if (body?.permissions && typeof body.permissions === 'object') {
    patch.permissions = normalizePermissions({ ...agent.permissions, ...body.permissions })
  }
  if (body?.directives && typeof body.directives === 'object') {
    patch.directives = normalizeDirectives({ ...agent.directives, ...body.directives })
  }
  if (body?.status === 'retired' || body?.status === 'active') patch.status = body.status

  const instructionsChanged = patch.instructions && patch.instructions !== agent.instructions
  if (instructionsChanged) {
    const version = pushVersion(agent, {
      instructions: patch.instructions,
      tools: patch.tools,
      permissions: patch.permissions,
      directives: patch.directives,
      createdBy: 'user',
    })
    emit('agent.updated', {
      agentId: agent.id,
      agentName: agent.name,
      message: `${agent.name} instructions updated to v${version} by the operator.`,
      data: { version, capability: agent.capability },
    })
  } else {
    if (patch.role) agent.role = patch.role
    if (patch.tools) agent.tools = patch.tools
    if (patch.permissions) agent.permissions = patch.permissions
    if (patch.directives) agent.directives = patch.directives
    agent.updatedAt = nowISO()
    emit('agent.updated', {
      agentId: agent.id,
      agentName: agent.name,
      message: `${agent.name} configuration updated.`,
      data: { version: agent.version, capability: agent.capability },
    })
  }
  if (patch.status) agent.status = patch.status
  save()
  return agentDetail(agent)
}

export function retireAgent(agentId) {
  const agent = findAgent(agentId)
  if (!agent) return null
  agent.status = 'retired'
  agent.updatedAt = nowISO()
  emit('agent.retired', {
    agentId: agent.id,
    agentName: agent.name,
    message: `${agent.name} retired. The manager will create a replacement when this capability is needed again.`,
    data: { version: agent.version },
  })
  save()
  return agentDetail(agent)
}

export function listProductions() {
  return state.productions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function listProductionSummaries() {
  return listProductions().map(productionSummary)
}

export function getProduction(productionId) {
  const production = state.productions.find((row) => row.id === productionId)
  return production ? productionDetail(production) : null
}

function buildTask(production, capability, agent, dependencyIndex) {
  const template = CAPABILITY_TEMPLATES[capability]
  const dependsOn = dependenciesFor(capability, production.language)
    .map((dependency) => dependencyIndex.get(dependency))
    .filter(Boolean)
  return {
    id: id('tsk'),
    productionId: production.id,
    title: template.title,
    capability,
    agentId: agent.id,
    agentName: agent.name,
    status: 'pending',
    dependsOn,
    capabilityDeps: dependenciesFor(capability, production.language),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    readyAt: 0,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    summary: '',
    error: null,
    quality: null,
    engine: 'local-heuristic',
    output: null,
  }
}

async function collectSignals(topic) {
  try {
    const data = await getLiveTrends({ geo: CONFIG.geo })
    const signals = Array.isArray(data?.signals) ? data.signals : []
    return {
      signals,
      note: signals.length
        ? `Collected ${signals.length} live public signals (${data.geo ?? CONFIG.geo}).`
        : data?.note || 'No live signal returned by the feeds.',
      error: null,
    }
  } catch (error) {
    return { signals: [], note: 'Live feeds could not be reached. Research will record the failure instead of inventing sources.', error: truncate(error?.message ?? error, 180) }
  }
}

async function planProduction(production) {
  try {
    const feed = await collectSignals(production.topic)
    production.researchSignals = feed.signals.slice(0, 18).map((signal) => ({
      title: signal.title,
      source: signal.source,
      url: signal.url,
      score: signal.score,
      rank: signal.rank,
      metricLabel: signal.metricLabel,
      publishedAt: signal.publishedAt ?? null,
      snippet: truncate(signal.snippet ?? '', 180),
    }))
    production.engineNotes = []
    if (feed.error) production.engineNotes.push(`Live feed error: ${feed.error}`)
    else production.engineNotes.push(feed.note)

    if (production.status === 'cancelled') {
      save()
      return
    }

    const capabilities = capabilitiesForProduction(production.platform, production.language)
    const dependencyIndex = new Map()
    const createdAgents = []
    const agentIds = []
    for (const capability of capabilities) {
      const { agent, created } = ensureAgentFor(capability, production)
      if (created) createdAgents.push(agent.id)
      if (!agentIds.includes(agent.id)) agentIds.push(agent.id)
      const task = buildTask(production, capability, agent, dependencyIndex)
      dependencyIndex.set(capability, task.id)
      production.tasks.push(task)
    }
    production.plan = {
      capabilities,
      agentIds,
      createdAgents,
      notes: [
        `${capabilities.length} tasks planned across ${agentIds.length} specialists.`,
        createdAgents.length
          ? `Agent Factory created ${createdAgents.length} new specialist${createdAgents.length === 1 ? '' : 's'} for this brief.`
          : 'All required specialists were already registered.',
        feed.note,
      ].join(' '),
    }
    production.status = production.status === 'paused' || production.status === 'cancelled' ? production.status : 'running'
    production.startedAt = nowISO()
    production.updatedAt = nowISO()
    emit('production.plan', {
      productionId: production.id,
      message: `Manager planned “${production.title}”: ${capabilities.length} tasks, ${agentIds.length} agents${createdAgents.length ? `, ${createdAgents.length} created by the factory` : ''}.`,
      data: { capabilities, agentIds, createdAgents, signals: production.researchSignals.length },
    })
    for (const capability of capabilities) {
      const task = production.tasks.find((row) => row.capability === capability)
      emit('task.queued', {
        productionId: production.id,
        taskId: task.id,
        agentId: task.agentId,
        agentName: task.agentName,
        message: `Queued “${task.title}” for ${task.agentName} (${task.capabilityDeps.length ? `after ${task.capabilityDeps.join(', ')}` : 'no dependencies'}).`,
        data: { capability, dependsOn: task.capabilityDeps },
      })
    }
    save()
    void tick()
  } catch (error) {
    production.status = 'failed'
    production.error = truncate(error?.message ?? error, 240)
    production.updatedAt = nowISO()
    emit('production.failed', {
      productionId: production.id,
      message: `Planning failed: ${production.error}`,
    })
    save()
  }
}

export function createProduction(body) {
  const topic = truncate(String(body?.topic ?? '').trim().replace(/\s+/g, ' '), 500)
  if (topic.length < 3) throw badRequest('A topic of at least 3 characters is required.')
  const platform = String(body?.platform ?? 'instagram-reel')
  if (!PLATFORMS[platform]) throw badRequest(`Unknown platform “${platform}”. Use instagram-reel, youtube-short or youtube-long.`)
  const language = String(body?.language ?? 'en')
  if (!LANGUAGES[language]) throw badRequest(`Unknown language “${language}”. Use en, te, hi, ta or kn.`)
  const config = PLATFORMS[platform]
  const durationRaw = Number(body?.durationSec)
  const durationSec = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.max(10, Math.min(900, Math.round(durationRaw)))
    : config.defaultDurationSec
  const title = truncate(topic, 90)
  const production = {
    id: id('prd'),
    topic,
    title,
    platform,
    language,
    durationSec,
    status: 'planning',
    approved: false,
    requireScriptApproval: Boolean(body?.requireScriptApproval),
    scriptApproved: false,
    scriptApprovedAt: null,
    revision: 0,
    revisions: [],
    progress: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    startedAt: null,
    completedAt: null,
    qualityScore: null,
    engines: { llm: resolveLlm().configured ? `${resolveLlm().provider}:${resolveLlm().model}` : 'local-heuristic', video: 'browser-canvas' },
    render: {
      status: 'not_rendered',
      note: 'No render uploaded yet. The browser canvas renderer must run and upload the file; the server verifies the signature.',
    },
    tasks: [],
    plan: { capabilities: [], agentIds: [], createdAgents: [], notes: 'Planning started.' },
    researchSignals: [],
    artifacts: null,
    evaluation: null,
    feedback: [],
    engineNotes: [],
    error: null,
  }
  state.productions.push(production)
  emit('production.started', {
    productionId: production.id,
    message: `New production: “${title}” (${config.label}, ${durationSec}s, ${LANGUAGES[language]}).`,
    data: { platform, language, durationSec },
  })
  save()
  void planProduction(production)
  return productionDetail(production)
}

function readyAt(task) {
  return Number(task.readyAt) || 0
}

function upstreamFor(production, task) {
  const map = {}
  for (const dependency of task.capabilityDeps) {
    const upstreamTask = production.tasks.find((row) => row.capability === dependency)
    if (upstreamTask?.output) map[dependency] = upstreamTask.output
  }
  // The script is a universal upstream for fact checking and localization even
  // when the immediate dependency chain is shorter.
  for (const taskRow of production.tasks) {
    if (taskRow.capability !== task.capability && taskRow.output && !map[taskRow.capability]) {
      map[taskRow.capability] = taskRow.output
    }
  }
  return map
}

async function tick() {
  if (!initialized) return
  const now = Date.now()
  let slots = CONCURRENCY - inFlight.size
  for (const production of state.productions) {
    if (production.status !== 'running') continue
    for (const task of production.tasks) {
      if (task.status !== 'pending') continue
      const dependencyTasks = task.dependsOn.map((depId) => production.tasks.find((row) => row.id === depId)).filter(Boolean)
      if (dependencyTasks.some((dep) => dep.status === 'failed' || dep.status === 'skipped')) {
        task.status = 'skipped'
        task.completedAt = nowISO()
        task.summary = 'Skipped because an upstream task failed.'
        emit('task.skipped', {
          productionId: production.id,
          taskId: task.id,
          agentId: task.agentId,
          agentName: task.agentName,
          message: `Skipped “${task.title}” after an upstream failure.`,
        })
        save()
        continue
      }
      if (!dependencyTasks.every((dep) => dep.status === 'completed')) continue
      if (readyAt(task) > now) continue
      if (slots <= 0) break
      slots -= 1
      startTask(production, task)
    }
  }
}

function startTask(production, task) {
  task.status = 'running'
  task.attempts += 1
  task.startedAt = nowISO()
  task.error = null
  inFlight.add(task.id)
  emit('task.started', {
    productionId: production.id,
    taskId: task.id,
    agentId: task.agentId,
    agentName: task.agentName,
    message: `${task.agentName} claimed “${task.title}” (attempt ${task.attempts}/${task.maxAttempts}).`,
    data: { capability: task.capability, attempt: task.attempts },
  })
  for (const dependency of task.capabilityDeps) {
    const upstreamTask = production.tasks.find((row) => row.capability === dependency)
    if (upstreamTask?.agentId && upstreamTask.agentId !== task.agentId) {
      emit('agent.message', {
        productionId: production.id,
        taskId: task.id,
        agentId: upstreamTask.agentId,
        agentName: upstreamTask.agentName,
        message: `${upstreamTask.agentName} → ${task.agentName}: handoff for “${task.title}”.`,
        data: { from: upstreamTask.agentId, to: task.agentId, topic: 'handoff', capability: task.capability },
      })
    }
  }
  save()
  void runTask(production.id, task.id)
}

function buildModelPrompt(production, task, agent, local, upstream) {
  const memory = memoryDigest(agent)
  const upstreamSummaries = Object.entries(upstream)
    .map(([capability, output]) => `- ${capability}: ${truncate(output?.summary ?? '', 240)}`)
    .join('\n')
  const system = [
    agent.instructions,
    '',
    'You are one specialist in an autonomous production workforce. Return exactly one JSON object and nothing else. Do not use markdown fences.',
    'Honesty rules: never invent sources, statistics, quotes, files or integrations. If a capability is blocked (for example audio without a TTS provider), say it is blocked. Mark uncertain claims as unverified.',
    memory ? `Memories from previous work:\n${memory}` : 'No prior memories for this capability.',
  ].join('\n')
  const user = [
    `PRODUCTION BRIEF\nTopic: ${production.topic}\nPlatform: ${production.platform}\nLanguage: ${LANGUAGES[production.language] ?? production.language}\nRuntime: ${production.durationSec}s`,
    task.revisionNote ? `OPERATOR REVISION NOTE\n${truncate(task.revisionNote, 600)}\nApply this note to your output. Do not ignore it.` : '',
    upstreamSummaries ? `UPSTREAM OUTPUTS\n${upstreamSummaries}` : 'UPSTREAM OUTPUTS\nNone yet.',
    `LOCAL BASELINE (same JSON shape; improve it, keep its honesty)\n${JSON.stringify(local.data).slice(0, 3200)}`,
    'Return only the improved JSON object.',
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

function asString(value, max = 1000) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? truncate(text, max) : null
}

function asStringArray(value, max = 12, length = 200) {
  if (!Array.isArray(value)) return null
  const rows = value.filter((row) => typeof row === 'string' && row.trim()).map((row) => truncate(row.trim(), length)).slice(0, max)
  return rows.length ? rows : null
}

function mergeModelOutput(capability, local, data, ctx) {
  const artifacts = { ...(local.artifacts ?? {}) }
  const localData = { ...(local.data ?? {}) }
  let summary = local.summary
  const baseChecks = [...(local.checks ?? [])]
  let merged = false

  const summaryText = asString(data.summary, 400)
  if (summaryText) summary = summaryText

  if (capability === 'trend-research') {
    const items = Array.isArray(data.items)
      ? data.items
          .filter((item) => item && typeof item.title === 'string' && typeof item.source === 'string')
          .slice(0, 8)
          .map((item, index) => ({
            id: `model-${index}`,
            source: truncate(item.source, 80),
            title: truncate(item.title, 160),
            url: typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? truncate(item.url, 300) : '',
            note: truncate(typeof item.note === 'string' ? item.note : '', 220),
            relevance: Math.max(0, Math.min(100, Number(item.relevance) || 50)),
          }))
      : []
    if (items.length) {
      const known = new Set((ctx.liveSignals ?? []).map((signal) => String(signal.url ?? '')))
      const verified = items.filter((item) => !item.url || known.size === 0 || known.has(item.url))
      artifacts.research = verified
      localData.items = verified
      merged = true
    }
  } else if (capability === 'content-strategy') {
    const angle = asString(data.angle, 240)
    const audience = asString(data.audience, 240)
    if (angle) localData.angle = angle
    if (audience) localData.audience = audience
    for (const key of ['format', 'retention', 'cta']) {
      const value = asString(data[key], 300)
      if (value) localData[key] = value
    }
    const risks = asStringArray(data.risks, 6, 220)
    if (risks) localData.risks = risks
    merged = Boolean(angle || audience)
  } else if (capability === 'script') {
    const scenes = Array.isArray(data.scenes) ? data.scenes : []
    if (scenes.length) {
      const timings = localData.scenes ?? []
      const rebuilt = timings.map((timing, index) => {
        const scene = scenes[Math.min(scenes.length - 1, index)]
        return {
          ...timing,
          label: asString(scene?.label, 60) ?? timing.label,
          narration: asString(scene?.narration, 800) ?? timing.narration,
          visual: asString(scene?.visual, 400) ?? timing.visual,
          shot: asString(scene?.shot, 200) ?? timing.shot,
          mood: ['calm', 'tense', 'bright', 'insight'].includes(scene?.mood) ? scene.mood : timing.mood,
        }
      })
      localData.scenes = rebuilt
      artifacts.scenes = rebuilt
      const hook = asString(data.hook, 200)
      if (hook) {
        localData.hook = hook
        artifacts.hook = hook
      }
      const titles = asStringArray(data.titles, 6, 100)
      if (titles) {
        localData.titles = titles
        artifacts.titleOptions = titles
        artifacts.title = titles[0]
      }
      const cta = asString(data.cta, 200)
      if (cta) {
        localData.cta = cta
        artifacts.cta = cta
      }
      artifacts.scenes = rebuilt
      merged = true
    }
  } else if (capability === 'fact-check') {
    const claims = Array.isArray(data.claims)
      ? data.claims
          .filter((claim) => claim && typeof claim.text === 'string')
          .slice(0, 40)
          .map((claim, index) => ({
            text: truncate(claim.text, 240),
            status: claim.status === 'verified' ? 'verified' : 'unverified',
            evidence: truncate(typeof claim.evidence === 'string' ? claim.evidence : '', 240),
            sceneId: `model-${index}`,
          }))
      : []
    if (claims.length) {
      const verified = claims.filter((claim) => claim.status === 'verified').length
      localData.claims = claims
      localData.verified = verified
      localData.unverified = claims.length - verified
      localData.ratio = verified / claims.length
      artifacts.claims = claims
      merged = true
    }
  } else if (capability === 'localization') {
    const scenes = Array.isArray(data.scenes) ? data.scenes : []
    if (scenes.length && ctx.production.language !== 'en') {
      const source = localData.scenes ?? []
      const translated = source.map((scene, index) => ({
        ...scene,
        narration: asString(scenes[Math.min(scenes.length - 1, index)]?.narration, 900) ?? scene.narration,
        visual: asString(scenes[Math.min(scenes.length - 1, index)]?.visual, 400) ?? scene.visual,
      }))
      localData.scenes = translated
      localData.blocked = false
      artifacts.scenes = translated
      const hook = asString(data.hook, 200)
      if (hook) artifacts.hook = hook
      const titles = asStringArray(data.titles, 6, 100)
      if (titles) artifacts.titleOptions = titles
      artifacts.localization = { status: 'localized', language: ctx.production.language, detail: 'Translated by the configured model.' }
      merged = true
    }
  } else if (capability === 'storyboard') {
    const shots = Array.isArray(data.shots) ? data.shots.slice(0, 12) : []
    if (shots.length) {
      localData.shots = shots.map((shot, index) => ({
        scene: index + 1,
        framing: asString(shot.framing, 120) ?? 'Medium',
        movement: asString(shot.movement, 120) ?? 'Locked off',
        overlay: asString(shot.overlay, 120) ?? '',
        transition: asString(shot.transition, 60) ?? 'Hard cut',
      }))
      artifacts.storyboard = localData.shots
      merged = true
    }
  } else if (capability === 'narration') {
    const script = asString(data.script, 12000)
    if (script) {
      localData.script = script
      artifacts.narrationScript = script
      merged = true
    }
    artifacts.voice = { status: 'blocked', detail: 'No TTS provider configured. The narration is a timed script; the local render is silent.' }
  } else if (capability === 'visual-design') {
    const theme = data.theme
    if (theme && typeof theme === 'object') {
      const hex = (value) => (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null)
      localData.theme = {
        from: hex(theme.from) ?? localData.theme.from,
        to: hex(theme.to) ?? localData.theme.to,
        accent: hex(theme.accent) ?? localData.theme.accent,
      }
      artifacts.theme = localData.theme
      merged = true
    }
  } else if (capability === 'video-edit') {
    const editPlan = artifacts.editPlan ? { ...artifacts.editPlan } : {}
    for (const key of ['captionStyle', 'audioBed']) {
      const value = asString(data[key], 240)
      if (value) editPlan[key] = value
    }
    const transitions = asStringArray(data.transitions, 12, 60)
    if (transitions) editPlan.transitions = transitions
    artifacts.editPlan = editPlan
    merged = true
  } else if (capability === 'captions') {
    const cues = Array.isArray(data.lines)
      ? data.lines
          .filter((line) => line && typeof line.text === 'string' && Number.isFinite(Number(line.startSec)) && Number.isFinite(Number(line.endSec)))
          .slice(0, 80)
          .map((line) => ({
            startSec: Math.max(0, Number(line.startSec)),
            endSec: Math.max(Number(line.startSec) + 0.4, Number(line.endSec)),
            text: truncate(line.text, 200),
          }))
      : []
    if (cues.length) {
      localData.cues = cues
      artifacts.captionCues = cues
      artifacts.srt = cues
        .map((cue, index) => {
          const stamp = (value) => {
            const hours = Math.floor(value / 3600)
            const minutes = Math.floor((value % 3600) / 60)
            const secs = Math.floor(value % 60)
            const ms = Math.round((value - Math.floor(value)) * 1000)
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
          }
          return `${index + 1}\n${stamp(cue.startSec)} --> ${stamp(cue.endSec)}\n${cue.text}`
        })
        .join('\n\n')
      merged = true
    }
  } else if (capability === 'seo-metadata') {
    const youtubeTitle = asString(data.youtubeTitle, 100)
    if (youtubeTitle) {
      localData.title = youtubeTitle
      artifacts.youtubeTitle = youtubeTitle
    }
    const description = asString(data.description, 4000)
    if (description) {
      localData.description = description
      artifacts.description = description
    }
    const tags = asStringArray(data.tags, 15, 40)
    if (tags) {
      localData.tags = tags
      artifacts.youtubeTags = tags
    }
    const caption = asString(data.instagramCaption, 2000)
    if (caption) {
      localData.instagramCaption = caption
      artifacts.instagramCaption = caption
    }
    const hashtags = asStringArray(data.hashtags, 15, 40)
    if (hashtags) {
      localData.hashtags = hashtags
      artifacts.hashtags = hashtags
    }
    merged = Boolean(youtubeTitle || description)
  } else if (capability === 'quality-control') {
    const modelChecks = Array.isArray(data.checks)
      ? data.checks
          .filter((row) => row && typeof row.label === 'string' && ['pass', 'warn', 'fail'].includes(row.status))
          .slice(0, 6)
          .map((row, index) => ({
            id: `model-${index}`,
            label: `Model: ${truncate(row.label, 100)}`,
            status: row.status,
            detail: truncate(typeof row.detail === 'string' ? row.detail : '', 240),
          }))
      : []
    baseChecks.push(...modelChecks)
    merged = modelChecks.length > 0
  } else if (capability === 'producer-review') {
    const delivered = asStringArray(data.delivered, 20, 160)
    const blocked = asStringArray(data.blocked, 20, 160)
    if (delivered) localData.delivered = delivered
    if (blocked) localData.blocked = blocked
    const next = asString(data.next, 300)
    if (next) localData.next = next
    merged = Boolean(delivered || next)
  }

  if (merged && summaryText) {
    baseChecks.push({
      id: 'model-merge',
      label: 'Model output merged',
      status: 'pass',
      detail: 'The configured model output passed shape validation and was merged over the local baseline.',
    })
  }

  return { artifacts, data: localData, summary, checks: baseChecks, merged }
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

async function runTask(productionId, taskId) {
  const production = state.productions.find((row) => row.id === productionId)
  const task = production?.tasks.find((row) => row.id === taskId)
  if (!production || !task) return
  const agent = findAgent(task.agentId)
  const started = Date.now()
  try {
    if (!agent) throw new Error('Assigned agent no longer exists.')
    const upstream = upstreamFor(production, task)
    const ctx = {
      production,
      agent,
      upstream,
      liveSignals: production.researchSignals,
      directives: agent.directives,
      language: production.language,
      revisionNote: task.revisionNote ?? null,
    }
    const local = localGenerate(task.capability, ctx)
    let final = { ...local, engine: 'local-heuristic', merged: false }
    const llm = resolveLlm()
    if (llm.configured && agent.permissions.canCallModel) {
      const prompt = buildModelPrompt(production, task, agent, local, upstream)
      const result = await callModel(prompt)
      if (result.ok) {
        const merged = mergeModelOutput(task.capability, local, result.data, ctx)
        final = {
          ...local,
          artifacts: merged.artifacts,
          data: merged.data,
          summary: merged.summary,
          checks: merged.checks,
          engine: `${result.provider}:${result.model}`,
          merged: true,
        }
      } else {
        final.checks = [
          ...final.checks,
          {
            id: 'model-call',
            label: 'Model call failed',
            status: 'warn',
            detail: `Fell back to the local engine: ${result.error}`,
          },
        ]
        production.engineNotes = [...(production.engineNotes ?? []), `Model fallback on ${task.capability}: ${result.error}`]
        emit('agent.message', {
          productionId: production.id,
          taskId: task.id,
          agentId: agent.id,
          agentName: agent.name,
          message: `${agent.name}: model call failed (${result.error}); executed with the local engine instead.`,
          data: { fallback: true, capability: task.capability },
        })
      }
    }
    // Local generation is fast; keep a short, real execution window so the live
    // dashboard can observe the claim and handoff sequence without fake stages.
    const elapsed = Date.now() - started
    if (elapsed < 900) await new Promise((resolve) => setTimeout(resolve, 900 - elapsed))

    task.status = 'completed'
    task.completedAt = nowISO()
    task.durationMs = Date.now() - started
    task.summary = final.summary
    task.engine = final.engine
    task.output = { summary: final.summary, data: final.data, artifacts: final.artifacts, checks: final.checks, engine: final.engine }
    const score = qualityFromChecks(final.checks)
    task.quality = { score, checks: final.checks }
    production.artifacts = { ...(production.artifacts ?? {}), ...(final.artifacts ?? {}) }
    if (task.capability === 'quality-control' || task.capability === 'producer-review') {
      production.artifacts.qc = production.artifacts.qc ?? final.artifacts?.qc
    }
    production.artifacts.engine = final.engine
    production.engines = {
      llm: final.engine === 'local-heuristic' ? 'local-heuristic' : final.engine,
      video: 'browser-canvas',
    }
    production.updatedAt = nowISO()
    inFlight.delete(task.id)

    recordPerformance(agent, { status: 'completed', quality: score, durationMs: task.durationMs, retries: task.attempts - 1 })
    agent.evaluations.unshift({
      id: id('eva'),
      agentId: agent.id,
      taskId: task.id,
      productionId: production.id,
      quality: score,
      checks: final.checks,
      durationMs: task.durationMs,
      createdAt: task.completedAt,
    })
    if (agent.evaluations.length > 100) agent.evaluations.length = 100
    addMemory(agent, {
      kind: score >= 0.85 ? 'success' : 'insight',
      content: `${task.capability} on “${production.title}”: ${truncate(final.summary, 240)} (score ${score}).`,
      weight: score >= 0.85 ? 0.8 : 0.6,
      taskId: task.id,
      productionId: production.id,
    })

    emit('task.completed', {
      productionId: production.id,
      taskId: task.id,
      agentId: agent.id,
      agentName: agent.name,
      message: `${agent.name} completed “${task.title}” in ${(task.durationMs / 1000).toFixed(1)}s with a ${Math.round(score * 100)}% check score.`,
      data: { score, engine: final.engine, checks: final.checks.length, merged: final.merged },
    })
    emit('evaluation.scored', {
      productionId: production.id,
      taskId: task.id,
      agentId: agent.id,
      agentName: agent.name,
      message: `Evaluator scored ${task.capability} at ${Math.round(score * 100)}% (${final.checks.filter((row) => row.status === 'pass').length} pass, ${final.checks.filter((row) => row.status === 'warn').length} warn, ${final.checks.filter((row) => row.status === 'fail').length} fail).`,
      data: { score },
    })
    const downstream = production.tasks.filter((row) => (row.dependsOn ?? []).includes(task.id))
    for (const nextTask of downstream) {
      emit('agent.message', {
        productionId: production.id,
        taskId: task.id,
        agentId: agent.id,
        agentName: agent.name,
        message: `${agent.name} → ${nextTask.agentName}: delivered ${task.capability} output for “${nextTask.title}”.`,
        data: { from: agent.id, to: nextTask.agentId, topic: 'delivery', capability: task.capability },
      })
    }
    if (task.capability === 'script' && production.requireScriptApproval && !production.scriptApproved) {
      production.status = 'awaiting_script_approval'
      production.updatedAt = nowISO()
      emit('production.script_review', {
        productionId: production.id,
        taskId: task.id,
        agentId: agent.id,
        agentName: agent.name,
        message: `Script v${(production.revision ?? 0) + 1} is ready. Downstream specialists are paused until the operator approves the script or requests a revision.`,
        data: { revision: production.revision ?? 0, gate: 'script-approval' },
      })
      save()
      return
    }
    save()
    maybeFinalize(production)
  } catch (error) {
    inFlight.delete(task.id)
    task.error = truncate(error?.message ?? error, 260)
    task.durationMs = Date.now() - started
    const agentRow = findAgent(task.agentId)
    if (agentRow) {
      addMemory(agentRow, {
        kind: 'failure',
        content: `${task.capability} failed: ${task.error}`,
        weight: 1,
        taskId: task.id,
        productionId: production.id,
      })
    }
    if (task.attempts < task.maxAttempts) {
      task.status = 'pending'
      task.readyAt = Date.now() + 1200 * task.attempts
      emit('task.retry', {
        productionId: production.id,
        taskId: task.id,
        agentId: task.agentId,
        agentName: task.agentName,
        message: `${task.agentName} failed “${task.title}” (${task.error}). Retry ${task.attempts + 1}/${task.maxAttempts} queued.`,
        data: { attempt: task.attempts, error: task.error },
      })
    } else {
      task.status = 'failed'
      task.completedAt = nowISO()
      production.status = 'failed'
      production.error = task.error
      production.updatedAt = nowISO()
      if (agentRow) recordPerformance(agentRow, { status: 'failed', quality: 0, durationMs: task.durationMs, retries: task.attempts - 1 })
      emit('task.failed', {
        productionId: production.id,
        taskId: task.id,
        agentId: task.agentId,
        agentName: task.agentName,
        message: `${task.agentName} failed “${task.title}” after ${task.attempts} attempts: ${task.error}`,
      })
      emit('production.failed', {
        productionId: production.id,
        message: `Production “${production.title}” stopped after a failed ${task.capability} task. Retry is available.`,
      })
    }
    save()
  }
}

function maybeFinalize(production) {
  if (!['running', 'paused'].includes(production.status)) return
  const pending = production.tasks.some((task) => task.status === 'pending' || task.status === 'running')
  if (pending) return
  const failed = production.tasks.some((task) => task.status === 'failed')
  if (failed) return
  finalizeProduction(production)
}

function finalizeProduction(production) {
  const reviewTask = production.tasks.find((task) => task.capability === 'producer-review')
  if (reviewTask?.output?.artifacts) {
    production.artifacts = { ...(production.artifacts ?? {}), ...reviewTask.output.artifacts }
  }
  const evaluation = evaluateProduction({ tasks: production.tasks, feedback: production.feedback })
  production.evaluation = evaluation
  production.qualityScore = evaluation.score
  production.status = 'awaiting_approval'
  production.completedAt = nowISO()
  production.updatedAt = nowISO()
  const blocked = reviewTask?.output?.data?.blocked ?? []
  production.render = production.render ?? {}
  production.render.note = [
    'No render uploaded yet. Run the browser renderer and upload the result; the server verifies the file signature before marking it downloadable.',
    blocked.length ? `Blocked items: ${blocked.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  emit('production.completed', {
    productionId: production.id,
    message: `Production “${production.title}” finished all ${production.tasks.length} tasks and is awaiting approval. Measured quality ${Math.round(evaluation.score * 100)}%.`,
    data: { score: evaluation.score, checks: evaluation.checks },
  })
  save()
  void autoImprove(production)
}

async function autoImprove(production) {
  const agentIds = [...new Set(production.tasks.map((task) => task.agentId))]
  for (const agentId of agentIds.slice(0, 4)) {
    const agent = findAgent(agentId)
    if (!agent) continue
    const tasks = production.tasks.filter((task) => task.agentId === agentId && task.status === 'completed')
    const avg = average(tasks.map((task) => task.quality?.score ?? 0.5))
    const retries = tasks.reduce((sum, task) => sum + Math.max(0, task.attempts - 1), 0)
    const failed = production.tasks.some((task) => task.agentId === agentId && task.status === 'failed')
    if (!failed && retries === 0 && (avg ?? 1) >= 0.85) continue
    try {
      proposeImprovement(agent, production, { manual: false })
    } catch (error) {
      emit('improvement.error', {
        productionId: production.id,
        agentId: agent.id,
        agentName: agent.name,
        message: `Improvement analysis skipped for ${agent.name}: ${truncate(error?.message ?? error, 160)}`,
      })
    }
  }
  save()
}

function buildImprovementPlan(agent, production) {
  const tasks = production.tasks.filter((task) => task.agentId === agent.id)
  const checks = tasks.flatMap((task) => task.quality?.checks ?? [])
  const warnings = checks.filter((row) => row.status !== 'pass')
  const weaknessLabels = [...new Set(warnings.map((row) => row.label))].slice(0, 3)
  const retries = tasks.reduce((sum, task) => sum + Math.max(0, (task.attempts ?? 1) - 1), 0)
  const failed = tasks.some((task) => task.status === 'failed')
  const avg = average(tasks.map((task) => task.quality?.score ?? 0.5)) ?? 0.5

  const before = { ...agent.directives }
  const after = { ...agent.directives }
  const lessons = []
  if (failed || retries > 0) {
    after.strictJson = true
    lessons.push('Return exactly one valid JSON object; never wrap it in prose or code fences, and validate every required key before responding.')
  }
  if (warnings.some((row) => /word|budget/i.test(`${row.id} ${row.label}`))) {
    after.minWordsPerMin = Math.min(240, after.minWordsPerMin + 20)
    lessons.push(`Spoken density was below target; write at least ${after.minWordsPerMin} words per minute of runtime.`)
  }
  if (warnings.some((row) => /scene|length|coverage|runtime/i.test(`${row.id} ${row.label}`))) {
    after.sceneMaxSec = Math.max(4, after.sceneMaxSec - 1)
    lessons.push(`Keep every scene at or under ${after.sceneMaxSec} seconds and end the final scene exactly on the runtime.`)
  }
  if (warnings.some((row) => /claim|verified|label/i.test(`${row.id} ${row.label}`))) {
    after.labelUnverified = true
    lessons.push('Label every unverified claim explicitly and omit statistics that are not present in the evidence pack.')
  }
  if (warnings.some((row) => /hook/i.test(`${row.id} ${row.label}`))) {
    after.hooks = Math.min(5, after.hooks + 1)
    lessons.push(`Provide at least ${after.hooks} distinct title options and one hook under 140 characters.`)
  }
  if (warnings.some((row) => /cta/i.test(`${row.id} ${row.label}`))) {
    after.requireCta = true
    lessons.push('Finish with one explicit call to action.')
  }
  if (!lessons.length) {
    after.sceneMaxSec = Math.max(4, after.sceneMaxSec - 1)
    lessons.push(`Tighten pacing: keep each scene at or under ${after.sceneMaxSec} seconds and remove filler sentences.`)
  }

  const weakness = failed
    ? `Task failure on ${production.title}`
    : retries > 0
      ? `${retries} retry/retries during execution`
      : `Measured quality ${Math.round(avg * 100)}% with warnings: ${weaknessLabels.join('; ') || 'general pacing'}`
  const instructionsAfter = `${agent.instructions}\n\nLearned directive (v${agent.version + 1}, from production ${production.id}):\n${lessons.map((lesson) => `- ${lesson}`).join('\n')}`
  return { before, after, instructionsAfter, lessons, weakness, avg }
}

function runImprovementTest(agent, production, before, after) {
  const reference = {
    id: `${production.id}-test`,
    topic: production.topic,
    title: production.title,
    platform: production.platform,
    language: production.language,
    durationSec: production.durationSec,
  }
  const upstream = {}
  for (const task of production.tasks) {
    if (task.output) upstream[task.capability] = task.output
  }
  const baseAgent = { ...agent, directives: before }
  const candidateAgent = { ...agent, directives: after }
  const base = localGenerate(agent.capability, {
    production: reference,
    agent: baseAgent,
    upstream,
    liveSignals: production.researchSignals,
    directives: before,
    language: production.language,
  })
  const candidate = localGenerate(agent.capability, {
    production: reference,
    agent: candidateAgent,
    upstream,
    liveSignals: production.researchSignals,
    directives: after,
    language: production.language,
  })
  const baselineScore = qualityFromChecks(base.checks)
  const candidateScore = qualityFromChecks(candidate.checks)
  return {
    baselineScore,
    candidateScore,
    cases: 1,
    engine: 'local-directive-harness',
    note: `Re-ran ${agent.capability} on the production brief with the previous and candidate directives. Scores are computed by the same check evaluator; no model call was made.`,
    passed: candidateScore >= baselineScore && candidateScore >= 0.6,
  }
}

function proposeImprovement(agent, production, { manual }) {
  const existing = state.improvements.find(
    (row) => row.agentId === agent.id && row.status === 'proposed' && row.productionId === production.id,
  )
  if (existing) return existing
  const plan = buildImprovementPlan(agent, production)
  if (!manual && plan.avg >= 0.85 && !/failure|retry/.test(plan.weakness)) return null
  const test = runImprovementTest(agent, production, plan.before, plan.after)
  const improvement = {
    id: id('imp'),
    agentId: agent.id,
    agentName: agent.name,
    capability: agent.capability,
    fromVersion: agent.version,
    toVersion: agent.version + 1,
    status: 'proposed',
    weakness: plan.weakness,
    change: {
      instructionsBefore: agent.instructions,
      instructionsAfter: plan.instructionsAfter,
      directivesBefore: plan.before,
      directivesAfter: plan.after,
      lessons: plan.lessons,
    },
    test,
    createdAt: nowISO(),
    decidedAt: null,
    decidedBy: null,
    productionId: production.id,
  }
  state.improvements.unshift(improvement)
  if (state.improvements.length > 500) state.improvements.length = 500
  emit('improvement.proposed', {
    productionId: production.id,
    agentId: agent.id,
    agentName: agent.name,
    message: `${agent.name} proposed v${improvement.toVersion}: ${plan.weakness}. Test ${test.passed ? 'passed' : 'did not pass'} (baseline ${Math.round(test.baselineScore * 100)}% → candidate ${Math.round(test.candidateScore * 100)}%). Awaiting operator approval.`,
    data: { improvementId: improvement.id, test },
  })
  save()
  return improvement
}

export function listImprovements(status) {
  const rows = status ? state.improvements.filter((row) => row.status === status) : state.improvements
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function improveProduction(productionId) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  if (!['awaiting_approval', 'approved', 'completed', 'failed'].includes(production.status)) {
    throw badRequest('Improvement analysis runs after the production has finished executing.')
  }
  const agentIds = [...new Set(production.tasks.map((task) => task.agentId))]
  const created = []
  for (const agentId of agentIds) {
    const agent = findAgent(agentId)
    if (!agent) continue
    const proposal = proposeImprovement(agent, production, { manual: true })
    if (proposal) created.push(proposal)
  }
  save()
  return created
}

export function decideImprovement(improvementId, action, body = {}) {
  const improvement = state.improvements.find((row) => row.id === improvementId)
  if (!improvement) return null
  const agent = findAgent(improvement.agentId)
  if (!agent) throw badRequest('The agent for this improvement no longer exists.')
  if (action === 'approve') {
    if (improvement.status !== 'proposed') throw badRequest(`Cannot approve an improvement in status ${improvement.status}.`)
    if (!improvement.test?.passed) {
      throw badRequest('The improvement test did not pass. Reject it or adjust the agent manually.')
    }
    improvement.status = 'approved'
    improvement.decidedAt = nowISO()
    improvement.decidedBy = truncate(String(body?.approver ?? 'operator'), 80)
    const version = pushVersion(agent, {
      instructions: improvement.change.instructionsAfter,
      directives: improvement.change.directivesAfter,
      createdBy: 'improvement',
      evaluation: { score: improvement.test?.candidateScore ?? null, note: improvement.test?.note ?? '' },
    })
    emit('improvement.approved', {
      agentId: agent.id,
      agentName: agent.name,
      productionId: improvement.productionId,
      message: `${agent.name} v${version} approved. New instructions and directives are now active; the previous version is retained for rollback.`,
      data: { improvementId: improvement.id, version },
    })
    save()
    return { improvement, agent: agentDetail(agent) }
  }
  if (action === 'reject') {
    if (!['proposed', 'approved'].includes(improvement.status)) throw badRequest(`Cannot reject an improvement in status ${improvement.status}.`)
    improvement.status = 'rejected'
    improvement.decidedAt = nowISO()
    improvement.decidedBy = truncate(String(body?.approver ?? 'operator'), 80)
    improvement.reason = truncate(String(body?.reason ?? ''), 300)
    emit('improvement.rejected', {
      agentId: agent.id,
      agentName: agent.name,
      message: `${agent.name} v${improvement.toVersion} rejected${improvement.reason ? `: ${improvement.reason}` : '.'}`,
      data: { improvementId: improvement.id },
    })
    save()
    return { improvement, agent: agentDetail(agent) }
  }
  if (action === 'rollback') {
    if (improvement.status !== 'approved') throw badRequest('Only an approved improvement can be rolled back.')
    const version = pushVersion(agent, {
      instructions: improvement.change.instructionsBefore,
      directives: improvement.change.directivesBefore,
      createdBy: 'rollback',
      evaluation: { score: improvement.test?.baselineScore ?? null, note: 'Restored previous version after operator rollback.' },
    })
    improvement.status = 'rolled_back'
    improvement.decidedAt = nowISO()
    improvement.decidedBy = truncate(String(body?.approver ?? 'operator'), 80)
    emit('improvement.rolled_back', {
      agentId: agent.id,
      agentName: agent.name,
      message: `${agent.name} rolled back to the pre-improvement configuration as v${version}. History is preserved.`,
      data: { improvementId: improvement.id, version },
    })
    save()
    return { improvement, agent: agentDetail(agent) }
  }
  throw badRequest(`Unknown improvement action “${action}”.`)
}

export function addAgentMemory(agentId, body) {
  const agent = findAgent(agentId)
  if (!agent) return null
  const kind = ['correction', 'feedback', 'insight', 'success', 'failure'].includes(body?.kind) ? body.kind : 'insight'
  const content = truncate(String(body?.content ?? '').trim(), 600)
  if (content.length < 3) throw badRequest('Memory content must be at least 3 characters.')
  const weight = kind === 'correction' || kind === 'failure' ? 1.2 : kind === 'feedback' ? 1 : 0.7
  const memory = addMemory(agent, { kind, content, weight, productionId: body?.productionId ?? null })
  save()
  return memory
}

export function testAgent(agentId, body) {
  const agent = findAgent(agentId)
  if (!agent) return null
  const topic = truncate(String(body?.input ?? '').trim() || 'Test brief: explain a rising technology trend in 30 seconds', 300)
  const production = {
    id: `test-${id('prd')}`,
    topic,
    title: topic,
    platform: 'instagram-reel',
    language: 'en',
    durationSec: 30,
  }
  const started = Date.now()
  const output = localGenerate(agent.capability, {
    production,
    agent,
    upstream: {},
    liveSignals: [],
    directives: agent.directives,
    language: 'en',
  })
  const score = qualityFromChecks(output.checks)
  return {
    score,
    checks: output.checks,
    output: { summary: output.summary, engine: output.engine, data: output.data },
    engine: 'local-heuristic',
    durationMs: Date.now() - started,
    note: 'Sandbox test of the local directive engine. No production record was created and no model call was made.',
  }
}

export function controlProduction(productionId, action) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  if (action === 'pause') {
    if (!['running', 'planning', 'queued'].includes(production.status)) throw badRequest('Only a running production can be paused.')
    production.status = 'paused'
    production.updatedAt = nowISO()
    emit('production.paused', { productionId, message: `Production “${production.title}” paused. Running tasks finish; queued tasks wait.` })
  } else if (action === 'resume') {
    if (production.status !== 'paused') throw badRequest('Only a paused production can be resumed.')
    production.status = 'running'
    production.updatedAt = nowISO()
    emit('production.resumed', { productionId, message: `Production “${production.title}” resumed.` })
  } else if (action === 'cancel') {
    if (['approved', 'completed', 'cancelled'].includes(production.status)) throw badRequest('This production can no longer be cancelled.')
    production.status = 'cancelled'
    for (const task of production.tasks) {
      if (['pending', 'running'].includes(task.status)) {
        task.status = 'skipped'
        task.summary = 'Cancelled by the operator.'
        task.completedAt = nowISO()
      }
    }
    production.updatedAt = nowISO()
    emit('production.cancelled', { productionId, message: `Production “${production.title}” cancelled. Completed work is preserved.` })
  } else if (action === 'retry') {
    if (production.status !== 'failed') throw badRequest('Only a failed production can be retried.')
    for (const task of production.tasks) {
      if (task.status === 'failed' || task.status === 'skipped') {
        task.status = 'pending'
        task.attempts = 0
        task.error = null
        task.startedAt = null
        task.completedAt = null
        task.durationMs = null
        task.readyAt = 0
      }
    }
    production.status = 'running'
    production.error = null
    production.updatedAt = nowISO()
    emit('production.resumed', { productionId, message: `Production “${production.title}” requeued after failure. Retry is running.` })
  } else {
    throw badRequest(`Unknown production action “${action}”.`)
  }
  save()
  void tick()
  return productionDetail(production)
}

export function approveProduction(productionId, approved) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  if (!['awaiting_approval', 'approved'].includes(production.status)) {
    throw badRequest('Only a finished production can be approved.')
  }
  production.approved = Boolean(approved)
  production.status = approved ? 'approved' : 'awaiting_approval'
  production.updatedAt = nowISO()
  emit(approved ? 'production.approved' : 'production.unapproved', {
    productionId,
    message: approved
      ? `Production “${production.title}” approved by the operator. Publishing remains manual.`
      : `Approval withdrawn for “${production.title}”.`,
  })
  save()
  return productionDetail(production)
}

/**
 * Operator gate for the script. When a production was created with
 * requireScriptApproval, the manager stops after the script task and waits here.
 */
export function approveScript(productionId, approved = true) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  const scriptTask = production.tasks.find((task) => task.capability === 'script')
  if (!scriptTask) throw badRequest('This production has no script task yet.')
  if (scriptTask.status !== 'completed') throw badRequest('The script has not been produced yet.')
  if (!production.requireScriptApproval) {
    throw badRequest('Script approval is not enabled for this production.')
  }
  production.scriptApproved = Boolean(approved)
  production.scriptApprovedAt = approved ? nowISO() : null
  production.updatedAt = nowISO()
  if (approved) {
    production.status = 'running'
    emit('production.script_approved', {
      productionId,
      taskId: scriptTask.id,
      message: `Operator approved the script for “${production.title}”. Downstream specialists are released.`,
      data: { revision: production.revision ?? 0 },
    })
    save()
    void tick()
  } else {
    production.status = 'awaiting_script_approval'
    emit('production.script_rejected', {
      productionId,
      taskId: scriptTask.id,
      message: `Operator sent the script back for revision. Use “Request revision” with a note so the scriptwriter has a concrete target.`,
      data: { revision: production.revision ?? 0 },
    })
    save()
  }
  return productionDetail(production)
}

function resetTaskForRevision(task, note) {
  task.status = 'pending'
  task.attempts = 0
  task.error = null
  task.startedAt = null
  task.completedAt = null
  task.durationMs = null
  task.readyAt = 0
  task.summary = ''
  task.quality = null
  task.output = null
  task.revisionNote = note
}

/**
 * Operator-requested revision. Resets the script and every transitive
 * downstream task, records the note in each affected agent's memory and marks
 * any existing render as stale. Completed upstream work is preserved.
 */
export function requestRevision(productionId, body) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  const note = truncate(String(body?.note ?? '').trim(), 600)
  if (note.length < 3) throw badRequest('A revision note of at least 3 characters is required.')
  if (['running', 'planning', 'queued'].includes(production.status)) {
    throw badRequest('Pause or finish the running production before requesting a revision.')
  }
  if (production.status === 'cancelled') throw badRequest('A cancelled production cannot be revised.')
  const scriptTask = production.tasks.find((task) => task.capability === 'script')
  if (!scriptTask || scriptTask.status !== 'completed') {
    throw badRequest('The script must be complete before a revision can be requested.')
  }

  const affectedIds = new Set([scriptTask.id])
  let grew = true
  while (grew) {
    grew = false
    for (const task of production.tasks) {
      if (affectedIds.has(task.id)) continue
      if ((task.dependsOn ?? []).some((depId) => affectedIds.has(depId))) {
        affectedIds.add(task.id)
        grew = true
      }
    }
  }
  const affected = production.tasks.filter((task) => affectedIds.has(task.id))
  const previousRevision = production.revision ?? 0
  production.revision = previousRevision + 1
  const record = {
    revision: production.revision,
    note,
    at: nowISO(),
    requestedBy: 'operator',
    capabilities: affected.map((task) => task.capability),
  }
  production.revisions = [record, ...(production.revisions ?? [])].slice(0, 20)

  for (const task of affected) resetTaskForRevision(task, note)
  for (const agentId of [...new Set(affected.map((task) => task.agentId))]) {
    addMemory(findAgent(agentId), {
      kind: 'correction',
      content: `Operator revision r${record.revision} on “${production.title}”: ${note}`,
      weight: 1,
      productionId: production.id,
    })
  }

  production.artifacts = production.artifacts ? { ...production.artifacts, revision: record.revision } : null
  if (production.render?.status === 'uploaded') {
    production.render = {
      ...production.render,
      status: 'stale',
      note: `This render predates revision r${record.revision}. Re-render after the revised tasks complete.`,
    }
  }
  production.status = 'running'
  production.approved = false
  production.completedAt = null
  production.evaluation = null
  production.qualityScore = null
  production.error = null
  production.scriptApproved = false
  production.scriptApprovedAt = null
  production.updatedAt = nowISO()
  emit('production.revision', {
    productionId,
    taskId: scriptTask.id,
    message: `Operator requested revision r${record.revision}: “${note}”. Reset ${affected.length} task${affected.length === 1 ? '' : 's'} from scripting onward; upstream research is preserved.`,
    data: { revision: record.revision, note, capabilities: record.capabilities },
  })
  save()
  void tick()
  return productionDetail(production)
}

export function feedbackProduction(productionId, body) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return null
  const rating = Number(body?.rating)
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw badRequest('Rating must be between 1 and 5.')
  const note = truncate(String(body?.note ?? '').trim(), 600)
  production.feedback.unshift({ rating, note, at: nowISO() })
  if (production.feedback.length > 50) production.feedback.length = 50
  const agentIds = [...new Set(production.tasks.map((task) => task.agentId))]
  for (const agentId of agentIds) {
    const agent = findAgent(agentId)
    if (!agent) continue
    recordSatisfaction(agent, rating)
    if (note) {
      addMemory(agent, {
        kind: 'feedback',
        content: `Operator rated “${production.title}” ${rating}/5${note ? `: ${note}` : ''}.`,
        weight: 1,
        productionId: production.id,
      })
    }
  }
  production.evaluation = evaluateProduction({ tasks: production.tasks, feedback: production.feedback })
  production.qualityScore = production.evaluation.score
  production.updatedAt = nowISO()
  emit('feedback.received', {
    productionId,
    message: `Operator feedback recorded: ${rating}/5${note ? ` — “${note}”` : ''}. Agents stored it in memory and performance.`,
    data: { rating, agents: agentIds.length },
  })
  save()
  return productionDetail(production)
}

export function getEvents({ after = 0, productionId = null, limit = 200 } = {}) {
  const threshold = Number(after) || 0
  const max = Math.max(1, Math.min(500, Number(limit) || 200))
  const rows = state.events.filter((event) => event.seq > threshold && (!productionId || event.productionId === productionId))
  return { events: rows.slice(-max), seq: state.seq, lastSeq: state.seq }
}

async function ensureRendersDir() {
  await mkdir(RENDERS_DIR, { recursive: true })
}

export async function saveRender(productionId, buffer, declaredMime, durationHeader) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production) return { error: 'Production not found.', status: 404 }
  if (!buffer || !buffer.length) return { error: 'Empty render body.', status: 400 }
  if (buffer.length > 80 * 1024 * 1024) return { error: 'Render exceeds the 80 MB limit.', status: 413 }
  const mp4 = buffer.length > 12 && buffer.slice(4, 8).toString('latin1') === 'ftyp'
  const webm = buffer.length > 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  const mime = mp4 ? 'video/mp4' : webm ? 'video/webm' : null
  if (!mime) {
    return { error: 'File signature is neither ISO-BMFF (MP4) nor WebM. The server only stores real video containers.', status: 415 }
  }
  const ext = mp4 ? 'mp4' : 'webm'
  await ensureRendersDir()
  const file = join(RENDERS_DIR, `${production.id}.${ext}`)
  await writeFile(file, buffer)
  const duration = Number(durationHeader)
  const declared = (declaredMime || '').includes('mp4') ? 'video/mp4' : (declaredMime || '').includes('webm') ? 'video/webm' : null
  production.render = {
    status: 'uploaded',
    mime,
    size: buffer.length,
    renderedAt: nowISO(),
    file: `${production.id}.${ext}`,
    note: `Browser canvas render uploaded and stored after signature verification (${mp4 ? 'MP4 ftyp' : 'WebM EBML'} header). ${
      declared && declared !== mime ? `Browser declared ${declared}; the stored container is ${mime}. ` : ''
    }${Number.isFinite(duration) && duration > 0 ? `Renderer reported ${Math.round(duration)}s. ` : ''}No external video model was called.`,
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
  }
  production.updatedAt = nowISO()
  emit('render.uploaded', {
    productionId,
    message: `Stored a ${mime} render (${(buffer.length / 1024 / 1024).toFixed(2)} MB) for “${production.title}”. Signature verified by the server.`,
    data: { mime, size: buffer.length, signature: mp4 ? 'ftyp' : 'ebml' },
  })
  save()
  return { render: renderView(production), production: productionDetail(production) }
}

export async function readRenderFile(productionId) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production?.render?.file) return null
  if (production.render.status !== 'uploaded') return null
  const file = join(RENDERS_DIR, production.render.file)
  const buffer = await readFile(file)
  return { buffer, mime: production.render.mime, filename: `${slugify(production.title) || 'production'}.${production.render.mime === 'video/mp4' ? 'mp4' : 'webm'}` }
}

export function artifactFile(productionId, name) {
  const production = state.productions.find((row) => row.id === productionId)
  if (!production?.artifacts) return null
  const artifacts = production.artifacts
  const base = slugify(production.title) || 'production'
  if (name === 'script.txt') {
    const scenes = artifacts.scenes ?? []
    const text = [
      `TITLE: ${artifacts.title ?? production.title}`,
      `HOOK: ${artifacts.hook ?? ''}`,
      `PLATFORM: ${PLATFORMS[production.platform].label} · ${production.durationSec}s · ${LANGUAGES[production.language] ?? production.language}`,
      '',
      ...scenes.map(
        (scene) => `[${Math.floor(scene.startSec / 60)}:${String(Math.round(scene.startSec % 60)).padStart(2, '0')}–${Math.floor(scene.endSec / 60)}:${String(Math.round(scene.endSec % 60)).padStart(2, '0')}] ${scene.label}\nNARRATION: ${scene.narration}\nVISUAL: ${scene.visual}\nSHOT: ${scene.shot}\n`,
      ),
    ].join('\n')
    return { buffer: Buffer.from(text, 'utf8'), mime: 'text/plain; charset=utf-8', filename: `${base}-script.txt` }
  }
  if (name === 'narration.txt') {
    return { buffer: Buffer.from(artifacts.narrationScript ?? '', 'utf8'), mime: 'text/plain; charset=utf-8', filename: `${base}-narration.txt` }
  }
  if (name === 'captions.srt') {
    return { buffer: Buffer.from(artifacts.srt ?? '', 'utf8'), mime: 'application/x-subrip; charset=utf-8', filename: `${base}.srt` }
  }
  if (name === 'metadata.json') {
    const metadata = {
      youtubeTitle: artifacts.youtubeTitle ?? artifacts.title ?? production.title,
      youtubeTags: artifacts.youtubeTags ?? [],
      instagramCaption: artifacts.instagramCaption ?? '',
      hashtags: artifacts.hashtags ?? [],
      description: artifacts.description ?? '',
      platforms: [production.platform],
      publishing: 'Manual only. No platform integration is connected.',
      engine: artifacts.engine ?? 'local-heuristic',
    }
    return { buffer: Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'), mime: 'application/json; charset=utf-8', filename: `${base}-metadata.json` }
  }
  if (name === 'thumbnail.svg' || name === 'cover.svg') {
    const svg = name === 'thumbnail.svg' ? artifacts.thumbnailSvg : artifacts.coverSvg
    if (!svg) return null
    return { buffer: Buffer.from(svg, 'utf8'), mime: 'image/svg+xml; charset=utf-8', filename: `${base}-${name}` }
  }
  return null
}

export function workforceBootLog() {
  return {
    agents: state.agents.length,
    productions: state.productions.length,
    llm: resolveLlm(),
  }
}
