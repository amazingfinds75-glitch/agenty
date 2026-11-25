import type { Project } from './types'
import { slugify } from './utils'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function baseName(project: Project) {
  return slugify(project.title || 'ai-viral-studio') || 'production'
}

export function scriptMarkdown(project: Project) {
  const a = project.artifacts
  if (!a) return ''
  const lines: string[] = [
    `# ${a.title}`,
    '',
    `Platform: ${project.platform}`,
    `Language: ${a.languageLabel}`,
    `Duration: ${Math.floor(a.durationSec / 60)}:${String(a.durationSec % 60).padStart(2, '0')}`,
    `Words: ${a.wordCount}`,
    '',
    '## Hook',
    a.hook,
    '',
    '## Scenes',
  ]
  for (const scene of a.scenes) {
    const start = `${Math.floor(scene.startSec / 60)}:${String(Math.round(scene.startSec % 60)).padStart(2, '0')}`
    const end = `${Math.floor(scene.endSec / 60)}:${String(Math.round(scene.endSec % 60)).padStart(2, '0')}`
    lines.push(`### ${scene.label} — ${start}–${end}`, '', `**Visual:** ${scene.visual}`, '', `**Shot:** ${scene.shot}`, '', scene.narration, '')
  }
  lines.push('## YouTube', '', `**Title:** ${a.youtubeTitle}`, '', a.description, '', '**Tags:** ' + a.youtubeTags.join(', '), '')
  lines.push('## Instagram', '', a.instagramCaption, '', a.hashtags.join(' '), '')
  lines.push('## Quality control', ...a.qc.map((q) => `- [${q.status}] ${q.label}: ${q.detail}`), '')
  lines.push('---', 'Demo copy generated locally by AI Viral Studio. Sources are illustrative. Verify before publishing.')
  return lines.join('\n')
}

export function projectJson(project: Project) {
  return JSON.stringify(
    {
      id: project.id,
      title: project.title,
      prompt: project.prompt,
      platform: project.platform,
      language: project.language,
      status: project.status,
      createdAt: project.createdAt,
      artifacts: project.artifacts
        ? {
            ...project.artifacts,
            thumbnailDataUrl: project.artifacts.thumbnailDataUrl ? '[embedded image]' : undefined,
            coverDataUrl: project.artifacts.coverDataUrl ? '[embedded image]' : undefined,
          }
        : undefined,
    },
    null,
    2,
  )
}

export function downloadPng(dataUrl: string, filename: string) {
  downloadDataUrl(dataUrl, /\.(png|jpe?g|webp)$/i.test(filename) ? filename : `${filename}.png`)
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
