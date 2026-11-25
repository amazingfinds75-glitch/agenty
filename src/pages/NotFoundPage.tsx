import { Link } from 'react-router-dom'
import { ArrowLeft, Home, LayoutGrid } from 'lucide-react'
import { Button } from '../components/ui'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan/70">404 · Page not found</p>
        <h1 className="mt-3 font-display text-[30px] font-semibold tracking-tight text-txt">
          This room doesn’t exist.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-txt-muted">
          The link may be outdated, or the production it pointed to was removed. Everything else is still in the studio.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/">
            <Button variant="primary" icon={Home}>
              New production
            </Button>
          </Link>
          <Link to="/productions">
            <Button variant="secondary" icon={LayoutGrid}>
              Active productions
            </Button>
          </Link>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  )
}
