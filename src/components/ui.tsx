import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  X,
  Loader2,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { AGENT_ICONS } from '../lib/nav'
import { HUE_STYLES } from '../lib/agents'
import type { AgentDef } from '../lib/types'
import { cx } from '../lib/utils'

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[linear-gradient(180deg,#3BE4FF_0%,#00C2E8_100%)] text-[#03131A] font-semibold shadow-[0_10px_30px_-14px_rgba(0,212,255,0.85),inset_0_1px_0_rgba(255,255,255,0.4)] hover:brightness-110 active:brightness-95',
  secondary:
    'bg-white/[0.045] text-txt border border-white/10 hover:bg-white/[0.075] hover:border-white/20',
  ghost: 'text-txt-muted hover:text-txt hover:bg-white/[0.055]',
  danger:
    'bg-rose-500/12 text-rose-200 border border-rose-400/25 hover:bg-rose-500/20 hover:border-rose-400/40',
  outline:
    'border border-cyan/35 text-cyan hover:bg-cyan/10 hover:border-cyan/55',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-[10px] justify-center',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  block,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 ease-smooth disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className={cx(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'shrink-0')} aria-hidden="true" />
      ) : null}
      {children}
      {IconRight && !loading ? (
        <IconRight className={cx(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'shrink-0 opacity-70')} aria-hidden="true" />
      ) : null}
    </button>
  )
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'icon',
  active,
  className,
  ...props
}: ButtonProps & { label: string; icon: LucideIcon; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all duration-200',
        active
          ? 'border-cyan/30 bg-cyan/10 text-cyan'
          : 'border-transparent text-txt-muted hover:border-white/10 hover:bg-white/[0.05] hover:text-txt',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

/* ---------------------------------- Badge ---------------------------------- */

type BadgeTone = 'default' | 'cyan' | 'violet' | 'success' | 'warn' | 'error'

const BADGE_TONES: Record<BadgeTone, string> = {
  default: 'bg-white/[0.05] text-txt-muted border-white/10',
  cyan: 'bg-cyan/10 text-cyan border-cyan/25',
  violet: 'bg-violet/12 text-violet-200 border-violet/30',
  success: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  warn: 'bg-amber-400/10 text-amber-200 border-amber-400/25',
  error: 'bg-rose-500/10 text-rose-200 border-rose-400/25',
}

export function Badge({
  tone = 'default',
  children,
  className,
  mono,
}: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium leading-none',
        mono && 'font-mono text-[9.5px] uppercase tracking-[0.14em]',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'cyan', pulse }: { tone?: 'cyan' | 'violet' | 'green' | 'amber' | 'rose' | 'slate'; pulse?: boolean }) {
  const colors: Record<string, string> = {
    cyan: 'bg-cyan shadow-[0_0_10px_rgba(0,212,255,0.8)]',
    violet: 'bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.7)]',
    green: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]',
    amber: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]',
    rose: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]',
    slate: 'bg-slate-400',
  }
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse ? <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', colors[tone])} /> : null}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', colors[tone])} />
    </span>
  )
}

/* -------------------------------- StatusPill ------------------------------- */

const STATUS_MAP: Record<string, { label: string; tone: BadgeTone; dot: 'cyan' | 'violet' | 'green' | 'amber' | 'rose' | 'slate'; pulse?: boolean }> = {
  idle: { label: 'Idle', tone: 'default', dot: 'slate' },
  queued: { label: 'Queued', tone: 'violet', dot: 'violet' },
  pending: { label: 'Pending', tone: 'default', dot: 'slate' },
  skipped: { label: 'Skipped', tone: 'default', dot: 'slate' },
  waiting: { label: 'Waiting', tone: 'warn', dot: 'amber' },
  working: { label: 'Working', tone: 'cyan', dot: 'cyan', pulse: true },
  running: { label: 'In production', tone: 'cyan', dot: 'cyan', pulse: true },
  planning: { label: 'Planning', tone: 'violet', dot: 'violet', pulse: true },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warn', dot: 'amber' },
  paused: { label: 'Paused', tone: 'warn', dot: 'amber' },
  completed: { label: 'Completed', tone: 'success', dot: 'green' },
  failed: { label: 'Failed', tone: 'error', dot: 'rose' },
  cancelled: { label: 'Cancelled', tone: 'default', dot: 'slate' },
  planned: { label: 'Planned', tone: 'violet', dot: 'violet' },
  'in-production': { label: 'In production', tone: 'cyan', dot: 'cyan', pulse: true },
  ready: { label: 'Ready', tone: 'success', dot: 'green' },
  published: { label: 'Published', tone: 'cyan', dot: 'cyan' },
  pass: { label: 'Pass', tone: 'success', dot: 'green' },
  warn: { label: 'Review', tone: 'warn', dot: 'amber' },
  fail: { label: 'Fail', tone: 'error', dot: 'rose' },
  approved: { label: 'Approved', tone: 'success', dot: 'green' },
}

