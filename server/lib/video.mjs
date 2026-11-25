import { fetchWithTimeout, hashKey, truncate } from './util.mjs'
import { markStoreDirty, readStore } from './store.mjs'

const NOTE =
  'External video adapters are scaffolding until a key is configured and a real job is run. The verified renderer remains the browser canvas renderer.'

export function getVideoStatus() {
  const forced = (process.env.VIDEO_PROVIDER || '').trim().toLowerCase()
  if (!forced) {
    return {
      configured: false,
      provider: null,
      model: null,
      detail: 'No external video provider configured. The in-browser canvas renderer remains the verified path.',
      note: NOTE,
    }
  }
  if (forced === 'luma') {
    const key = process.env.LUMA_API_KEY?.trim()
    const model = process.env.LUMA_MODEL?.trim() || 'ray-2'
    if (!key) {
      return { configured: false, provider: null, model: null, detail: 'VIDEO_PROVIDER=luma is set but LUMA_API_KEY is missing.', note: NOTE }
    }
    return { configured: true, provider: 'luma', model, detail: 'Luma adapter detected. Unverified until a real job completes.', note: NOTE }
  }
  if (forced === 'replicate') {
    const token = process.env.REPLICATE_API_TOKEN?.trim()
    const version = process.env.REPLICATE_VIDEO_VERSION?.trim()
    if (!token || !version) {
      return {
        configured: false,
        provider: null,
        model: null,
        detail: 'VIDEO_PROVIDER=replicate needs REPLICATE_API_TOKEN and REPLICATE_VIDEO_VERSION.',
        note: NOTE,
      }
    }
    return {
      configured: true,
      provider: 'replicate',
      model: `version ${version.slice(0, 8)}…`,
      detail: 'Replicate adapter detected. Input fields depend on the model version and are unverified.',
      note: NOTE,
    }
  }
  return { configured: false, provider: null, model: null, detail: `Unknown VIDEO_PROVIDER "${forced}". Use luma or replicate.`, note: NOTE }
}

async function getJobsStore() {
  const store = await readStore('jobs.json', { jobs: [] })
  if (!Array.isArray(store.jobs)) store.jobs = []
  return store
}

async function persist(store) {
  while (store.jobs.length > 40) store.jobs.pop()
  markStoreDirty('jobs.json')
}

export async function listVideoJobs() {
  const store = await getJobsStore()
  return store.jobs.map((job) => ({
    id: job.id,
    provider: job.provider,
    model: job.model,
    status: job.status,
    aspectRatio: job.aspectRatio,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    videoUrl: job.videoUrl ?? null,
    error: job.error ?? null,
  }))
}

async function submitLuma(prompt, aspectRatio) {
  const key = process.env.LUMA_API_KEY?.trim() ?? ''
  const model = process.env.LUMA_MODEL?.trim() || 'ray-2'
  const response = await fetchWithTimeout(
    'https://api.lumalabs.ai/dream-machine/v1/generations',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, model, aspect_ratio: aspectRatio, loop: false }),
    },
    30_000,
  )
  const data = await response.json()
  if (!data?.id) throw new Error('Luma did not return a generation id')
  return { providerJobId: data.id, state: data.state ?? 'queued' }
}

function lumaState(state) {
  if (state === 'completed') return 'succeeded'
  if (state === 'failed') return 'failed'
  return 'running'
}

async function pollLuma(job) {
  const key = process.env.LUMA_API_KEY?.trim() ?? ''
  const response = await fetchWithTimeout(
    `https://api.lumalabs.ai/dream-machine/v1/generations/${encodeURIComponent(job.providerJobId)}`,
    { headers: { authorization: `Bearer ${key}` } },
    20_000,
  )
  const data = await response.json()
  return {
    status: lumaState(data.state),
    videoUrl: data.assets?.video ?? null,
    error: data.failure_reason ? truncate(data.failure_reason, 220) : null,
  }
}

async function submitReplicate(prompt, aspectRatio) {
  const token = process.env.REPLICATE_API_TOKEN?.trim() ?? ''
  const version = process.env.REPLICATE_VIDEO_VERSION?.trim() ?? ''
  const response = await fetchWithTimeout(
    'https://api.replicate.com/v1/predictions',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ version, input: { prompt, aspect_ratio: aspectRatio } }),
    },
    30_000,
  )
  const data = await response.json()
  if (!data?.id) throw new Error('Replicate did not return a prediction id')
  return { providerJobId: data.id, state: data.status ?? 'starting' }
}

function replicateState(state) {
  if (state === 'succeeded') return 'succeeded'
  if (state === 'failed' || state === 'canceled') return 'failed'
  if (state === 'starting') return 'queued'
  return 'running'
}

function replicateOutput(output) {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const last = [...output].reverse().find((item) => typeof item === 'string')
    return last ?? null
  }
  if (output && typeof output === 'object' && typeof output.url === 'string') return output.url
  return null
}

async function pollReplicate(job) {
  const token = process.env.REPLICATE_API_TOKEN?.trim() ?? ''
  const response = await fetchWithTimeout(
    `https://api.replicate.com/v1/predictions/${encodeURIComponent(job.providerJobId)}`,
    { headers: { authorization: `Bearer ${token}` } },
    20_000,
  )
  const data = await response.json()
  return {
    status: replicateState(data.status),
    videoUrl: replicateOutput(data.output),
    error: data.error ? truncate(data.error, 220) : null,
  }
}

const ASPECTS = new Set(['9:16', '16:9', '1:1', '4:5', '3:4'])

export async function createVideoJob({ prompt, aspectRatio = '9:16' }) {
  const status = getVideoStatus()
  if (!status.configured) {
    const error = new Error(status.detail)
    error.statusCode = 503
    error.payload = { configured: false, ...status }
    throw error
  }
  const cleanPrompt = truncate(String(prompt ?? '').trim(), 800)
  if (cleanPrompt.length < 8) {
    const error = new Error('Prompt must be at least 8 characters.')
    error.statusCode = 400
    throw error
  }
  const aspect = ASPECTS.has(aspectRatio) ? aspectRatio : '9:16'
  const submitted =
    status.provider === 'luma' ? await submitLuma(cleanPrompt, aspect) : await submitReplicate(cleanPrompt, aspect)
  const store = await getJobsStore()
  const now = new Date().toISOString()
  const job = {
    id: `vid_${hashKey(`${status.provider}:${submitted.providerJobId}:${now}`)}`,
    provider: status.provider,
    model: status.model,
    providerJobId: submitted.providerJobId,
    prompt: cleanPrompt,
    aspectRatio: aspect,
    status: submitted.state === 'queued' || submitted.state === 'starting' ? 'queued' : 'running',
    createdAt: now,
    updatedAt: now,
    videoUrl: null,
    error: null,
  }
  store.jobs.unshift(job)
  await persist(store)
  return { ...job, providerJobId: undefined }
}

export async function getVideoJob(id) {
  const store = await getJobsStore()
  const job = store.jobs.find((item) => item.id === id)
  if (!job) return null
  if (job.status === 'succeeded' || job.status === 'failed') return { ...job, providerJobId: undefined }
  try {
    const result = job.provider === 'luma' ? await pollLuma(job) : await pollReplicate(job)
    job.status = result.status
    job.videoUrl = result.videoUrl
    job.error = result.error
    job.updatedAt = new Date().toISOString()
    await persist(store)
  } catch (error) {
    job.error = truncate(`Poll failed: ${error?.message ?? error}`, 220)
    job.updatedAt = new Date().toISOString()
    await persist(store)
  }
  return { ...job, providerJobId: undefined }
}
