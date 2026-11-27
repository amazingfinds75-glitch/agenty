// End-to-end acceptance test: chat brief -> live workforce production -> browser-rendered MP4.
// Run with the app server on http://127.0.0.1:8787 and dist/ freshly built.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:8787'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const TOPIC = 'Create a 30-second Instagram Reel about why AI agent teams are replacing solo creator workflows'
const OUT = 'e2e-artifacts'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path) {
  const res = await fetch(`${BASE}/api/workforce${path}`)
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`)
  return res.json()
}

async function waitFor(label, fn, timeoutMs, interval = 1000) {
  const start = Date.now()
  let lastError = null
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  throw new Error(`timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

const profile = mkdtempSync(join(tmpdir(), 'wf-e2e-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,1100',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function waitDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return res.json()
    } catch {}
    await sleep(250)
  }
  throw new Error('devtools not ready')
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const logs = []
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(new Error(data.error.message))
      else resolve(data.result)
    } else if (data.method === 'Runtime.consoleAPICalled') {
      logs.push(data.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    } else if (data.method === 'Runtime.exceptionThrown') {
      logs.push(`EXCEPTION ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`)
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  return {
    ws,
    logs,
    async send(method, params = {}) {
      await ready
      const callId = ++id
      const promise = new Promise((resolve, reject) => pending.set(callId, { resolve, reject }))
      ws.send(JSON.stringify({ id: callId, method, params }))
      return promise
    },
  }
}

async function main() {
  await waitDevtools()
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })

  const evalJs = async (expression, awaitPromise = false) => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, awaitPromise })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    return result.result.value
  }
  const shot = async (name) => {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
    console.log(`screenshot -> ${OUT}/${name}`)
  }

  console.log('STEP 1: open chat workspace')
  await client.send('Page.navigate', { url: `${BASE}/#/` })
  await sleep(1800)
  await shot('01-chat.png')

  const before = await api('/productions')
  const beforeIds = new Set(before.productions.map((p) => p.id))
  console.log(`existing productions: ${before.productions.length}`)

  console.log('STEP 2: fill composer and submit the 30s Reel brief')
  const typed = await evalJs(`(() => {
    const area = document.getElementById('prompt-input')
    if (!area) return { ok: false, why: 'no textarea' }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, ${JSON.stringify(TOPIC)})
    area.dispatchEvent(new Event('input', { bubbles: true }))
    const select = document.querySelector('select[aria-label="Platform"]')
    if (select) {
      const selSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      selSetter.call(select, 'instagram-reel')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return { ok: true, text: area.value, platform: select ? select.value : null }
  })()`)
  console.log('composer state:', typed)
  if (!typed?.ok) throw new Error('composer not ready')

  const clicked = await evalJs(`(() => {
    const buttons = [...document.querySelectorAll('button[type="submit"]')]
    const button = buttons.find((b) => /Generate/i.test(b.textContent || ''))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error('Generate button not found')
  console.log('submitted brief')

  console.log('STEP 3: wait for the live workforce production to appear')
  const production = await waitFor(
    'new workforce production',
    async () => {
      const list = await api('/productions')
      const fresh = list.productions.find((p) => !beforeIds.has(p.id) && /AI agent teams|solo creator/i.test(p.topic))
      return fresh ?? null
    },
    30000,
  )
  console.log(`production ${production.id} | ${production.platform} | ${production.durationSec}s | ${production.status}`)
  if (production.platform !== 'instagram-reel') throw new Error(`unexpected platform ${production.platform}`)
  if (production.durationSec !== 30) throw new Error(`unexpected duration ${production.durationSec}`)

  console.log('STEP 4: wait for the 13-stage plan to finish writing artifacts')
  const ready = await waitFor(
    'production artifacts',
    async () => {
      const detail = (await api(`/productions/${production.id}`)).production
      const count = Object.keys(detail.artifacts ?? {}).length
      const done = ['awaiting_approval', 'completed', 'approved'].includes(detail.status)
      return done && count > 3 ? detail : null
    },
    90000,
    1500,
  )
  console.log(
    `status=${ready.status} tasks=${ready.tasks.length} artifacts=${Object.keys(ready.artifacts).length} quality=${
      ready.evaluation?.score ?? 'n/a'
    }`,
  )

  console.log('STEP 5: open the production in the workforce dashboard')
  await client.send('Page.navigate', { url: `${BASE}/#/workforce?p=${production.id}` })
  await sleep(1800)
  const pageInfo = await evalJs(`(() => {
    const text = document.body.innerText
    return {
      hasRenderButton: [...document.querySelectorAll('button')].some((b) => /Render \\d+s video|Re-render/i.test(b.textContent || '')),
      hasDownload: /Download/.test(text),
      hasSpecialists: /Specialists/i.test(text),
      snippet: text.slice(0, 300),
    }
  })()`)
  console.log('dashboard:', pageInfo)
  await shot('02-workforce-production.png')

  console.log('STEP 6: click Render 30s video (browser MediaRecorder)')
  const renderClicked = await evalJs(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => /^\\s*Render \\d+s video/i.test((b.textContent || '').trim()))
    if (!button) return false
    button.scrollIntoView({ block: 'center' })
    button.click()
    return true
  })()`)
  if (!renderClicked) throw new Error('render button not found')
  console.log('rendering in the browser...')

  const rendered = await waitFor(
    'render upload',
    async () => {
      const detail = (await api(`/productions/${production.id}`)).production
      if (detail.render?.status === 'uploaded') return detail
      if (detail.render?.status === 'failed') throw new Error(detail.render.note || 'render failed')
      return null
    },
    150000,
    2000,
  )
  console.log(`render uploaded: ${rendered.render.mime} · ${rendered.render.size} bytes · ${rendered.render.durationSec ?? '?'}s`)
  await sleep(800)
  await shot('03-render-stored.png')

  console.log('STEP 7: download the render through the API and verify the container signature')
  const res = await fetch(`${BASE}/api/workforce/productions/${production.id}/render/file`)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(OUT, `render-${production.id}.mp4`), buffer)
  const head = buffer.subarray(0, 16)
  const isMp4 = buffer.length > 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp'
  const isWebm = buffer.length > 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  console.log(`downloaded ${buffer.length} bytes | mp4=${isMp4} webm=${isWebm} | header=${head.toString('hex')}`)
  if (!isMp4 && !isWebm) throw new Error('downloaded bytes are not a video container')
  if (buffer.length < 100_000) throw new Error('downloaded render is suspiciously small')

  console.log('STEP 8: confirm persistence and real-time event history')
  const finalDetail = (await api(`/productions/${production.id}`)).production
  const events = await api(`/events?productionId=${production.id}&limit=200`)
  const agentIds = new Set(finalDetail.tasks.map((t) => t.agentId))
  console.log(
    `tasks=${finalDetail.tasks.length} agents=${agentIds.size} events=${events.events.length} artifacts=${Object.keys(
      finalDetail.artifacts,
    ).length} quality=${finalDetail.evaluation?.score}`,
  )
  const files = Object.keys(finalDetail.artifacts)
  console.log('artifact keys:', files.join(', '))

  const report = {
    topic: TOPIC,
    productionId: production.id,
    platform: production.platform,
    durationSec: production.durationSec,
    status: finalDetail.status,
    tasks: finalDetail.tasks.length,
    distinctAgents: agentIds.size,
    artifacts: files,
    qualityScore: finalDetail.evaluation?.score ?? null,
    events: events.events.length,
    render: {
      mime: finalDetail.render.mime,
      size: buffer.length,
      mp4: isMp4,
      webm: isWebm,
      header: head.toString('hex'),
      durationSec: finalDetail.render.durationSec ?? null,
    },
  }
  writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2))
  console.log('RESULT', JSON.stringify(report, null, 2))
  console.log('console log tail:', client.logs.slice(-12))
  client.ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((error) => {
  console.error('E2E FAILED:', error)
  chrome.kill()
  process.exit(1)
})
