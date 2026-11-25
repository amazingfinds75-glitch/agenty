import { useRef, useState } from 'react'
import {
  ArrowUp,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import type { Attachment, Language, Platform } from '../../lib/types'
import { LANGUAGE_LABELS, cx, formatBytes } from '../../lib/utils'
import { useDemo } from '../../lib/store'
import { readFileAsDataUrl } from '../../lib/exports'
import { Badge } from '../ui'

export interface ComposerPayload {
  text: string
  attachments: Attachment[]
  platform: Platform | 'auto'
  language: Language | 'auto'
}

const PLATFORM_OPTIONS: Array<{ value: Platform | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto platform' },
  { value: 'youtube-short', label: 'YouTube Short' },
  { value: 'instagram-reel', label: 'Instagram Reel' },
  { value: 'youtube-long', label: 'Long-form video' },
]

const LANGUAGE_OPTIONS: Array<{ value: Language | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto language' },
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'kn', label: 'Kannada' },
]

function FileGlyph({ type, className }: { type: string; className?: string }) {
  if (type.startsWith('image')) return <FileImage className={className} aria-hidden="true" />
  if (type.startsWith('video')) return <FileVideo className={className} aria-hidden="true" />
  if (type.startsWith('audio')) return <FileAudio className={className} aria-hidden="true" />
  return <FileText className={className} aria-hidden="true" />
}

export function Composer({
  mode = 'thread',
  onSend,
  disabledHint,
  autoFocus,
}: {
  mode?: 'hero' | 'thread'
  onSend: (payload: ComposerPayload) => void
  disabledHint?: string
  autoFocus?: boolean
}) {
  const { pushToast } = useDemo()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [platform, setPlatform] = useState<Platform | 'auto'>('auto')
  const [language, setLanguage] = useState<Language | 'auto'>('auto')
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(176, Math.max(24, el.scrollHeight))}px`
  }

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 4 - attachments.length)
    if (!list.length) return
    const next: Attachment[] = []
    for (const file of list) {
      if (file.size > 5 * 1024 * 1024) {
        pushToast({ tone: 'error', title: 'File too large', description: `${file.name} is over the 5 MB demo limit.` })
        continue
      }
      let dataUrl: string | undefined
      if (file.type.startsWith('image/') && file.size < 3_000_000) {
        try {
          dataUrl = await readFileAsDataUrl(file)
        } catch {
          dataUrl = undefined
        }
      }
      next.push({
        id: `att-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'file',
        dataUrl,
        sessionOnly: !dataUrl,
      })
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }

  const submit = () => {
    if (!text.trim() && attachments.length === 0) {
      textareaRef.current?.focus()
      return
    }
    onSend({ text: text.trim(), attachments, platform, language })
    setText('')
    setAttachments([])
    window.requestAnimationFrame(() => {
      resize()
      textareaRef.current?.focus()
    })
  }

  const hero = mode === 'hero'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="w-full"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files)
      }}
      aria-label="Prompt composer"
    >
      <div
        className={cx(
          'composer-shell relative rounded-2xl',
          hero ? 'p-2.5 sm:p-3' : 'p-2 sm:p-2.5',
          dragging && 'border-cyan/60 ring-2 ring-cyan/15',
        )}
      >
        {attachments.length ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-1 pl-1 pr-1.5"
              >
                {att.dataUrl ? (
                  <img src={att.dataUrl} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-white/[0.05] text-txt-muted">
                    <FileGlyph type={att.type} className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-[11.5px] text-txt">{att.name}</span>
                  <span className="block text-[10px] text-txt-faint">{formatBytes(att.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-txt-faint hover:bg-white/10 hover:text-txt"
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <label className="sr-only" htmlFor="prompt-input">
            Describe what the studio should produce
          </label>
          <textarea
            id="prompt-input"
            ref={textareaRef}
            autoFocus={autoFocus}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={
              hero
                ? 'Describe the content you need — platform, language, angle, anything…'
                : disabledHint ?? 'Add a follow-up or revision instruction…'
            }
            className={cx(
              'scroll-thin w-full resize-none bg-transparent px-2 py-1.5 text-txt placeholder:text-txt-faint focus:outline-none',
              hero ? 'min-h-[58px] text-[16px] leading-relaxed sm:text-[15px]' : 'min-h-[24px] text-[16px] leading-relaxed sm:text-[14px]',
            )}
            style={{ maxHeight: 176 }}
            aria-describedby="composer-hint"
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-txt-faint transition-colors hover:bg-white/[0.06] hover:text-txt sm:flex"
            aria-label="Attach reference files"
            title="Attach image, document or reference media"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 px-1 pb-0.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-txt-faint transition-colors hover:bg-white/[0.06] hover:text-txt sm:hidden"
            aria-label="Attach reference files"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | 'auto')}
                aria-label="Platform"
                className={cx(
                  'h-7 appearance-none rounded-md border border-white/[0.08] bg-white/[0.03] pl-2 pr-6 text-[11px] text-txt-muted transition-colors hover:border-white/15 hover:text-txt focus:border-cyan/40 focus:outline-none',
                  platform !== 'auto' && 'border-cyan/25 bg-cyan/[0.07] text-cyan',
                )}
              >
                {PLATFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0b1018] text-txt">
                    {o.label}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-txt-faint" aria-hidden="true">
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language | 'auto')}
                aria-label="Language"
                className={cx(
                  'h-7 appearance-none rounded-md border border-white/[0.08] bg-white/[0.03] pl-2 pr-6 text-[11px] text-txt-muted transition-colors hover:border-white/15 hover:text-txt focus:border-cyan/40 focus:outline-none',
                  language !== 'auto' && 'border-cyan/25 bg-cyan/[0.07] text-cyan',
                )}
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0b1018] text-txt">
                    {o.value === 'auto' ? o.label : LANGUAGE_LABELS[o.value]}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-txt-faint" aria-hidden="true">
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <span id="composer-hint" className="ml-auto hidden select-none items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-txt-faint md:flex">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            EP ORCHESTRATES 12 AGENTS
          </span>

          <button
            type="submit"
            disabled={!text.trim() && attachments.length === 0}
            aria-label="Send prompt"
            className={cx(
              'ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 md:ml-2',
              text.trim() || attachments.length
                ? 'bg-[linear-gradient(180deg,#3BE4FF,#00C2E8)] text-[#03131A] shadow-[0_6px_20px_-8px_rgba(0,212,255,0.9)] hover:brightness-110 active:scale-[0.97]'
                : 'cursor-not-allowed bg-white/[0.06] text-txt-faint',
            )}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      {hero ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10.5px] text-txt-faint">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded text-txt-faint transition-colors hover:text-txt-muted"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> Attach references
          </button>
          <span className="h-2.5 w-px bg-white/10" />
          <span>Enter to send · Shift + Enter for a new line</span>
          <span className="h-2.5 w-px bg-white/10" />
          <Badge mono className="border-amber-400/20 text-amber-200/80">
            Demo engine — outputs are illustrative
          </Badge>
        </div>
      ) : null}
    </form>
  )
}
