import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Info, RefreshCcw } from 'lucide-react'
import { useLiveTrends } from '../../lib/useLive'
import { cx, relativeTime } from '../../lib/utils'

const SOURCE_DOT: Record<string, string> = {
  'google-trends': 'bg-violet-400',
  'hacker-news': 'bg-amber-300',
  youtube: 'bg-rose-400',
}

export function LiveDeskCard() {
  const { data, state, error, refreshing, reload } = useLiveTrends()
  const signals = data?.signals.slice(0, 3) ?? []

  return (
    <section className="panel overflow-hidden" aria-label="Live web desk">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-cyan" aria-hidden="true" />
          <span className="text-[12px] font-medium text-txt">Live desk</span>
          <span
            className={cx(
              'h-1.5 w-1.5 rounded-full',
              state === 'live' ? 'bg-emerald-400' : state === 'offline' ? 'bg-rose-400' : 'bg-slate-500',
            )}
            title={state === 'live' ? 'Live sources connected' : state === 'offline' ? 'Backend offline' : 'Checking backend'}
          />
        </div>
        <div className="flex items-center gap-2">
          {data?.fetchedAt ? (
            <span className="font-mono text-[8.5px] text-txt-faint">fetched {relativeTime(data.fetchedAt)}</span>
          ) : null}
          <Link to="/trends" className="inline-flex items-center gap-0.5 text-[9.5px] text-cyan/85 hover:text-cyan">
            Open desk <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="px-4 py-2.5">
        {state === 'loading' ? (
          <div className="space-y-1.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-6 animate-pulse rounded bg-white/[0.03]" />
            ))}
          </div>
        ) : state === 'offline' ? (
          <div>
            <p className="text-[10px] leading-relaxed text-txt-faint">
              Backend offline — demo signals only. {error ? <span className="block font-mono text-[8.5px] opacity-70">{error}</span> : null}
            </p>
            <button
              onClick={() => void reload(false)}
              disabled={refreshing}
              className="mt-1.5 inline-flex items-center gap-1 text-[9px] text-cyan/75 hover:text-cyan disabled:opacity-50"
            >
              <RefreshCcw className={cx('h-2.5 w-2.5', refreshing && 'animate-spin')} aria-hidden="true" /> Retry
            </button>
          </div>
        ) : data ? (
          <>
            <ul className="space-y-1.5">
              {signals.map((signal) => (
                <li key={signal.key}>
                  <Link to="/trends" className="group flex items-center gap-2">
                    <span className={cx('h-1 w-1 shrink-0 rounded-full', SOURCE_DOT[signal.sourceId] ?? 'bg-slate-500')} />
                    <span className="min-w-0 flex-1 truncate text-[10px] text-txt-muted group-hover:text-txt" title={signal.title}>
                      {signal.title}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-cyan tnum">{signal.score}</span>
                  </Link>
                </li>
              ))}
              {!signals.length ? <li className="text-[10px] text-txt-faint">No live signals in this fetch.</li> : null}
            </ul>
            <p className="mt-2 flex items-start gap-1.5 border-t border-white/[0.05] pt-2 text-[8.5px] leading-relaxed text-txt-faint">
              <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              {data.signals.length} real headlines · {data.sources.filter((source) => source.status === 'connected').length} sources · heuristic
              scores, not platform analytics.
              {data.errors.length ? <span className="text-amber-300/80"> Partial fetch.</span> : null}
            </p>
          </>
        ) : null}
      </div>
    </section>
  )
}
