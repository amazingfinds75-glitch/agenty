// Browser verification for the runtime registry, live SSE label and refresh recovery.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.STUDIO_BASE ?? 'http://127.0.0.1:8788'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9336
const PRODUCTION = process.env.WORKFORCE_PRODUCTION ?? 'prd_883b4d197cfc4b02'
const profile = mkdtempSync(join(tmpdir(), 'wf-check-'))
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,1100', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) return } catch {}
    await sleep(250)
  }
  throw new Error('devtools not ready')
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(new Error(data.error.message)); else resolve(data.result)
    } else if (data.method) events.push(data)
  })
  const ready = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  return { ws, events, async send(method, params = {}) { await ready; const callId = ++id; const p = new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); ws.send(JSON.stringify({ id: callId, method, params })); return p } }
}

async function main() {
  await waitDevtools()
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable'); await client.send('Log.enable'); await client.send('Page.enable')
  const evalJs = async (expression) => {
    const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    return result.result.value
  }
  await client.send('Page.navigate', { url: `${BASE}/#/workforce?p=${PRODUCTION}` })
  let body = ''
  for (let i = 0; i < 60; i += 1) {
    body = await evalJs('document.body ? document.body.innerText : ""')
    if (body.includes('Agent Workforce')) break
    await sleep(300)
  }
  if (!body.includes('Agent Workforce')) throw new Error(`workforce heading missing at ${await evalJs('location.href')}: ${body.slice(0, 400)}`)
  const streamLive = body.includes('live SSE') || body.includes('3s polling fallback')
  if (!streamLive) throw new Error('live event stream label missing')

  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Runtimes')); if (!b) throw new Error('Runtimes tab not found'); b.click(); return true })()`)
  await sleep(1800)
  const runtimeText = await evalJs('document.body.innerText')
  const checks = {
    runtimeTab: runtimeText.includes('Qoder Cloud') && runtimeText.includes('Qoder Desktop'),
    cloudUnconfigured: /not configured|Set QODER_ACCESS_TOKEN/i.test(runtimeText),
    ideNotCallable: /not callable|cannot.*call|not available.*website/i.test(runtimeText),
    productionRecovered: body.includes(PRODUCTION),
  }
  if (!checks.runtimeTab) throw new Error('runtime cards missing')
  if (!checks.cloudUnconfigured) throw new Error('Qoder Cloud unconfigured state missing')
  if (!checks.ideNotCallable) throw new Error('IDE-local callability reason missing')

  await client.send('Page.captureScreenshot', { format: 'png' }).then((shot) =>
    writeFileSync('e2e-artifacts/04-runtimes.png', Buffer.from(shot.data, 'base64')))

  await client.send('Page.reload', { ignoreCache: true })
  await sleep(2600)
  const reloaded = await evalJs('document.body.innerText')
  const recovered = reloaded.includes(PRODUCTION) && reloaded.includes('events')
  if (!recovered) throw new Error('production/event history did not recover after reload')

  const errors = client.events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map((e) => e.params?.exceptionDetails?.exception?.description ?? e.params?.entry?.text)
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({ ok: true, streamLive, checks, refreshRecovered: recovered, consoleErrors: errors.length }, null, 2))
  client.ws.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => chrome.kill())
