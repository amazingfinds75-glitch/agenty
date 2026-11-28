// Runtime registry for the website. It answers one question honestly:
// which agents can this server actually execute, and which cannot be reached
// from a website at all.
//
//   local-runtime  specialists executed by server/lib/workforce/engine.mjs
//   qoder-cloud    Qoder Cloud Agents (only when QODER_ACCESS_TOKEN is set)
//   qoder-ide      agents that exist inside the Qoder Desktop IDE process;
//                  they have no public HTTP API and are listed as not callable

import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { truncate } from '../util.mjs'
import { listAgentSummaries, statusView } from '../workforce/engine.mjs'
import {
  cancelRemoteSession,
  createRemoteSession,
  getRemoteSession,
  listQoderAgents,
  listQoderEnvironments,
  listRemoteEvents,
  openRemoteEventStream,
  qoderPublicConfig,
  qoderStatus,
  sendUserMessage,
} from '../qoder/client.mjs'
import { getQoderSession, listQoderSessions, newSessionId, saveQoderSession } from '../qoder/sessions.mjs'

function runtimeError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

/* ---------------------------- desktop discovery ---------------------------- */

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!item) continue
    const value = item[2].trim().replace(/^["']|["']$/g, '')
    if (value && !/^[|>][+-]?$/.test(value)) fields[item[1]] = value
  }
  return fields
}

export async function discoverDesktopAgents() {
  const roots = [
    { dir: join(homedir(), '.qoder', 'agents'), label: '~/.qoder/agents' },
    { dir: join(process.cwd(), '.qoder', 'agents'), label: '.qoder/agents' },
  ]
  const seen = new Set()
  const agents = []
  for (const root of roots) {
    let entries = []
    try {
      entries = await readdir(root.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const id = entry.name.replace(/\.md$/i, '')
      if (seen.has(id)) continue
      let raw = ''
      try {
        raw = await readFile(join(root.dir, entry.name), 'utf8')
      } catch {
        continue
      }
      const meta = parseFrontMatter(raw)
      seen.add(id)
      agents.push({
        id,
        name: meta.name || id,
        description: truncate(meta.description || 'Qoder IDE agent profile. No description in front matter.', 240),
        model: meta.model || null,
        permissionMode: meta.permissionMode || null,
        runtime: 'qoder-ide',
        runtimeLabel: 'Qoder Desktop · IDE-local',
        source: `${root.label}/${entry.name}`,
        externallyCallable: false,
        callable: false,
        execution: 'ide-host',
        reason:
          'This profile is hosted by the Qoder Desktop process and exposed only to Desktop host tools. It has no public HTTP/SSE endpoint, so a deployed website cannot call it. Equivalent capabilities run through the local runtime or, when configured, Qoder Cloud.',
      })
      if (agents.length >= 100) return agents
    }
  }
  return agents
}

/* -------------------------------- status ---------------------------------- */

export async function runtimeStatus({ probe = false } = {}) {
  const [cloud, desktop] = await Promise.all([qoderStatus({ force: probe }), discoverDesktopAgents()])
  const local = statusView()
  const cloudStatus = !cloud.configured
    ? 'not_configured'
    : cloud.reachable === false
      ? 'error'
      : cloud.authorized === false
        ? 'unauthorized'
        : 'connected'
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimes: [
      {
        id: 'local-runtime',
        name: 'AI Viral Studio runtime',
        kind: 'local-runtime',
        status: 'connected',
        externallyCallable: true,
        execution: 'server-worker',
        detail: `${local.counts.agents.active} active specialists execute real tasks in this Node server. ${local.counts.tasks.running} task(s) running, ${local.counts.tasks.pending} queued.`,
        agents: local.counts.agents.active,
        activeTasks: local.counts.tasks.running,
      },
      {
        id: 'qoder-cloud',
        name: 'Qoder Cloud Agents',
        kind: 'qoder-cloud',
        status: cloudStatus,
        externallyCallable: true,
        execution: 'qoder-cloud-session',
        detail: cloud.detail,
        agents: cloudStatus === 'connected' ? cloud.agentCountVisible ?? 0 : null,
        activeTasks: null,
        apiBaseHost: cloud.apiBaseHost,
        configured: cloud.configured,
      },
      {
        id: 'qoder-desktop',
        name: 'Qoder Desktop local agents',
        kind: 'qoder-ide',
        status: desktop.length ? 'detected_not_callable' : 'not_detected',
        externallyCallable: false,
        execution: 'ide-host',
        detail: desktop.length
          ? `${desktop.length} IDE agent profile(s) found in the local Qoder directory. They run inside Qoder Desktop and cannot be called from a website; they are listed for visibility only.`
          : 'No local Qoder Desktop agent profiles were found on this machine.',
        agents: desktop.length,
        activeTasks: null,
      },
    ],
    qoderCloud: {
      configured: cloud.configured,
      status: cloudStatus,
      reachable: cloud.reachable,
      authorized: cloud.authorized,
      latencyMs: cloud.latencyMs,
      checkedAt: cloud.checkedAt,
      detail: cloud.detail,
      tokenEnv: cloud.tokenEnv,
      apiBaseHost: cloud.apiBaseHost,
      agentConfigured: cloud.agentConfigured,
      environmentConfigured: cloud.environmentConfigured,
      agentId: cloud.agentId,
      environmentId: cloud.environmentId,
    },
    qoderDesktop: {
      callable: false,
      count: desktop.length,
      detail: 'IDE-local agent profiles are not exposed by an HTTP API. Use Qoder Cloud for web-callable Qoder agents.',
    },
    local: {
      activeAgents: local.counts.agents.active,
      totalAgents: local.counts.agents.total,
      tasksRunning: local.counts.tasks.running,
      tasksPending: local.counts.tasks.pending,
      workers: local.workers,
      persistence: local.persistence,
    },
  }
}

