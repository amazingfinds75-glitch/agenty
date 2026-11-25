import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { pageTitle } from '../../lib/nav'
import { cx } from '../../lib/utils'
import { RouteBoundary } from '../ErrorBoundary'
import { CommandPalette } from './CommandPalette'
import { MobileTabBar } from './MobileTabBar'
import { Sidebar, useSidebarCollapsed } from './Sidebar'
import { Toasts } from './Toasts'
import { TopBar } from './TopBar'

export function AppLayout() {
  const { collapsed, setCollapsed } = useSidebarCollapsed()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const firstRender = useRef(true)

  useEffect(() => {
    const meta = pageTitle(location.pathname)
    const title =
      location.pathname === '/'
        ? 'Workspace'
        : location.pathname.startsWith('/c/')
          ? 'Conversation'
          : meta.title === 'AI Viral Studio'
            ? 'Not found'
            : meta.title
    document.title = `${title} · AI Viral Studio`
    window.scrollTo({ top: 0 })
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [location.pathname])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-bg noise relative min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-cyan focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#03131a]"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(true)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div
        className={cx(
          'relative z-[2] flex min-h-dvh flex-col transition-[padding-left] duration-300 ease-smooth',
          collapsed ? 'lg:pl-[74px]' : 'lg:pl-[252px]',
        )}
      >
        <TopBar
          onOpenMobile={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
        />
        <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
          <div key={location.pathname} className="flex min-h-0 flex-1 flex-col animate-fade-in">
            <RouteBoundary routeKey={location.pathname}>
              <Outlet />
            </RouteBoundary>
          </div>
          {location.pathname !== '/' && !location.pathname.startsWith('/c/') ? (
            <div className="h-[calc(58px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" aria-hidden="true" />
          ) : null}
        </main>
      </div>
      <MobileTabBar onMore={() => setMobileOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toasts />
    </div>
  )
}
