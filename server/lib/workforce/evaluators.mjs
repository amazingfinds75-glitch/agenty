// Measured quality only: every score below is computed from checks that were
// actually produced by a task run. No constants are used as performance values.

export function qualityFromChecks(checks) {
  const rows = Array.isArray(checks) ? checks.filter((row) => row && row.status) : []
  if (!rows.length) return 0.5
  let score = 0
  for (const row of rows) {
    if (row.status === 'pass') score += 1
    else if (row.status === 'warn') score += 0.5
    else score += 0
  }
  return Math.round((score / rows.length) * 100) / 100
}

export function summarizeChecks(checks) {
  const rows = Array.isArray(checks) ? checks : []
  return {
    pass: rows.filter((row) => row.status === 'pass').length,
    warn: rows.filter((row) => row.status === 'warn').length,
    fail: rows.filter((row) => row.status === 'fail').length,
    total: rows.length,
  }
}

export function evaluateProduction({ tasks, feedback }) {
  const completed = tasks.filter((task) => task.status === 'completed')
  const checks = []
  const taskScores = completed
    .filter((task) => task.quality && typeof task.quality.score === 'number')
    .map((task) => ({ taskId: task.id, capability: task.capability, agentId: task.agentId, score: task.quality.score }))
  const retries = tasks.reduce((sum, task) => sum + Math.max(0, (task.attempts ?? 1) - 1), 0)
  const failed = tasks.filter((task) => task.status === 'failed').length
  const qcTask = tasks.find((task) => task.capability === 'quality-control')
  const qcChecks = qcTask?.quality?.checks ?? []
  const qcFails = qcChecks.filter((row) => row.status === 'fail').length
  const qcWarns = qcChecks.filter((row) => row.status === 'warn').length

  checks.push({
    id: 'completion',
    label: 'Task completion',
    status: failed === 0 ? 'pass' : 'fail',
    detail: `${completed.length}/${tasks.length} tasks completed, ${failed} failed.`,
  })
  checks.push({
    id: 'retries',
    label: 'Retry pressure',
    status: retries === 0 ? 'pass' : retries <= 2 ? 'warn' : 'fail',
    detail: `${retries} retr${retries === 1 ? 'y' : 'ies'} across the production.`,
  })
  checks.push({
    id: 'qc',
    label: 'QC gate',
    status: qcFails === 0 ? (qcWarns > 3 ? 'warn' : 'pass') : 'fail',
    detail: `${qcFails} failures and ${qcWarns} warnings in the QC report.`,
  })
  const avgTask = taskScores.length ? taskScores.reduce((sum, row) => sum + row.score, 0) / taskScores.length : null
  checks.push({
    id: 'task-quality',
    label: 'Average task quality',
    status: avgTask == null ? 'warn' : avgTask >= 0.8 ? 'pass' : avgTask >= 0.6 ? 'warn' : 'fail',
    detail: avgTask == null ? 'No task scores recorded.' : `${Math.round(avgTask * 100)}% average across ${taskScores.length} tasks.`,
  })

  let satisfaction = null
  if (Array.isArray(feedback) && feedback.length) {
    satisfaction = feedback.reduce((sum, row) => sum + Number(row.rating || 0), 0) / feedback.length
    checks.push({
      id: 'satisfaction',
      label: 'User feedback',
      status: satisfaction >= 4 ? 'pass' : satisfaction >= 3 ? 'warn' : 'fail',
      detail: `${feedback.length} rating${feedback.length === 1 ? '' : 's'}, average ${satisfaction.toFixed(2)}/5.`,
    })
  } else {
    checks.push({ id: 'satisfaction', label: 'User feedback', status: 'warn', detail: 'No rating submitted yet.' })
  }

  const score = qualityFromChecks(checks)
  return {
    score,
    checks,
    agentScores: taskScores,
    stats: {
      tasks: tasks.length,
      completed: completed.length,
      failed,
      retries,
      avgTaskQuality: avgTask,
      satisfaction,
    },
  }
}

export function emptyPerformance() {
  return {
    tasks: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    qualitySum: 0,
    qualityCount: 0,
    durationSum: 0,
    durationCount: 0,
    satisfactionSum: 0,
    satisfactionCount: 0,
    lastRunAt: null,
  }
}

export function performanceView(perf) {
  const value = perf ?? emptyPerformance()
  return {
    tasks: value.tasks ?? 0,
    completed: value.completed ?? 0,
    failed: value.failed ?? 0,
    retries: value.retries ?? 0,
    avgQuality: value.qualityCount ? Math.round((value.qualitySum / value.qualityCount) * 100) / 100 : null,
    completionRate: value.tasks ? Math.round((value.completed / value.tasks) * 100) / 100 : null,
    avgDurationMs: value.durationCount ? Math.round(value.durationSum / value.durationCount) : null,
    satisfaction: value.satisfactionCount ? Math.round((value.satisfactionSum / value.satisfactionCount) * 100) / 100 : null,
    lastRunAt: value.lastRunAt ?? null,
  }
}

export function recordPerformance(agent, { status, quality, durationMs, retries = 0 }) {
  if (!agent.performance) agent.performance = emptyPerformance()
  const perf = agent.performance
  perf.tasks += 1
  if (status === 'completed') perf.completed += 1
  if (status === 'failed') perf.failed += 1
  perf.retries += retries
  if (typeof quality === 'number') {
    perf.qualitySum += quality
    perf.qualityCount += 1
  }
  if (typeof durationMs === 'number' && durationMs >= 0) {
    perf.durationSum += durationMs
    perf.durationCount += 1
  }
  perf.lastRunAt = new Date().toISOString()
}

export function recordSatisfaction(agent, rating) {
  if (!agent.performance) agent.performance = emptyPerformance()
  const value = Number(rating)
  if (!Number.isFinite(value)) return
  agent.performance.satisfactionSum += value
  agent.performance.satisfactionCount += 1
}
