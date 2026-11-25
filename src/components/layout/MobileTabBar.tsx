import { Link, useLocation } from 'react-router-dom'
import { Activity, Library, Menu, Plus, TrendingUp, type LucideIcon } from 'lucide-react'
import { useDemo } from '../../lib/store'
import { cx } from '../../lib/utils'

const TABS: Array<{ to: string; label: string; icon: LucideIcon; matches: (path: string) => boolean }> = [
  { to: '/', label: 'New', icon: Plus, matches: (p) => p === '/' || p.startsWith('/c/') },
  { to: '/trends', label: 'Trends', icon: TrendingUp, matches: (p) => p.startsWith('/trends') },
  { to: '/productions', label: 'Shoots', icon: Activity, matches: (p) => p.startsWith('/productions') },
  { to: '/library', label: 'Library', icon: Library, matches: (p) => p.startsWith('/library') },
]

export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const { state } = useDemo()
  const { pathname } = useLocation()
  const running = state.projects.filter((p) => p.status === 'running' || p.status === 'paused').length
  const moreActive = !TABS.some((tab) => tab.matches(pathname))

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#07090d]/95 pb-safe backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-[58px] max-w-md grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.matches(pathname)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                active ? 'text-cyan' : 'text-txt-faint hover:text-txt-muted',
              )}
            >
              {active ? (
                <span className="absolute top-0 h-[2px] w-7 rounded-full bg-cyan shadow-[0_0_10px_rgba(0,212,255,0.7)]" aria-hidden="true" />
              ) : null}
              <span className="relative">
                <tab.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {tab.to === '/productions' && running > 0 ? (
                  <span className="absolute -right-2 -top-1.5 rounded-full bg-cyan px-1 font-mono text-[8px] font-semibold leading-[13px] text-[#03131a]">
                    {running}
                  </span>
                ) : null}
              </span>
              {tab.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMore}
          aria-label="More sections"
          className={cx(
            'relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
            moreActive ? 'text-cyan' : 'text-txt-faint hover:text-txt-muted',
          )}
        >
          {moreActive ? (
            <span className="absolute top-0 h-[2px] w-7 rounded-full bg-cyan shadow-[0_0_10px_rgba(0,212,255,0.7)]" aria-hidden="true" />
          ) : null}
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
          More
        </button>
      </div>
    </nav>
  )
}
