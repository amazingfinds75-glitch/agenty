import type { Artifacts, Platform } from './types'

const DISPLAY = '"Space Grotesk Variable", "Inter Variable", system-ui, sans-serif'
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace'

export interface RenderResult {
  url: string
  blob: Blob
  mime: string
  size: number
  width: number
  height: number
  durationSec: number
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (ctx.measureText(trial).width <= maxWidth || !current) {
      current = trial
    } else {
      lines.push(current)
      current = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1]
    if (!text.trim().endsWith(last)) {
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trim()
      }
      lines[maxLines - 1] = `${last}…`
    }
  }
  return lines
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  weight = 600,
) {
  let size = maxSize
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${DISPLAY}`
    const lines = wrapLines(ctx, text, maxWidth, maxLines)
    if (lines.length <= maxLines) return { size, lines }
    size -= 4
  }
  ctx.font = `${weight} ${minSize}px ${DISPLAY}`
  return { size: minSize, lines: wrapLines(ctx, text, maxWidth, maxLines) }
}

interface ArtworkVariant {
  width: number
  height: number
  platformLabel: string
  eyebrow: string
  isCover: boolean
}

export function artworkVariant(platform: Platform, isCover: boolean): ArtworkVariant {
  if (isCover) {
    return {
      width: 720,
      height: 1280,
      platformLabel:
        platform === 'instagram-reel' ? 'INSTAGRAM REEL' : platform === 'youtube-long' ? 'YOUTUBE' : 'YOUTUBE SHORT',
      eyebrow: platform === 'instagram-reel' ? 'REEL COVER' : 'SHORT COVER',
      isCover: true,
    }
  }
  return {
    width: 1280,
    height: 720,
    platformLabel:
      platform === 'instagram-reel' ? 'INSTAGRAM REEL' : platform === 'youtube-long' ? 'YOUTUBE' : 'YOUTUBE SHORT',
    eyebrow: 'THUMBNAIL',
    isCover: false,
  }
}

export function paintArtwork(
  artifacts: Artifacts,
  platform: Platform,
  isCover: boolean,
  titleOverride?: string,
): string {
  const v = artworkVariant(platform, isCover)
  const canvas = makeCanvas(v.width, v.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const W = v.width
  const H = v.height
  const accent = artifacts.theme.accent
  const title = titleOverride || artifacts.title

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#07090D')
  bg.addColorStop(0.55, artifacts.theme.from)
  bg.addColorStop(1, '#07090D')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.28, 10, W * 0.78, H * 0.28, W * 0.75)
  glow.addColorStop(0, `${accent}55`)
  glow.addColorStop(0.45, `${accent}18`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(W * 0.15, H * 0.9, 10, W * 0.15, H * 0.9, W * 0.6)
  glow2.addColorStop(0, `${artifacts.theme.to}88`)
  glow2.addColorStop(1, 'transparent')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.strokeStyle = 'rgba(146,158,173,0.08)'
  ctx.lineWidth = 1
  const step = v.isCover ? 44 : 52
  for (let x = step; x < W; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.restore()

  const cx = v.isCover ? W * 0.62 : W * 0.74
  const cy = v.isCover ? H * 0.26 : H * 0.44
  const radius = v.isCover ? W * 0.42 : W * 0.24
  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < 3; i += 1) {
    ctx.save()
    ctx.rotate((-0.5 + i * 0.55) * 1)
    ctx.strokeStyle = i === 1 ? `${accent}66` : 'rgba(245,247,250,0.16)'
    ctx.lineWidth = i === 1 ? 2 : 1
    ctx.beginPath()
    ctx.ellipse(0, 0, radius * (1 - i * 0.12), radius * (0.42 - i * 0.05), 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  const orb = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 0.42)
  orb.addColorStop(0, `${accent}cc`)
  orb.addColorStop(0.35, `${accent}33`)
  orb.addColorStop(1, 'transparent')
  ctx.fillStyle = orb
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const pad = v.isCover ? 56 : 64
  ctx.textBaseline = 'top'

  const kickerY = pad
  ctx.fillStyle = 'rgba(245,247,250,0.72)'
  ctx.font = `500 ${v.isCover ? 17 : 15}px ${MONO}`
  ctx.fillText('AI VIRAL STUDIO', pad, kickerY)
  const chipW = ctx.measureText(v.eyebrow).width + 26
  roundRect(ctx, W - pad - chipW, kickerY - 6, chipW, 28, 6)
  ctx.strokeStyle = `${accent}66`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.fillText(v.eyebrow, W - pad - chipW + 13, kickerY + 1)

  const titleTop = v.isCover ? H * 0.46 : H * 0.34
  const maxTitleWidth = v.isCover ? W - pad * 2 : W * 0.6
  const { size, lines } = fitFont(ctx, title, maxTitleWidth, v.isCover ? 4 : 3, v.isCover ? 76 : 82, 40, 600)
  ctx.fillStyle = '#F5F7FA'
  ctx.font = `600 ${size}px ${DISPLAY}`
  const lineHeight = size * 1.06
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, titleTop + i * lineHeight)
  })

  const ruleY = titleTop + lines.length * lineHeight + 22
  ctx.fillStyle = accent
  ctx.fillRect(pad, ruleY, 64, 3)

  ctx.fillStyle = 'rgba(245,247,250,0.62)'
  ctx.font = `500 ${v.isCover ? 15 : 14}px ${MONO}`
  const meta = `${v.platformLabel}  ·  ${Math.floor(artifacts.durationSec / 60)}:${String(artifacts.durationSec % 60).padStart(2, '0')}  ·  ${artifacts.languageLabel.toUpperCase()}`
  ctx.fillText(meta, pad, ruleY + 20)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(245,247,250,0.34)'
  ctx.font = `500 12px ${MONO}`
  ctx.fillText('DEMO ARTWORK', W - pad, H - pad + 4)
  ctx.textAlign = 'left'

  ctx.fillStyle = 'rgba(245,247,250,0.46)'
  ctx.font = `500 12px ${MONO}`
  ctx.fillText(v.isCover ? '@AIVIRALSTUDIO' : artifacts.theme.accent.toUpperCase(), pad, H - pad + 4)

  // thin frame
  ctx.strokeStyle = 'rgba(146,158,173,0.14)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  return canvas.toDataURL('image/jpeg', 0.86)
}

export async function attachArtwork(artifacts: Artifacts, platform: Platform): Promise<Artifacts> {
  try {
    if (document.fonts?.ready) await document.fonts.ready
    await Promise.all([
      document.fonts.load(`600 64px "Space Grotesk Variable"`).catch(() => undefined),
      document.fonts.load(`500 15px "JetBrains Mono Variable"`).catch(() => undefined),
    ])
  } catch {
    /* canvas will fall back to system fonts */
  }
  const thumbnailDataUrl = paintArtwork(artifacts, platform, false)
  const coverDataUrl = paintArtwork(artifacts, platform, true)
  return { ...artifacts, thumbnailDataUrl, coverDataUrl }
}

export function supportsVideoRender() {
  if (typeof window === 'undefined') return false
  const canvas = document.createElement('canvas')
  const hasCapture = typeof (canvas as HTMLCanvasElement).captureStream === 'function'
  const hasRecorder = typeof window.MediaRecorder !== 'undefined'
  return hasCapture && hasRecorder
}

function pickMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return ''
}

export async function renderDemoVideo(
  artifacts: Artifacts,
  platform: Platform,
  onProgress?: (progress: number) => void,
): Promise<RenderResult> {
  if (!supportsVideoRender()) {
    throw new Error('VIDEO_RENDER_UNSUPPORTED')
  }
  if (document.visibilityState === 'hidden') {
    throw new Error('VIDEO_RENDER_HIDDEN')
  }
  const mime = pickMime()
  if (!mime) throw new Error('VIDEO_RENDER_UNSUPPORTED')

  const isVertical = platform !== 'youtube-long'
  const W = isVertical ? 720 : 1280
  const H = isVertical ? 1280 : 720
  const canvas = makeCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('VIDEO_RENDER_UNSUPPORTED')

  const stream = canvas.captureStream(30)
  let audioCtx: AudioContext | null = null
  try {
    audioCtx = new AudioContext()
    const destination = audioCtx.createMediaStreamDestination()
    const master = audioCtx.createGain()
    master.gain.value = 0.035
    const filter = audioCtx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const osc1 = audioCtx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.value = 55
    const osc2 = audioCtx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = 82.4
    const lfo = audioCtx.createOscillator()
    lfo.frequency.value = 0.08
    const lfoGain = audioCtx.createGain()
    lfoGain.gain.value = 0.012
    lfo.connect(lfoGain)
    lfoGain.connect(master.gain)
    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(master)
    master.connect(destination)
    osc1.start()
    osc2.start()
    lfo.start()
    destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  } catch {
    audioCtx = null
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: isVertical ? 3_200_000 : 4_500_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const totalMs = 10_000
  const started = performance.now()
  const sceneCount = Math.max(1, Math.min(6, artifacts.scenes.length))
  const particles = Array.from({ length: 70 }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453) % 1,
    y: (Math.sin(i * 78.233) * 12345.678) % 1,
    r: 0.6 + ((i * 37) % 17) / 10,
    speed: 0.2 + ((i * 13) % 20) / 40,
  })).map((p) => ({ x: Math.abs(p.x), y: Math.abs(p.y), r: p.r, speed: p.speed }))

  let raf = 0
  let lastReport = 0
  let completed = false
  let aborted: string | null = null

  const stopRecorder = () => {
    try {
      recorder.stop()
    } catch {
      /* already stopped */
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && !completed) {
      aborted = 'VIDEO_RENDER_HIDDEN'
      stopRecorder()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  const watchdog = window.setTimeout(stopRecorder, 20_000)

  const draw = (frameTime: number) => {
    const elapsed = frameTime - started
    const t = Math.min(1, elapsed / totalMs)
    const sceneIdx = Math.min(sceneCount - 1, Math.floor(t * sceneCount))
    const scene = artifacts.scenes[sceneIdx]
    const local = Math.max(0, Math.min(1, t * sceneCount - sceneIdx))
    const accent = artifacts.theme.accent

    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#07090D')
    bg.addColorStop(0.5, artifacts.theme.from)
    bg.addColorStop(1, '#07090D')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const px = W * (0.5 + Math.sin(t * 2.2) * 0.18)
    const py = H * (0.34 + Math.cos(t * 1.7) * 0.08)
    const glow = ctx.createRadialGradient(px, py, 8, px, py, W * 0.6)
    glow.addColorStop(0, `${accent}40`)
    glow.addColorStop(0.5, `${accent}12`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    ctx.translate(px, py)
    for (let i = 0; i < 3; i += 1) {
      ctx.save()
      ctx.rotate(t * (0.25 + i * 0.16) + i * 0.9)
      ctx.strokeStyle = i === 0 ? `${accent}88` : 'rgba(245,247,250,0.18)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.ellipse(0, 0, W * (0.22 + i * 0.05), W * (0.09 + i * 0.02), 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, W * 0.13)
    core.addColorStop(0, `${accent}aa`)
    core.addColorStop(0.55, `${accent}22`)
    core.addColorStop(1, 'transparent')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(0, 0, W * 0.13, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    for (const p of particles) {
      const y = ((p.y + t * p.speed * 0.5) % 1) * H
      const x = p.x * W
      ctx.fillStyle = `rgba(245,247,250,${0.06 + p.r * 0.06})`
      ctx.beginPath()
      ctx.arc(x, y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }

    const pad = isVertical ? 48 : 72
    ctx.fillStyle = 'rgba(245,247,250,0.6)'
    ctx.font = `500 14px ${MONO}`
    ctx.fillText('AI VIRAL STUDIO', pad, pad)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,247,250,0.38)'
    ctx.fillText('DEMO RENDER', W - pad, pad)
    ctx.textAlign = 'left'

    ctx.fillStyle = accent
    ctx.font = `500 15px ${MONO}`
    ctx.fillText(`0${sceneIdx + 1}  /  ${scene.label.toUpperCase()}`, pad, H * 0.62)

    const excerpt = scene.narration.split(/\s+/).slice(0, isVertical ? 11 : 16).join(' ')
    ctx.font = `600 ${isVertical ? 46 : 54}px ${DISPLAY}`
    ctx.fillStyle = '#F5F7FA'
    const lines = wrapLines(ctx, excerpt, W - pad * 2, 3)
    const baseY = H * 0.66
    lines.forEach((line, i) => {
      ctx.fillText(line, pad, baseY + i * (isVertical ? 60 : 68))
    })

    const barY = H - (isVertical ? 150 : 120)
    ctx.fillStyle = 'rgba(146,158,173,0.22)'
    ctx.fillRect(pad, barY, W - pad * 2, 3)
    ctx.fillStyle = accent
    ctx.fillRect(pad, barY, (W - pad * 2) * t, 3)

    ctx.fillStyle = 'rgba(245,247,250,0.5)'
    ctx.font = `500 13px ${MONO}`
    const time = `${String(Math.floor(elapsed / 1000)).padStart(2, '0')}:${String(Math.floor((elapsed % 1000) / 10)).padStart(2, '0')}`
    ctx.fillText(`${time}  ·  ${artifacts.languageLabel.toUpperCase()}  ·  ${scene.label.toUpperCase()}`, pad, barY + 22)

    // subtitle band
    const capY = H - (isVertical ? 82 : 64)
    const cap = scene.narration.split(/\s+/).slice(0, isVertical ? 10 : 14).join(' ')
    ctx.font = `500 ${isVertical ? 22 : 24}px ${DISPLAY}`
    const capW = Math.min(W - pad * 2, ctx.measureText(cap).width + 32)
    ctx.fillStyle = 'rgba(7,9,13,0.62)'
    roundRect(ctx, pad, capY - 30, capW, 44, 8)
    ctx.fill()
    ctx.fillStyle = 'rgba(245,247,250,0.86)'
    ctx.fillText(cap, pad + 16, capY - 8)

    if (local < 0.08) {
      ctx.fillStyle = `rgba(245,247,250,${0.25 * (1 - local / 0.08)})`
      ctx.fillRect(0, 0, W, H)
    }

    if (elapsed - lastReport > 240) {
      lastReport = elapsed
      onProgress?.(t)
    }

    if (elapsed < totalMs) {
      raf = requestAnimationFrame(draw)
    } else {
      completed = true
      onProgress?.(1)
      stopRecorder()
    }
  }

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }))
    recorder.onerror = (event) => reject(event.error ?? new Error('recorder-failed'))
  })

  recorder.start(200)
  raf = requestAnimationFrame(draw)

  let blob: Blob
  try {
    blob = await finished
  } finally {
    window.clearTimeout(watchdog)
    document.removeEventListener('visibilitychange', onVisibility)
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    if (audioCtx) audioCtx.close().catch(() => undefined)
  }

  if (aborted) throw new Error(aborted)
  if (!completed) throw new Error('VIDEO_RENDER_TIMEOUT')

  return {
    url: URL.createObjectURL(blob),
    blob,
    mime,
    size: blob.size,
    width: W,
    height: H,
    durationSec: totalMs / 1000,
  }
}
