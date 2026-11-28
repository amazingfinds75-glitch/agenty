// Repeatable workforce capability tests against the running server.
// Covers: agent factory lifecycle, memory, sandbox test, improvement approve/rollback,
// pause/resume/cancel controls, parallel execution evidence and persisted counts.
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = `${process.env.STUDIO_BASE ?? 'http://127.0.0.1:8787'}/api/workforce`
const OUT = 'e2e-artifacts'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok || payload?.ok === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${payload?.error ?? ''}`)
  }
  return payload
}

async function waitFor(label, fn, timeoutMs, interval = 700) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await fn()
    if (value) return value
    await sleep(interval)
  }
  throw new Error(`timeout: ${label}`)
}

const results = {}
const assert = (condition, message) => {
  if (!condition) throw new Error(`assertion failed: ${message}`)
}

async function main() {
  const status = await call('GET', '/status')
  results.status = {
    agents: status.counts.agents,
    productions: status.counts.productions,
    improvements: status.counts.improvements,
    tasks: status.counts.tasks,
    workers: status.workers,
    llm: status.engine.llm.configured,
    videoProvider: status.engine.video.configured,
    persistence: status.persistence,
  }
  console.log('status', JSON.stringify(results.status))

  console.log('\n[1] agent factory: create -> configure -> memory -> test -> retire')
  const created = await call('POST', '/agents', {
    name: `E2E Sources Auditor ${Date.now().toString(36)}`,
    role: 'Audits research sources for a production',
    capability: 'trend-research',
    instructions: 'Collect public signals, keep a source ledger, and never invent a claim or a URL.',
    tools: ['signal-search', 'source-ledger'],
    permissions: { canUseModel: false, canWriteArtifacts: true },
  })
  const agentId = created.agent.id
  results.agentFactory = { id: agentId, version: created.agent.version, tools: created.agent.tools }

  const updated = await call('PATCH', `/agents/${agentId}`, {
    instructions: 'Collect public signals, keep a source ledger, never invent a claim or URL, and flag weak matches as unverified.',
  })
  assert(updated.agent.version === created.agent.version + 1, 'patch should create a new version')
  results.agentFactory.versionAfterPatch = updated.agent.version

  const memory = await call('POST', `/agents/${agentId}/memory`, {
    kind: 'correction',
    content: 'Operator correction: a headline that only mentions the topic in passing is not evidence. Mark it weak.',
  })
  results.agentFactory.memoryId = memory.memory.id
  const withMemory = await call('GET', `/agents/${agentId}`)
  assert(withMemory.agent.memory.some((m) => m.id === memory.memory.id), 'memory should be retrievable')

  const test = await call('POST', `/agents/${agentId}/test`, {
    input: 'Why small model teams beat solo creator workflows',
  })
  assert(test.test.checks.length > 0, 'sandbox test should return checks')
  assert(test.test.score >= 0 && test.test.score <= 1, 'sandbox test score should be a ratio')
  results.agentFactory.test = { score: test.test.score, checks: test.test.checks.length, engine: test.test.engine }

  const retired = await call('POST', `/agents/${agentId}/retire`, {})
  assert(retired.agent.status === 'retired', 'agent should retire')
  const agentsAfter = await call('GET', '/agents')
  const listed = agentsAfter.agents.find((a) => a.id === agentId)
  assert(listed?.status === 'retired', 'retired agent should stay listed with status')
  results.agentFactory.retired = listed.status

  console.log('\n[2] improvement cycle: approve -> rollback')
  const improvements = await call('GET', '/improvements')
  const candidate = improvements.improvements.find((row) => row.status === 'proposed' && row.test?.passed)
  assert(candidate, 'need a proposed improvement with a passing test')
  const beforeAgent = await call('GET', `/agents/${candidate.agentId}`)
  const approved = await call('POST', `/improvements/${candidate.id}/approve`, { approver: 'e2e-runner' })
  assert(approved.improvement.status === 'approved', 'improvement should be approved')
  assert(approved.agent.version === beforeAgent.agent.version + 1, 'approval should add a version')
  const rolled = await call('POST', `/improvements/${candidate.id}/rollback`, { approver: 'e2e-runner' })
  assert(rolled.improvement.status === 'rolled_back', 'improvement should roll back')
  const finalAgent = rolled.agent
  const active = finalAgent.versions.find((v) => v.version === finalAgent.version)
  assert(active?.createdBy === 'rollback', 'rollback version should be active')
  results.improvement = {
    id: candidate.id,
    agent: candidate.agentName,
    test: candidate.test,
    fromVersion: beforeAgent.agent.version,
    approvedVersion: approved.agent.version,
    rolledBackVersion: finalAgent.version,
    status: rolled.improvement.status,
    activeCreatedBy: active.createdBy,
  }
  console.log('improvement', JSON.stringify(results.improvement))

  console.log('\n[3] production controls: pause -> resume -> cancel')
  const control = await call('POST', '/productions', {
    topic: 'E2E control check: a 45 second YouTube Short about battery recycling',
    platform: 'youtube-short',
    language: 'en',
    durationSec: 45,
  })
  const id = control.production.id
  await call('POST', `/productions/${id}/pause`, {})
  const paused = await waitFor('paused', async () => {
    const detail = (await call('GET', `/productions/${id}`)).production
    return detail.status === 'paused' ? detail : null
  }, 15000)
  assert(paused.status === 'paused', 'should pause')
  await sleep(1200)
  await call('POST', `/productions/${id}/resume`, {})
  const resumed = await waitFor('resumed', async () => {
    const detail = (await call('GET', `/productions/${id}`)).production
    return detail.status === 'running' ? detail : null
  }, 15000)
  assert(resumed.status === 'running', 'should resume')
  await call('POST', `/productions/${id}/cancel`, {})
  const cancelled = await waitFor('cancelled', async () => {
    const detail = (await call('GET', `/productions/${id}`)).production
    return detail.status === 'cancelled' ? detail : null
  }, 15000)
  results.controls = { id, platform: cancelled.platform, durationSec: cancelled.durationSec, finalStatus: cancelled.status }

  console.log('\n[4] parallel execution evidence from the 30s Reel production')
  const reel = (await call('GET', '/productions/prd_bcde759cf8e54494')).production
  const intervals = reel.tasks.map((t) => ({ title: t.capability, start: Date.parse(t.startedAt), end: Date.parse(t.completedAt) }))
  let maxConcurrent = 0
  let overlappingPair = null
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const a = intervals[i]
      const b = intervals[j]
      if (a.start < b.end && b.start < a.end) {
        const at = Math.max(a.start, b.start)
        const concurrent = intervals.filter((x) => x.start <= at && x.end > at).length
        if (concurrent > maxConcurrent) {
          maxConcurrent = concurrent
          overlappingPair = [a.title, b.title]
        }
      }
    }
  }
  results.parallel = { maxConcurrent, overlappingPair, tasks: reel.tasks.length }
  assert(maxConcurrent >= 2, 'two tasks should overlap')

  console.log('\n[5] persisted event stream and memory totals')
  const events = await call('GET', `/events?productionId=prd_bcde759cf8e54494&limit=300`)
  const all = await call('GET', '/agents')
  const memoryTotal = all.agents.reduce((sum, a) => sum + (a.memoryCount ?? 0), 0)
  results.events = { count: events.events.length, lastSeq: events.seq, types: [...new Set(events.events.map((e) => e.type))].length }
  results.memoryTotal = memoryTotal
  assert(events.events.length > 50, 'event stream should record real activity')

  console.log('\n[6] manager-driven factory: retire a specialist, request a brief, factory refills the role')
  const roster = (await call('GET', '/agents')).agents
  const thumbnails = roster.filter((a) => a.capability === 'thumbnail' && a.status === 'active')
  assert(thumbnails.length > 0, 'need an active thumbnail specialist to retire')
  // The roster may legitimately contain several specialists for one capability.
  // Retire the whole active role so the next plan genuinely has a missing capability.
  for (const thumb of thumbnails) {
    await call('POST', `/agents/${thumb.id}/retire`, {})
  }
  const retiredThumbnailIds = new Set(thumbnails.map((agent) => agent.id))
  const refill = await call('POST', '/productions', {
    topic: 'Factory refill check: a 30 second Reel about how 3D printing changed small-batch manufacturing',
    platform: 'instagram-reel',
    language: 'en',
    durationSec: 30,
  })
  const refillId = refill.production.id
  const planned = await waitFor('manager plan with created specialist', async () => {
    const detail = (await call('GET', `/productions/${refillId}`)).production
    return detail.plan?.capabilities?.length ? detail : null
  }, 20000, 400)
  const rosterAfter = await call('GET', '/agents')
  const createdCapabilities = (planned.plan.createdAgents ?? []).map((agentId) => {
    const agent = rosterAfter.agents.find((row) => row.id === agentId)
    return agent?.capability ?? agentId
  })
  assert(createdCapabilities.includes('thumbnail'), 'factory should create a replacement thumbnail specialist')
  const newThumb = (await call('GET', '/agents')).agents.find(
    (a) => a.capability === 'thumbnail' && a.status === 'active' && !retiredThumbnailIds.has(a.id),
  )
  assert(newThumb, 'replacement thumbnail agent should be active and distinct')
  results.factoryRefill = {
    productionId: refillId,
    retiredAgents: thumbnails.map((agent) => ({ id: agent.id, name: agent.name })),
    createdAgents: createdCapabilities,
    replacement: { id: newThumb.id, name: newThumb.name, version: newThumb.version, createdBy: newThumb.createdBy },
    planNotes: planned.plan.notes,
  }
  try {
    await call('POST', `/productions/${refillId}/cancel`, {})
  } catch {
    /* it may already have completed; either way the factory assertion above is the point */
  }
  console.log('factory refill', JSON.stringify(results.factoryRefill))

  writeFileSync(`${OUT}/workforce-tests.json`, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2))
  console.log('\nALL WORKFORCE TESTS PASSED')
  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error('WORKFORCE TESTS FAILED:', error.message)
  writeFileSync(`${OUT}/workforce-tests.json`, JSON.stringify({ ranAt: new Date().toISOString(), error: error.message, results }, null, 2))
  process.exit(1)
})
