import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const profile = mkdtempSync(join(tmpdir(), 'wf-cdp-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1440,1000',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitDevtools() {
  for (let i = 0; i < 60; i += 1) {
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
  const events = []
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(new Error(data.error.message))
      else resolve(data.result)
    } else if (data.method) {
      events.push(data)
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  return {
    ws,
    events,
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
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:8787/#/workforce`, { method: 'PUT' }).then((r) => r.json())
  const client = connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Page.enable')
  await client.send('Page.navigate', { url: 'http://127.0.0.1:8787/#/workforce' })
  await sleep(800)

  const evalJs = async (expression, awaitPromise = false) => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    return result.result.value
  }

  let loaded = false
  for (let i = 0; i < 40; i += 1) {
    const text = await evalJs('document.body ? document.body.innerText : ""')
    if (text.includes('Agent Workforce')) { loaded = true; break }
    await sleep(300)
  }
  const href = await evalJs('location.href')
  const text = await evalJs('document.body.innerText.slice(0,1200)')
  console.log('HREF', href)
  const mimes = await evalJs(`(() => { const list=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']; return list.map(m=>[m, (window.MediaRecorder? MediaRecorder.isTypeSupported(m):false)]) })()`)
  const visibility = await evalJs('document.visibilityState')
  const errors = client.events
    .filter((event) => event.method === 'Runtime.exceptionThrown' || (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'))
    .map((event) => event.params?.exceptionDetails?.exception?.description ?? event.params?.entry?.text)
  console.log(JSON.stringify({ loaded, visibility, mimes, errors: errors.slice(0, 8), text: text.slice(0, 900) }, null, 2))
  await client.send('Page.captureScreenshot', { format: 'png' }).then((shot) => writeFileSync('C:/Users/VICTUS/Documents/Qoder/2026-11-27/d81b3893/workforce-page.png', Buffer.from(shot.data, 'base64')))
  await evalJs(`(() => { const links=[...document.querySelectorAll('a')]; const link=links.find(a=>a.getAttribute('href')==='/workforce'); if(link){link.click(); return 'clicked'} return 'no-link' })()`)
  await sleep(3000)
  console.log('AFTER CLICK', await evalJs('location.href'))
  console.log('HAS HEADING', await evalJs('document.body.innerText.includes("Agent Workforce")'))
  client.ws.close()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    chrome.kill()
  })
