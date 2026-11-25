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

function AttachmentStrip({
  attachments,
  onRemove,
  className,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
  className?: string
}) {
  if (!attachments.length) return null
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
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
            onClick={() => onRemove(att.id)}
            className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-txt-faint hover:bg-white/10 hover:text-txt"
            aria-label={`Remove ${att.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ChipSelect({
  label,
  value,
  options,
  onChange,
  size = 'sm',
  active = false,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  active?: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cx(
          'appearance-none border border-white/[0.08] bg-white/[0.03] transition-colors hover:border-white/15 hover:text-txt focus:border-cyan/40 focus:outline-none',
          size === 'sm'
            ? 'h-7 rounded-md pl-2 pr-6 text-[11px] text-txt-muted'
            : 'h-8 rounded-full bg-white/[0.05] pl-3 pr-7 text-[11.5px] text-txt hover:bg-white/[0.08]',
          active && 'border-cyan/25 bg-cyan/[0.07] text-cyan',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0b1018] text-txt">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 12 12"
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-txt-faint',
          size === 'sm' ? 'right-2 h-2.5 w-2.5' : 'right-2.5 h-3 w-3',
        )}
        aria-hidden="true"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function Composer({
  mode = 'thread',
  onSend,
  disabledHint,
  autoFocus,
}: {
  mode?: 'hero' | 'studio' | 'thread'
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
  const studio = mode === 'studio'
  const canSend = Boolean(text.trim() || attachments.length)
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id))

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
      {studio ? (
        <div
          className={cx(
            'studio-shell relative rounded-[26px] p-2 sm:p-3',
            dragging && 'border-[#b7ff3c]/50 ring-2 ring-[#b7ff3c]/15',
          )}
        >
          <AttachmentStrip attachments={attachments} onRemove={removeAttachment} className="mb-2 px-1 pt-1" />

          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-txt-muted transition-colors hover:border-white/15 hover:bg-white/[0.09] hover:text-txt"
              aria-label="Add reference files"
              title="Add image, video or document"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
            <label className="sr-only" htmlFor="prompt-input">
              Describe what the studio should produce
            </label>
            <textarea
              id="prompt-input"
              ref={textareaRef}
              autoFocus={autoFocus}
              value={text}
              rows={2}
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
              placeholder="Describe the video, reel or campaign you need — topic, hook, platform, language…"
              className="scroll-thin min-h-[88px] w-full flex-1 resize-none bg-transparent px-2 py-3 text-[16px] leading-relaxed text-txt placeholder:text-txt-faint focus:outline-none sm:text-[15.5px]"
              style={{ maxHeight: 176 }}
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-0.5 pb-0.5 sm:gap-2">
            <ChipSelect
              size="md"
              label="Platform"
              value={platform}
              options={PLATFORM_OPTIONS}
              active={platform !== 'auto'}
              onChange={(v) => setPlatform(v as Platform | 'auto')}
            />
            <ChipSelect
              size="md"
              label="Language"
              value={language}
              options={LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'auto' ? o.label : LANGUAGE_LABELS[o.value] }))}
              active={language !== 'auto'}
              onChange={(v) => setLanguage(v as Language | 'auto')}
            />
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] text-txt-faint md:inline-flex">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              12 agents · 13 stages
            </span>

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

            <button
              type="submit"
              disabled={!canSend}
              className={cx(
                'ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-all duration-200',
                canSend
                  ? 'bg-[#B7FF3C] text-[#0B1206] shadow-[0_12px_30px_-14px_rgba(183,255,60,0.85)] hover:brightness-105 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-[#B7FF3C]/40 text-[#0B1206]/60 shadow-none',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              Generate
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cx(
            'composer-shell relative rounded-2xl',
            hero ? 'p-2.5 sm:p-3' : 'p-2 sm:p-2.5',
            dragging && 'border-cyan/60 ring-2 ring-cyan/15',
          )}
        >
          <AttachmentStrip attachments={attachments} onRemove={removeAttachment} className="mb-2 px-1 pt-1" />

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
              <ChipSelect
                label="Platform"
                value={platform}
                options={PLATFORM_OPTIONS}
                active={platform !== 'auto'}
                onChange={(v) => setPlatform(v as Platform | 'auto')}
              />
              <ChipSelect
                label="Language"
                value={language}
                options={LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'auto' ? o.label : LANGUAGE_LABELS[o.value] }))}
                active={language !== 'auto'}
                onChange={(v) => setLanguage(v as Language | 'auto')}
              />
            </div>

            <span id="composer-hint" className="ml-auto hidden select-none items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-txt-faint md:flex">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              EP ORCHESTRATES 12 AGENTS
            </span>

            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send prompt"
              className={cx(
                'ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 md:ml-2',
                canSend
                  ? 'bg-[linear-gradient(180deg,#3BE4FF,#00C2E8)] text-[#03131A] shadow-[0_6px_20px_-8px_rgba(0,212,255,0.9)] hover:brightness-110 active:scale-[0.97]'
                  : 'cursor-not-allowed bg-white/[0.06] text-txt-faint',
              )}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

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

      {studio ? (
        <p className="mt-2.5 text-center text-[10px] text-txt-faint">
          Enter to send · Shift + Enter for a new line · outputs are simulated
        </p>
      ) : null}
    </form>
  )
}