export async function listRuntimeAgents() {
  const local = listAgentSummaries().map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.role,
    role: agent.role,
    capability: agent.capability,
    status: agent.status,
    version: agent.version,
    model: null,
    runtime: 'local-runtime',
    runtimeLabel: 'AI Viral Studio runtime',
    externallyCallable: true,
    callable: true,
    execution: 'server-worker',
    tools: agent.tools,
    permissions: agent.permissions,
    performance: agent.performance,
    currentTask: agent.currentTask,
  }))

  const config = qoderPublicConfig()
  let cloud = []
  let cloudError = null
  if (config.configured) {
    try {
      cloud = (await listQoderAgents(50)).map((agent) => ({
        ...agent,
        role: agent.description,
        capability: null,
        runtime: 'qoder-cloud',
        runtimeLabel: 'Qoder Cloud Agents',
        externallyCallable: true,
        callable: true,
        execution: 'qoder-cloud-session',
        tools: [],
        permissions: null,
        performance: null,
        currentTask: null,
      }))
    } catch (error) {
      cloudError = error?.message ?? 'Could not list Qoder Cloud agents.'
    }
  } else {
    cloudError = 'QODER_ACCESS_TOKEN is not set on the server, so no Cloud agents can be discovered.'
  }

  const desktop = (await discoverDesktopAgents()).map((agent) => ({
    ...agent,
    role: agent.description,
    capability: null,
    tools: [],
    permissions: null,
    performance: null,
    currentTask: null,
  }))

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    agents: [...local, ...cloud, ...desktop],
    sources: [
      { id: 'local-runtime', label: 'AI Viral Studio runtime', callable: true, count: local.length, detail: 'Executed by this backend.' },
      {
        id: 'qoder-cloud',
        label: 'Qoder Cloud Agents',
        callable: true,
        count: cloud.length,
        detail: cloudError ?? 'Configured and discovered.',
        error: cloudError,
      },
      {
        id: 'qoder-desktop',
        label: 'Qoder Desktop local',
        callable: false,
        count: desktop.length,
        detail: 'IDE-hosted profiles; visible but not callable from the website.',
      },
    ],
  }
}

/* ------------------------------- sessions --------------------------------- */

function publicSession(record) {
  return {
    id: record.id,
    remoteId: record.remoteId,
    title: record.title,
    task: record.task,
    agentId: record.agentId,
    environmentId: record.environmentId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastError: record.lastError ?? null,
    usage: record.usage ?? null,
  }
}