export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.idle
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium leading-none',
        BADGE_TONES[config.tone],
        className,
      )}
    >
      <Dot tone={config.dot} pulse={config.pulse} />
      {label ?? config.label}
    </span>
  )
}

/* --------------------------------- Progress -------------------------------- */

export function Progress({
  value,
  className,
  height = 6,
  tone = 'cyan',
  indeterminate,
  label,
}: {
  value: number
  className?: string
  height?: number
  tone?: 'cyan' | 'violet' | 'mixed'
  indeterminate?: boolean
  label?: string
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const fill =
    tone === 'violet'
      ? 'bg-[linear-gradient(90deg,#8B5CF6,#C4B5FD)]'
      : tone === 'mixed'
        ? 'bg-[linear-gradient(90deg,#00D4FF,#8B5CF6)]'
        : 'bg-[linear-gradient(90deg,#00D4FF,#67E8F9)]'
  return (
    <div
      className={cx('relative w-full overflow-hidden rounded-full bg-white/[0.07]', className)}
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      aria-label={label}
    >
      {indeterminate ? (
        <div className={cx('absolute inset-y-0 w-1/3 animate-bar-indeterminate rounded-full', fill)} />
      ) : (
        <div
          className={cx('h-full rounded-full transition-[width] duration-500 ease-linear', fill)}
          style={{ width: `${pct}%`, boxShadow: '0 0 14px rgba(0,212,255,0.35)' }}
        />
      )}
    </div>
  )
}

export function RingProgress({
  value,
  size = 64,
  stroke = 4,
  label,
}: {
  value: number
  size?: number
  stroke?: number
  label?: React.ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(146,158,173,0.14)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 500ms linear' }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2={size} y2={size}>
            <stop stopColor="#00D4FF" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tabular-nums text-txt">
        {label ?? `${Math.round(pct * 100)}%`}
      </div>
    </div>
  )
}

/* ---------------------------------- Tabs ----------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  tabs: Array<{ id: T; label: string; count?: number; icon?: LucideIcon }>
  value: T
  onChange: (id: T) => void
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        'no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-white/[0.08] bg-black/20 p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all duration-200',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
              active
                ? 'bg-white/[0.09] text-txt shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]'
                : 'text-txt-faint hover:text-txt-muted',
            )}
          >
            {tab.icon ? <tab.icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={cx(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  active ? 'bg-cyan/15 text-cyan' : 'bg-white/[0.06] text-txt-faint',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------- Form ----------------------------------- */

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center justify-between text-[12px] font-medium text-txt-muted">
        <span>{label}</span>
        {hint ? <span className="text-[11px] font-normal text-txt-faint">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx('input-base h-10 px-3 text-base sm:text-sm', className)} {...props} />
  },
)

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx('input-base resize-y px-3 py-2.5 text-base leading-relaxed sm:text-sm', className)} {...props} />
  },
)

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx(
          'input-base h-10 appearance-none pl-3 pr-9 text-base text-txt sm:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint"
        aria-hidden="true"
      />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm text-txt">
          {label}
        </label>
        {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-txt-faint">{description}</p> : null}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40',
          checked ? 'border-cyan/40 bg-cyan/80' : 'border-white/12 bg-white/[0.08]',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full transition-all duration-200',
            checked ? 'left-[19px] bg-[#04121a]' : 'left-[3px] bg-slate-300',
          )}
        />
      </button>
    </div>
  )
}

