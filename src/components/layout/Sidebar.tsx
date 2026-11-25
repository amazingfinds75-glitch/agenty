import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { NAV_GROUPS, NAV_ITEMS } from '../../lib/nav'
import { useDemo } from '../../lib/store'
import { cx } from '../../lib/utils'
import { Wordmark } from '../Brand'
import { Avatar, Badge, IconButton } from '../ui'

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
  onOpenPalette,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  onOpenPalette: () => void
}) {
  const { state } = useDemo()
  const location = useLocation()
  const navigate = useNavigate()
  const runningCount = state.projects.filter(
    (p) => p.status === 'running' || p.status === 'paused',
  ).length
  const initials = state.settings.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  useEffect(() => {
    if (mobileOpen) onMobileClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen, onMobileClose])

  const content = (
    <div className="flex h-full min-h-[480px] flex-col">
      <div className={cx('flex h-[62px] items-center gap-2 border-b border-white/[0.06] px-4', collapsed && 'justify-center px-0')}>
        <NavLink to="/" className="min-w-0 focus-ring rounded-md" aria-label="AI Viral Studio home">
          <Wordmark compact={collapsed} />
        </NavLink>
        <div className="ml-auto flex items-center gap-1">
          {!collapsed ? (
            <IconButton
              label="Collapse sidebar"
              icon={PanelLeftClose}
              onClick={onToggleCollapse}
              className="hidden lg:inline-flex"
            />
          ) : null}
          <IconButton label="Close navigation" icon={X} onClick={onMobileClose} className="lg:hidden" />
        </div>
      </div>

      <div className={cx('px-3 pt-3', collapsed && 'px-2')}>
        {collapsed ? (
          <IconButton
            label="New chat"
            icon={Plus}
            onClick={() => navigate('/')}
            className="h-10 w-full rounded-xl border border-cyan/25 bg-cyan/10 text-cyan hover:bg-cyan/15"
          />
        ) : (
          <button
            onClick={() => navigate('/')}
            className="group flex h-10 w-full items-center gap-2 rounded-xl border border-cyan/20 bg-[linear-gradient(180deg,rgba(0,212,255,0.13),rgba(0,212,255,0.05))] px-3 text-[13px] font-medium text-cyan transition-colors hover:border-cyan/40 hover:bg-cyan/[0.12]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New production
            <span className="ml-auto rounded border border-cyan/20 bg-cyan/[0.08] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-cyan/80">
              ⌘K
            </span>
          </button>
        )}
        <button
          onClick={onOpenPalette}
          className={cx(
            'mt-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] text-txt-faint transition-colors hover:bg-white/[0.04] hover:text-txt-muted',
            collapsed && 'justify-center px-0',
          )}
          aria-label="Search workspace"
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!collapsed ? (
            <>
              <span className="truncate">Search workspace</span>
              <span className="ml-auto font-mono text-[9px] text-txt-faint">⌘K</span>
            </>
          ) : null}
        </button>
      </div>

      <nav className="scroll-thin mt-2 flex-1 overflow-y-auto px-2 pb-4" aria-label="Primary">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group.id)
          if (!items.length) return null
          return (
            <div key={group.id} className="mt-3">
              {!collapsed ? (
                <div className="label px-2.5 pb-1.5 text-[9px] tracking-[0.2em] text-txt-faint">{group.label}</div>
              ) : (
                <div className="mx-auto mb-1.5 h-px w-5 bg-white/10" />
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.to === '/'
                      ? location.pathname === '/' || location.pathname.startsWith('/c/')
                      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                  const count =
                    item.to === '/productions' && runningCount > 0 ? runningCount : undefined
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={cx(
                        'group relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] transition-colors duration-150',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-[linear-gradient(90deg,rgba(0,212,255,0.13),rgba(0,212,255,0.03))] font-medium text-txt'
                          : 'text-txt-muted hover:bg-white/[0.045] hover:text-txt',
                      )}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
                      ) : null}
                      <item.icon
                        className={cx('h-[15px] w-[15px] shrink-0', active ? 'text-cyan' : 'text-txt-faint group-hover:text-txt-muted')}
                        aria-hidden="true"
                      />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      {!collapsed && count ? (
                        <span className="ml-auto rounded-full border border-cyan/20 bg-cyan/10 px-1.5 py-[1px] font-mono text-[9.5px] text-cyan">
                          {count}
                        </span>
                      ) : null}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className={cx('border-t border-white/[0.06] px-2 py-2.5', collapsed && 'px-1.5')}>
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <Badge tone="cyan" mono className="shrink-0">
              Demo
            </Badge>
            <span className="text-[10.5px] leading-tight text-txt-faint">
              Simulated engine · local data only
            </span>
          </div>
        ) : null}
        <NavLink
          to="/verification"
          title="Verification"
          className={({ isActive }) =>
            cx(
              'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12px] transition-colors',
              collapsed && 'justify-center px-0',
              isActive ? 'bg-white/[0.06] text-txt' : 'text-txt-faint hover:bg-white/[0.04] hover:text-txt-muted',
            )
          }
        >
          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!collapsed ? 'Verification' : null}
        </NavLink>
        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) =>
            cx(
              'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12px] transition-colors',
              collapsed && 'justify-center px-0',
              isActive ? 'bg-white/[0.06] text-txt' : 'text-txt-faint hover:bg-white/[0.04] hover:text-txt-muted',
            )
          }
        >
          <SettingsIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!collapsed ? 'Settings' : null}
        </NavLink>

        <NavLink
          to="/settings"
          className={cx(
            'mt-1 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.045]',
            collapsed && 'justify-center border-transparent bg-transparent px-0',
          )}
          title="Profile and preferences"
        >
          <Avatar initials={initials} name={state.settings.name} />
          {!collapsed ? (
            <>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-txt">{state.settings.name}</div>
                <div className="truncate text-[10.5px] text-txt-faint">{state.settings.role}</div>
              </div>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-txt-faint" aria-hidden="true" />
            </>
          ) : null}
        </NavLink>
      </div>
    </div>
  )

  return (
    <>
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 hidden shrink-0 scroll-thin overflow-y-auto border-r border-white/[0.06] bg-[#080b11]/92 backdrop-blur-xl transition-[width] duration-300 ease-smooth lg:block',
          collapsed ? 'w-[74px]' : 'w-[252px]',
        )}
        aria-label="Sidebar"
      >
        {content}
      </aside>

      <div
        className={cx('fixed inset-0 z-[60] lg:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <div
          className={cx(
            'absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onMobileClose}
        />
        <aside
          className={cx(
            'absolute inset-y-0 left-0 w-[282px] scroll-thin overflow-y-auto border-r border-white/10 bg-[#080b11] shadow-lift transition-transform duration-300 ease-smooth',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-label="Mobile navigation"
        >
          {content}
        </aside>
      </div>
    </>
  )
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('avs-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('avs-sidebar-collapsed', collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])
  return { collapsed, setCollapsed }
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-txt-muted transition-colors hover:bg-white/5 hover:text-txt lg:hidden"
    >
      <span className="sr-only">Open navigation</span>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M3 6h14M3 10h14M3 14h9" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export function SidebarOpenButton({ onClick }: { onClick: () => void }) {
  return <IconButton label="Expand sidebar" icon={PanelLeftOpen} onClick={onClick} className="hidden lg:inline-flex" />
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}
