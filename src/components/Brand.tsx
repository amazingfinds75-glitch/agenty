import { useId, type SVGProps } from 'react'

export function StudioMark({ className = 'h-7 w-7', ...props }: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ringId = `avs-mark-a-${uid}`
  const orbitId = `avs-mark-b-${uid}`
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" {...props}>
      <circle cx="16" cy="16" r="7.2" stroke={`url(#${ringId})`} strokeWidth="1.3" />
      <ellipse
        cx="16"
        cy="16"
        rx="12.4"
        ry="4.6"
        stroke={`url(#${orbitId})`}
        strokeWidth="1.1"
        transform="rotate(-26 16 16)"
        opacity="0.85"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="12.4"
        ry="4.6"
        stroke="#00D4FF"
        strokeOpacity="0.28"
        strokeWidth="0.8"
        transform="rotate(38 16 16)"
      />
      <circle cx="16" cy="16" r="2.4" fill="#00D4FF" />
      <circle cx="16" cy="16" r="4.6" fill="#00D4FF" fillOpacity="0.16" />
      <defs>
        <linearGradient id={ringId} x1="9" y1="9" x2="23" y2="23">
          <stop stopColor="#00D4FF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={orbitId} x1="4" y1="16" x2="28" y2="16">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#00D4FF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  if (compact) return <StudioMark className="h-7 w-7" />
  return (
    <div className="flex items-center gap-2.5">
      <StudioMark className="h-7 w-7 shrink-0" />
      <div className="leading-none">
        <div className="font-display text-[15px] font-semibold tracking-[0.01em] text-txt">
          AI Viral Studio
        </div>
        <div className="label mt-1 text-[9px] tracking-[0.24em] text-txt-faint">MEDIA AGENCY OS</div>
      </div>
    </div>
  )
}

export function YoutubeMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="5.5" width="20" height="13" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 9.2v5.6l4.8-2.8-4.8-2.8Z" fill="currentColor" />
    </svg>
  )
}

export function InstagramMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.2" cy="6.9" r="1.15" fill="currentColor" />
    </svg>
  )
}

export function PlatformMark({
  platform,
  className = 'h-4 w-4',
}: {
  platform: string
  className?: string
}) {
  if (platform === 'instagram-reel') return <InstagramMark className={className} />
  return <YoutubeMark className={className} />
}
