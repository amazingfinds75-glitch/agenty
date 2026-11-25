import { EXECUTIVE_PRODUCER } from './agents'
import { STAGES } from './pipeline'
import type { AgentRuntime, Project } from './types'

export function projectAgentStates(project: Project): Record<string, AgentRuntime> {
  const map: Record<string, AgentRuntime> = {}
  for (const stage of STAGES.slice(0, project.stageIndex + 1)) {
    const state = project.stages.find((s) => s.id === stage.id)
    let status: AgentRuntime['status'] = 'idle'
    if (stage.index < project.stageIndex || state?.status === 'completed') status = 'completed'
    else if (stage.index === project.stageIndex) {
      if (project.status === 'failed' || state?.status === 'failed') status = 'failed'
      else if (project.status === 'paused') status = 'waiting'
      else if (project.status === 'cancelled') status = 'idle'
      else if (project.status === 'completed') status = 'completed'
      else status = 'working'
    }
    for (const agentId of stage.agentIds) {
      map[agentId] = {
        agentId,
        status,
        task: stage.name,
        projectId: project.id,
        projectTitle: project.title,
        progress: stage.index === project.stageIndex ? project.stageProgress : status === 'completed' ? 1 : 0,
      }
    }
  }
  if (project.status === 'running' || project.status === 'paused') {
    for (const stage of STAGES.slice(project.stageIndex + 1)) {
      for (const agentId of stage.agentIds) {
        if (!map[agentId]) {
          map[agentId] = {
            agentId,
            status: 'queued',
            task: stage.name,
            projectId: project.id,
            projectTitle: project.title,
            progress: 0,
          }
        }
      }
    }
  }
  map[EXECUTIVE_PRODUCER.id] = {
    agentId: EXECUTIVE_PRODUCER.id,
    status:
      project.status === 'completed'
        ? 'completed'
        : project.status === 'failed'
          ? 'failed'
          : project.status === 'paused'
            ? 'waiting'
            : project.status === 'cancelled'
              ? 'idle'
              : 'working',
    task:
      project.status === 'completed'
        ? 'Deliverables signed off'
        : `Coordinating ${STAGES[project.stageIndex]?.short ?? 'production'}`,
    projectId: project.id,
    projectTitle: project.title,
    progress: project.status === 'completed' ? 1 : project.stageProgress,
  }
  return map
}

export function globalAgentStates(projects: Project[]): Record<string, AgentRuntime> {
  const sorted = [...projects].sort((a, b) => {
    const rank = (s: string) => (s === 'running' ? 0 : s === 'failed' ? 1 : s === 'paused' ? 2 : 3)
    const byRank = rank(a.status) - rank(b.status)
    if (byRank !== 0) return byRank
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  const result: Record<string, AgentRuntime> = {}
  for (const project of sorted) {
    const states = projectAgentStates(project)
    for (const [agentId, runtime] of Object.entries(states)) {
      if (!result[agentId]) result[agentId] = runtime
    }
  }
  return result
}

export function projectForAgent(runtime: AgentRuntime | undefined, projects: Project[]) {
  if (!runtime?.projectId) return undefined
  return projects.find((p) => p.id === runtime.projectId)
}