export async function getRuntimeSession(localId) {
  const record = await getQoderSession(localId)
  return record ? publicSession(record) : null
}

export async function createQoderRuntimeSession(body) {
  const config = qoderPublicConfig()
  if (!config.configured) {
    throw runtimeError('Qoder Cloud is not configured. Set QODER_ACCESS_TOKEN on the server and restart the backend.', 503)
  }
  const task = truncate(String(body?.task ?? '').trim(), 8000)
  if (task.length < 3) throw runtimeError('A task message of at least 3 characters is required.')
  const agentId = truncate(String(body?.agentId ?? config.agentId ?? '').trim(), 120)
  const environmentId = truncate(String(body?.environmentId ?? config.environmentId ?? '').trim(), 120)
  if (!agentId) throw runtimeError('An agent id is required. Set QODER_AGENT_ID on the server or pass agentId.', 400)
  if (!environmentId) {
    throw runtimeError('An environment id (env_…) is required. Set QODER_ENVIRONMENT_ID on the server or pass environmentId.', 400)
  }

  const remote = await createRemoteSession({ agentId, environmentId, title: truncate(task, 120) })
  const now = new Date().toISOString()
  const record = {
    id: newSessionId(),
    remoteId: remote.id,
    title: truncate(task, 120),
    task,
    agentId,
    environmentId,
    status: remote.status ?? 'idle',
    createdAt: now,
    updatedAt: now,
    lastError: null,
    usage: remote.usage ?? null,
  }
  await saveQoderSession(record)
  try {
    await sendUserMessage(remote.id, task)
    record.status = 'running'
    record.updatedAt = new Date().toISOString()
    await saveQoderSession(record)
  } catch (error) {
    record.status = 'message_failed'
    record.lastError = error?.message ?? 'The session was created but the task message failed.'
    record.updatedAt = new Date().toISOString()
    await saveQoderSession(record)
    throw runtimeError(`Session ${remote.id} was created, but sending the task failed: ${record.lastError}`, error?.status ?? 502)
  }
  return publicSession(record)
}

export async function listQoderRuntimeSessions() {
  return (await listQoderSessions()).map(publicSession)
}

export async function refreshQoderRuntimeSession(localId) {
  const record = await getQoderSession(localId)
  if (!record) return null
  if (!qoderPublicConfig().configured || !record.remoteId) return publicSession(record)
  try {
    const remote = await getRemoteSession(record.remoteId)
    record.status = remote.status
    record.usage = remote.usage ?? record.usage
    record.lastError = null
    record.updatedAt = new Date().toISOString()
    await saveQoderSession(record)
  } catch (error) {
    record.lastError = error?.message ?? 'Status refresh failed.'
    record.updatedAt = new Date().toISOString()
    await saveQoderSession(record)
  }
  return publicSession(record)
}

export async function cancelQoderRuntimeSession(localId) {
  const record = await getQoderSession(localId)
  if (!record) return null
  if (!record.remoteId) throw runtimeError('This session has no Qoder Cloud id.', 400)
  await cancelRemoteSession(record.remoteId)
  record.status = 'cancelled'
  record.updatedAt = new Date().toISOString()
  await saveQoderSession(record)
  return publicSession(record)
}

export async function qoderRuntimeSessionEvents(localId, limit = 100) {
  const record = await getQoderSession(localId)
  if (!record) return null
  return listRemoteEvents(record.remoteId, limit)
}

export async function qoderRuntimeSessionStream(localId, options = {}) {
  const record = await getQoderSession(localId)
  if (!record) return null
  return openRemoteEventStream(record.remoteId, options)
}

export async function qoderDiscovery() {
  const config = qoderPublicConfig()
  if (!config.configured) {
    return { configured: false, agents: [], environments: [], detail: 'Set QODER_ACCESS_TOKEN on the server.', ...config }
  }
  const [agents, environments] = await Promise.all([listQoderAgents(50), listQoderEnvironments(50)])
  return { configured: true, agents, environments, ...config }
}
