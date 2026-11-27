import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
const profile = mkdtempSync(join(tmpdir(), 'wf-shots-'))
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1440,1100', 'about:blank'],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function devtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('devtools not ready')
}

function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data.result)
      pending.delete(data.id)
    }
  })
  const ready = new Promise((resolve) => ws.addEventListener('open', resolve))
  return {
    ws,
    async send(method, params = {}) {
      await ready
      const callId = ++id
      const promise = new Promise((resolve) => pending.set(callId, resolve))
      ws.send(JSON.stringify({ id: callId, method, params }))
      return promise
    },
  }
}

async function main() {
  await devtools()
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  const client = connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })

  for (const [path, name] of [
    ['/#/', 'home-copy.png'],
    ['/#/verification', 'verification.png'],
  ]) {
    await client.send('Page.navigate', { url: `http://127.0.0.1:8787${path}` })
    await sleep(2000)
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join('e2e-artifacts', name), Buffer.from(data, 'base64'))
    console.log('shot', name)
  }
  client.ws.close()
  chrome.kill()
}

main().catch((error) => {
  console.error(error)
  chrome.kill()
  process.exit(1)
})