/* ---------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideHeader,
  ariaLabel = 'Dialog',
}: {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  hideHeader?: boolean
  ariaLabel?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panelRef.current || !panelRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      const initial = focusables()[0] ?? panelRef.current
      initial?.focus()
    }, 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(focusTimer)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'glass-strong relative z-10 w-full rounded-t-2xl border-white/10 pb-safe shadow-lift animate-slide-up-sheet sm:rounded-2xl sm:pb-0 sm:animate-fade-up',
          widths[size],
        )}
      >
        {!hideHeader ? (
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
            <div>
              {title ? (
                <h2 id={titleId} className="font-display text-[17px] font-semibold text-txt">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={descriptionId} className="mt-1 text-[12.5px] leading-relaxed text-txt-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton label="Close dialog" icon={X} onClick={onClose} className="-mr-1.5 -mt-1" />
          </div>
        ) : null}
        <div className={cx('px-5 py-4', !hideHeader && 'pt-4')}>{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/* --------------------------------- Dropdown -------------------------------- */

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export function Menu({
  trigger,
  items,
  align = 'right',
  label,
}: {
  trigger: React.ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            'absolute top-full z-50 mt-2 w-52 animate-fade-up overflow-hidden rounded-xl border border-white/10 bg-[#0d141d]/95 p-1 shadow-lift backdrop-blur-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors disabled:opacity-40',
                item.danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-txt-muted hover:bg-white/[0.06] hover:text-txt',
              )}
            >
              {item.icon ? <item.icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------- Layout bits ------------------------------ */

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow ? <div className="label mb-2 text-cyan/80">{eyebrow}</div> : null}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-txt sm:text-[30px]">
          {title}
        </h1>
        {description ? <p className="mt-2 text-[13.5px] leading-relaxed text-txt-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] px-6 py-14 text-center', className)}>
      <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
        <Icon className="h-5 w-5 text-txt-faint" aria-hidden="true" />
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-cyan/60" />
      </div>
      <h3 className="text-[14px] font-medium text-txt">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-txt-faint">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/12 bg-white/[0.05] px-1.5 font-mono text-[10px] text-txt-muted">
      {children}
    </kbd>
  )
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'cyan',
}: {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: LucideIcon
  tone?: 'cyan' | 'violet' | 'emerald' | 'amber'
}) {
  const tones = {
    cyan: 'text-cyan bg-cyan/10 border-cyan/20',
    violet: 'text-violet-200 bg-violet/10 border-violet/25',
    emerald: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    amber: 'text-amber-200 bg-amber-400/10 border-amber-400/20',
  }
  return (
    <div className="panel-flat flex items-start justify-between gap-3 px-4 py-3.5">
      <div>
        <div className="label text-[9.5px]">{label}</div>
        <div className="mt-1.5 font-display text-[22px] font-semibold leading-none tracking-tight text-txt tnum">{value}</div>
        {hint ? <div className="mt-1.5 text-[11px] text-txt-faint">{hint}</div> : null}
      </div>
      {Icon ? (
        <div className={cx('flex h-8 w-8 items-center justify-center rounded-lg border', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------- Agent bits ------------------------------- */

export function AgentGlyph({
  agent,
  size = 'md',
  className,
}: {
  agent: AgentDef
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = AGENT_ICONS[agent.icon] ?? Sparkle
  const hue = HUE_STYLES[agent.hue] ?? HUE_STYLES.cyan
  const sizes = {
    xs: 'h-6 w-6 rounded-[7px]',
    sm: 'h-8 w-8 rounded-[9px]',
    md: 'h-10 w-10 rounded-[11px]',
    lg: 'h-14 w-14 rounded-2xl',
  }
  const iconSizes = { xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-[18px] w-[18px]', lg: 'h-6 w-6' }
  return (
    <span
      className={cx('agent-tile relative flex shrink-0 items-center justify-center border border-white/10', sizes[size], className)}
      style={
        {
          '--tile-a': hue.tileA,
          '--tile-b': hue.tileB,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 20px -12px ${hue.ring}`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <Icon className={cx(iconSizes[size], 'text-white/90')} />
    </span>
  )
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function Avatar({
  initials = 'SO',
  name,
  className,
}: {
  initials?: string
  name?: string
  className?: string
}) {
  return (
    <span
      className={cx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[linear-gradient(160deg,#1d2a38,#0c1219)] text-[11px] font-semibold tracking-wide text-cyan',
        className,
      )}
      title={name}
      aria-hidden={!name}
    >
      {initials}
    </span>
  )
}

/* -------------------------------- Sparkline -------------------------------- */

export function Sparkline({
  values,
  className,
  stroke = '#00D4FF',
  fill = true,
}: {
  values: number[]
  className?: string
  stroke?: string
  fill?: boolean
}) {
  if (!values.length) return null
  const width = 120
  const height = 36
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / span) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const id = `spark-${stroke.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cx('overflow-visible', className)} aria-hidden="true">
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor={stroke} stopOpacity="0.22" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${height} ${points} ${width},${height}`}
            fill={`url(#${id})`}
          />
        </>
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Delta({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 font-mono text-[10.5px]',
        positive ? 'text-emerald-300' : 'text-rose-300',
      )}
    >
      {positive ? '+' : ''}
      {value}%
    </span>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx('hairline', className)} />
}

export function CheckRow({
  status,
  children,
}: {
  status: 'pass' | 'warn' | 'fail' | 'todo'
  children: React.ReactNode
}) {
  const icons = {
    pass: <Check className="h-3.5 w-3.5 text-emerald-300" />,
    warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />,
    fail: <X className="h-3.5 w-3.5 text-rose-300" />,
    todo: <Minus className="h-3.5 w-3.5 text-slate-500" />,
  }
  return (
    <div className="flex items-start gap-2.5 py-2 text-[12.5px] text-txt-muted">
      <span className="mt-px shrink-0">{icons[status]}</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

export function cn(...classes: ClassValue[]) {
  return cx(...classes)
}

type ClassValue = string | false | null | undefined
