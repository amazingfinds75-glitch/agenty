import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, PanelLeftOpen, Search } from 'lucide-react'
import { useDemo } from '../../lib/store'
import { pageTitle } from '../../lib/nav'
import { cx, relativeTime } from '../../lib/utils'
import { Avatar, Badge, Dot, IconButton, Kbd, StatusPill } from '../ui'
import { MobileMenuButton } from './Sidebar'

export function TopBar({
  onOpenMobile,
  onOpenPalette,
  collapsed,
  onExpand,
}: {
  onOpenMobile: () => void
  onOpenPalette: () => void
  collapsed: boolean
  onExpand: () => void
}) {
  const { state } = useDemo()
  const location = useLocation()
  const navigate = useNavigate()
  const meta = pageTitle(location.pathname)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const initials = state.settings.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const recent = [...state.projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4)
  const alerts = state.projects.filter((p) => p.status === 'failed').length
  const active = state.projects.filter((p) => p.status === 'running').length

  useEffect(() => {
    if (!notifOpen) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setNotifOpen(false)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', key)
    }
  }, [notifOpen])

  return (
    <header className="sticky top-0 z-40 flex h-[62px] items-center gap-2 border-b border-white/[0.06] bg-[#07090d]/78 px-3 backdrop-blur-xl sm:gap-3 sm:px-6">
      <MobileMenuButton onClick={onOpenMobile} />
      {collapsed ? (
        <IconButton label="Expand sidebar" icon={PanelLeftOpen} onClick={onExpand} className="hidden lg:inline-flex" />
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden text-[11.5px] text-txt-faint sm:inline">{meta.parent}</span>
        <span className="hidden text-txt-faint/40 sm:inline">/</span>
        <span className="truncate text-[13px] font-medium text-txt">{meta.title}</span>
        <span className="hidden items-center gap-1.5 md:flex">
          {active > 0 ? (
            <Badge tone="cyan" className="ml-2">
              <Dot tone="cyan" pulse />
              {active} producing
            </Badge>
          ) : null}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onOpenPalette}
          className="hidden h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] pl-2.5 pr-2 text-[12px] text-txt-faint transition-colors hover:border-white/20 hover:text-txt-muted md:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="pr-6">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        <IconButton label="Search" icon={Search} onClick={onOpenPalette} className="md:hidden" />

        <Badge tone="cyan" mono className="hidden sm:inline-flex">
          Demo build
        </Badge>

        <div ref={notifRef} className="relative hidden sm:block">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-txt-muted transition-colors hover:bg-white/[0.05] hover:text-txt"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {alerts > 0 ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
            ) : active > 0 ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
            ) : null}
          </button>
          {notifOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-[320px] animate-fade-up overflow-hidden rounded-xl border border-white/10 bg-[#0c1219]/97 shadow-lift backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                <span className="text-[12.5px] font-medium text-txt">Studio activity</span>
                <Badge mono>local</Badge>
              </div>
              <div className="max-h-[320px] overflow-y-auto scroll-thin py-1">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setNotifOpen(false)
                      navigate(`/productions/${p.id}`)
                    }}
                    className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="mt-1.5">
                      <Dot
                        tone={p.status === 'failed' ? 'rose' : p.status === 'completed' ? 'green' : 'cyan'}
                        pulse={p.status === 'running'}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-txt">{p.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10.5px] text-txt-faint">
                        <StatusPill status={p.status} />
                        <span>{relativeTime(p.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <Link
                to="/productions"
                onClick={() => setNotifOpen(false)}
                className="block border-t border-white/[0.07] px-4 py-2.5 text-center text-[11.5px] text-cyan hover:bg-cyan/[0.05]"
              >
                Open active productions
              </Link>
            </div>
          ) : null}
        </div>

        <Link to="/settings" aria-label="Profile and settings" className="rounded-full focus-ring">
          <Avatar initials={initials} name={state.settings.name} className={cx('h-8 w-8')} />
        </Link>
      </div>
    </header>
  )
}
