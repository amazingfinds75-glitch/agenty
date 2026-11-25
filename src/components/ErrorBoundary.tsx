import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Button } from './ui'

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ai-viral-studio] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-400/20 bg-white/[0.03] p-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/10 text-rose-300">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-lg font-semibold text-txt">This screen hit an error</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-txt-muted">
            Something failed while rendering. Your workspace data is stored locally and has not been
            deleted. Reload to continue, or head back to the workspace.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reload app
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.assign('#/')}>
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Back to workspace
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

export function RouteBoundary({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  return <Boundary key={routeKey}>{children}</Boundary>
}
