import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useDemo } from '../../lib/store'
import { cx } from '../../lib/utils'

export function Toasts() {
  const { toasts, dismissToast } = useDemo()
  if (!toasts.length) return null
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[110] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const config = {
          success: { icon: CheckCircle2, tone: 'text-emerald-300', border: 'border-emerald-400/25', glow: 'shadow-[0_0_40px_-18px_rgba(52,211,153,0.6)]' },
          error: { icon: AlertTriangle, tone: 'text-rose-300', border: 'border-rose-400/30', glow: 'shadow-[0_0_40px_-18px_rgba(251,113,133,0.6)]' },
          info: { icon: Info, tone: 'text-cyan', border: 'border-cyan/25', glow: 'shadow-[0_0_40px_-18px_rgba(0,212,255,0.5)]' },
          default: { icon: Info, tone: 'text-txt-muted', border: 'border-white/10', glow: '' },
        }[toast.tone]
        const Icon = config.icon
        return (
          <div
            key={toast.id}
            role="status"
            className={cx(
              'pointer-events-auto flex animate-slide-in-right items-start gap-3 rounded-xl border bg-[#0d141d]/96 p-3.5 shadow-lift backdrop-blur-xl',
              config.border,
              config.glow,
            )}
          >
            <Icon className={cx('mt-px h-4 w-4 shrink-0', config.tone)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-txt">{toast.title}</div>
              {toast.description ? (
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-txt-muted">{toast.description}</div>
              ) : null}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-txt-faint transition-colors hover:bg-white/5 hover:text-txt"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
