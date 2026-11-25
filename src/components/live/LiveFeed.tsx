import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Info,
  Loader2,
  RefreshCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WifiOff,
  X,
} from 'lucide-react'
import { Badge, Button, Modal, Select, Sparkline, Textarea } from '../ui'
import { useDemo } from '../../lib/store'
import type { Language, Platform } from '../../lib/types'
import {
  analyzeLiveSignal,
  errorMessage,
  type LiveAnalysisResponse,
  type LiveSignal,
} from '../../lib/live'
import { useLiveHistory, useLiveTrends } from '../../lib/useLive'
import { cx, relativeTime } from '../../lib/utils'
import { LiveChart } from './LiveChart'

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'kn', label: 'Kannada' },
]

const SOURCE_DOT: Record<string, string> = {
  'google-trends': 'bg-violet-400',
  'hacker-news': 'bg-amber-300',
  youtube: 'bg-rose-400',
}

function scoreTone(score: number) {
  if (score >= 90) return 'border-cyan/30 bg-cyan/[0.08] text-cyan'
  if (score >= 75) return 'border-violet/25 bg-violet/[0.08] text-violet-200'
  return 'border-white/10 bg-white/[0.03] text-txt-muted'
}

function GrowthChip({ growth }: { growth: number | null }) {
  if (growth == null) {
    return (
      <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-txt-faint">
        new
      </span>
    )
  }
  const up = growth >= 0
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] tnum',
        up ? 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300' : 'border-rose-400/20 bg-rose-400/[0.06] text-rose-300',
      )}
    >
      {up ? <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" /> : <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />}
      {up ? '+' : ''}
      {growth}%
    </span>
  )
}

function briefFor(signal: LiveSignal) {
  const growth =
    signal.growth == null
      ? 'first local snapshot'
      : `${signal.growth >= 0 ? '+' : ''}${signal.growth}% across ${signal.points} local snapshots`
  return [
    `Create a short video on this live topic: "${signal.title}".`,
    '',
    signal.snippet ? `Live headline: ${signal.snippet}` : '',
    `Signal: ${signal.source} rank #${signal.rank} · ${signal.metricLabel} · opportunity score ${signal.score}/100 (${growth}).`,
    `Source: ${signal.url}`,
    '',
    'Use the live signal as research context. Verify every claim against the linked source before publishing.',
  ]
    .filter((line, index) => line !== '' || index === 1)
    .join('\n')
}

export function LiveFeed() {
  const navigate = useNavigate()
  const { actions, pushToast } = useDemo()
  const { data, state, error, refreshing, reload } = useLiveTrends()
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<LiveSignal | null>(null)
  const { history, loading: historyLoading, error: historyError } = useLiveHistory(expanded)
  const [analyses, setAnalyses] = useState<Record<string, LiveAnalysisResponse>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [produceSignal, setProduceSignal] = useState<LiveSignal | null>(null)
  const [draft, setDraft] = useState('')
  const [platform, setPlatform] = useState<Platform>('youtube-short')
  const [language, setLanguage] = useState<Language>('en')

  useEffect(() => {
    if (!expanded || !data) return
    const fresh = data.signals.find((signal) => signal.key === expanded.key)
    if (fresh && fresh !== expanded) setExpanded(fresh)
  }, [data, expanded])

  useEffect(() => {
    setAnalysisError(null)
  }, [expanded?.key])

  useEffect(() => {
    if (filter !== 'all' && data && !data.signals.some((signal) => signal.source === filter)) setFilter('all')
  }, [data, filter])

  const sources = useMemo(
    () => Array.from(new Set((data?.signals ?? []).map((signal) => signal.source))),
    [data],
  )
  const filtered = useMemo(
    () => (data?.signals ?? []).filter((signal) => filter === 'all' || signal.source === filter),
    [data, filter],
  )
  const visible = showAll ? filtered : filtered.slice(0, 6)
  const onlineSources = data?.sources.filter((source) => source.status === 'connected').length ?? 0
  const topScore = data?.signals.length ? Math.max(...data.signals.map((signal) => signal.score)) : 0
  const selectedAnalysis = expanded ? analyses[expanded.key] : undefined

  const runAnalysis = async () => {
    if (!expanded || analyzing) return
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const result = await analyzeLiveSignal(expanded, history)
      setAnalyses((prev) => ({ ...prev, [expanded.key]: result }))
    } catch (caught) {
      setAnalysisError(errorMessage(caught))
    } finally {
      setAnalyzing(false)
    }
  }

  const openProduce = (signal: LiveSignal) => {
    setProduceSignal(signal)
    setDraft(briefFor(signal))
    setPlatform('youtube-short')
    setLanguage('en')
  }

  const startProduction = () => {
    if (!produceSignal || !draft.trim()) return
    const result = actions.sendPrompt({ text: draft.trim(), sessionId: null, platform, language })
    const title = produceSignal.title
    setProduceSignal(null)
    pushToast({
      tone: 'info',
      title: 'Live topic sent to the Executive Producer',
      description: `“${title}” is starting the 13-stage local pipeline.`,
    })
    navigate(result.sessionId ? `/c/${result.sessionId}` : '/')
  }

  return (
    <section className="panel mt-5 overflow-hidden" aria-labelledby="live-desk-heading">
      <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/[0.06]">
              <Activity className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 id="live-desk-heading" className="text-[13px] font-semibold text-txt">
                  Live web desk
                </h2>
                <Badge mono tone="cyan" className="px-1.5 py-[1px] text-[8px]">
                  REAL FEEDS
                </Badge>
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-txt-faint">
                Google Trends RSS and Hacker News, fetched by your local backend. Scores and charts are local heuristics.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-txt-faint">
              <span
                className={cx(
                  'h-1.5 w-1.5 rounded-full',
                  state === 'live' ? 'bg-emerald-400' : state === 'offline' ? 'bg-rose-400' : 'bg-slate-500',
                )}
              />
              {state === 'live' ? 'Connected' : state === 'offline' ? 'Offline' : 'Checking'}
            </span>
            {state === 'live' && data?.fetchedAt ? (
              <span className="font-mono text-[9px] text-txt-faint">fetched {relativeTime(data.fetchedAt)}</span>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              icon={refreshing ? Loader2 : RefreshCcw}
              onClick={() => void reload(true)}
              disabled={refreshing || state === 'loading'}
            >
              {refreshing ? 'Refreshing' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3.5 sm:px-5">
        {state === 'loading' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-[172px] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
            ))}
          </div>
        ) : state === 'offline' ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5">
            <div className="flex items-start gap-2.5">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-amber-100">Live backend is not running</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-txt-muted">
                  Start it with <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px]">npm run server</code>. For the
                  Vite dev app, restart the dev server once so the <code className="font-mono">/api</code> proxy loads, or run{' '}
                  <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px]">npm run build</code> and let the backend serve
                  the app. The curated demo library below still works offline.
                </p>
                {error ? <p className="mt-1 font-mono text-[9.5px] text-amber-200/70">{error}</p> : null}
                <Button size="sm" variant="secondary" icon={RefreshCcw} onClick={() => void reload(false)} className="mt-2.5">
                  Retry connection
                </Button>
              </div>
            </div>
          </div>
        ) : data ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {data.sources.map((source) => (
                <span
                  key={source.id}
                  title={`${source.detail}${source.lastError ? ` Last error: ${source.lastError}` : ''}`}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px]',
                    source.status === 'connected'
                      ? 'border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200/90'
                      : source.status === 'error'
                        ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200/90'
                        : 'border-white/10 bg-white/[0.02] text-txt-faint',
                  )}
                >
                  <span className={cx('h-1.5 w-1.5 rounded-full', SOURCE_DOT[source.id] ?? 'bg-slate-500')} />
                  {source.name}
                  <span className="font-mono text-[8px] uppercase tracking-wide opacity-70">
                    {source.status === 'connected' ? `${source.count} items` : source.status === 'not-configured' ? 'key needed' : source.status}
                  </span>
                </span>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] text-txt-faint">
              <span>
                <b className="text-txt-muted">{data.signals.length}</b> live signals
              </span>
              <span>
                <b className="text-txt-muted">{onlineSources}</b>/{data.sources.length} sources online
              </span>
              <span>
                top score <b className="text-cyan">{topScore}</b>
              </span>
              {data.refreshSeconds ? <span>service refresh ≈ {Math.round(data.refreshSeconds / 60)} min</span> : null}
              {data.stale ? <span className="text-amber-300">showing last successful fetch</span> : null}
              {data.throttled ? <span className="text-amber-300">refresh limited to once per minute</span> : null}
            </div>

            {data.errors.length ? (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-300/85">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                Partial fetch: {data.errors.join(' · ')}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setFilter('all')}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-[10.5px] transition-colors',
                  filter === 'all'
                    ? 'border-cyan/30 bg-cyan/[0.08] text-cyan'
                    : 'border-white/10 bg-white/[0.02] text-txt-faint hover:text-txt-muted',
                )}
              >
                All sources ({data.signals.length})
              </button>
              {sources.map((source) => {
                const count = data.signals.filter((signal) => signal.source === source).length
                return (
                  <button
                    key={source}
                    onClick={() => setFilter(source)}
                    className={cx(
                      'rounded-full border px-2.5 py-1 text-[10.5px] transition-colors',
                      filter === source
                        ? 'border-cyan/30 bg-cyan/[0.08] text-cyan'
                        : 'border-white/10 bg-white/[0.02] text-txt-faint hover:text-txt-muted',
                    )}
                  >
                    {source} ({count})
                  </button>
                )
              })}
              {filtered.length > 6 ? (
                <button onClick={() => setShowAll((value) => !value)} className="ml-auto text-[10px] text-cyan/80 hover:text-cyan">
                  {showAll ? 'Show top 6' : `Show all ${filtered.length}`}
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((signal) => (
                <article
                  key={signal.key}
                  className="flex flex-col rounded-xl border border-white/[0.08] bg-[#0a0f16]/70 p-3.5 transition-colors hover:border-white/[0.15]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">
                      {signal.source} · #{signal.rank}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <GrowthChip growth={signal.growth} />
                      <span className={cx('rounded border px-1.5 py-0.5 font-mono text-[10px] tnum', scoreTone(signal.score))}>
                        {signal.score}
                      </span>
                    </div>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-[12.5px] font-medium leading-snug text-txt" title={signal.title}>
                    {signal.title}
                  </h3>
                  {signal.snippet ? (
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-txt-faint">{signal.snippet}</p>
                  ) : null}
                  <div className="mt-2.5 flex items-end justify-between gap-2">
                    {signal.sparkline.length >= 2 ? (
                      <Sparkline values={signal.sparkline} className="h-8 w-24" />
                    ) : (
                      <span className="font-mono text-[9px] text-txt-faint">{signal.points || 1} snapshot</span>
                    )}
                    <div className="text-right">
                      <p className="font-mono text-[9.5px] text-txt-muted">{signal.metricLabel}</p>
                      <p className="text-[8.5px] text-txt-faint">
                        {signal.publishedAt ? relativeTime(signal.publishedAt) : 'live feed'}
                      </p>
                    </div>
                  </div>
                  {signal.alsoOn?.length ? (
                    <p className="mt-1.5 text-[8.5px] text-txt-faint">Also on {signal.alsoOn.join(' · ')}</p>
                  ) : null}
                  <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[9.5px] text-txt-faint transition-colors hover:text-txt-muted"
                    >
                      Source <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
                    </a>
                    <button
                      onClick={() => setExpanded(signal)}
                      aria-pressed={expanded?.key === signal.key}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9.5px] transition-colors',
                        expanded?.key === signal.key
                          ? 'border-cyan/30 bg-cyan/[0.06] text-cyan'
                          : 'border-white/10 text-txt-muted hover:border-white/20 hover:text-txt',
                      )}
                    >
                      <BarChart3 className="h-2.5 w-2.5" aria-hidden="true" /> Chart &amp; AI
                    </button>
                    <Button size="sm" variant="primary" icon={Sparkles} className="ml-auto" onClick={() => openProduce(signal)}>
                      Produce
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            {expanded ? (
              <div className="mt-3 rounded-xl border border-cyan/20 bg-cyan/[0.025] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-txt" title={expanded.title}>
                        {expanded.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] text-txt-faint">
                        {expanded.source} · rank #{expanded.rank} · score {expanded.score} · {expanded.metricLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={expanded.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[9.5px] text-txt-faint hover:text-txt-muted"
                    >
                      Open source <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
                    </a>
                    <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => openProduce(expanded)}>
                      Produce
                    </Button>
                    <button
                      onClick={() => setExpanded(null)}
                      aria-label="Close chart and analysis"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-txt-faint hover:bg-white/[0.05] hover:text-txt"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="label text-[9px]">Opportunity score · server snapshots</span>
                      <span className="font-mono text-[9px] text-txt-faint">
                        {history ? `${history.samples} samples` : historyLoading ? 'loading' : 'no samples'}
                      </span>
                    </div>
                    <div className="mt-1">
                      {historyLoading ? (
                        <div className="h-[124px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]" />
                      ) : (
                        <LiveChart points={history?.points ?? []} label={expanded.title} />
                      )}
                    </div>
                    {history ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-txt-faint">
                        <span>{history.spanMinutes} min span</span>
                        <span>best rank #{history.bestRank}</span>
                        <span className={history.deltaScore >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                          {history.deltaScore >= 0 ? '+' : ''}
                          {history.deltaScore} score
                        </span>
                        <span>{history.note}</span>
                      </div>
                    ) : historyError ? (
                      <p className="mt-1 text-[9.5px] text-txt-faint">{historyError}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col rounded-lg border border-white/[0.06] bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label text-[9px]">Signal analysis</span>
                      {selectedAnalysis ? (
                        <Badge mono tone={selectedAnalysis.engine === 'ai' ? 'cyan' : 'warn'} className="px-1.5 py-[1px] text-[8px]">
                          {selectedAnalysis.engine === 'ai' ? 'AI' : 'LOCAL HEURISTIC'}
                        </Badge>
                      ) : null}
                    </div>

                    {analyzing ? (
                      <div className="flex flex-1 items-center justify-center gap-1.5 py-6 text-[10.5px] text-txt-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading signal and chart…
                      </div>
                    ) : analysisError ? (
                      <div className="mt-2">
                        <p className="text-[10px] leading-relaxed text-rose-300">{analysisError}</p>
                        <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => void runAnalysis()} className="mt-2">
                          Retry analysis
                        </Button>
                      </div>
                    ) : selectedAnalysis ? (
                      <div className="mt-2 space-y-2.5">
                        <p className="font-mono text-[8.5px] uppercase tracking-wide text-txt-faint">
                          {selectedAnalysis.engine === 'ai'
                            ? `${selectedAnalysis.provider} · ${selectedAnalysis.model} · ${(selectedAnalysis.latencyMs / 1000).toFixed(1)}s`
                            : 'No model called · computed by the local backend'}
                        </p>
                        {selectedAnalysis.warning ? (
                          <p className="flex items-start gap-1.5 text-[9.5px] leading-relaxed text-amber-300/85">
                            <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" /> {selectedAnalysis.warning}
                          </p>
                        ) : null}
                        {selectedAnalysis.aiError ? (
                          <p className="font-mono text-[8.5px] leading-relaxed text-rose-300/80">{selectedAnalysis.aiError}</p>
                        ) : null}
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-txt-faint">Angle</p>
                          <p className="mt-0.5 text-[10.5px] leading-relaxed text-txt-muted">{selectedAnalysis.analysis.angle}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-txt-faint">Audience</p>
                          <p className="mt-0.5 text-[10.5px] leading-relaxed text-txt-muted">{selectedAnalysis.analysis.audience}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-txt-faint">Hooks</p>
                          <ul className="mt-1 space-y-1">
                            {selectedAnalysis.analysis.hooks.map((hook, index) => (
                              <li key={hook} className="flex gap-1.5 text-[10.5px] leading-relaxed text-txt-muted">
                                <span className="font-mono text-[8.5px] text-cyan/70">{index + 1}</span>
                                {hook}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-txt-faint">Risks</p>
                          <ul className="mt-1 space-y-1">
                            {selectedAnalysis.analysis.risks.map((risk) => (
                              <li key={risk} className="flex gap-1.5 text-[10px] leading-relaxed text-amber-200/80">
                                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-txt-faint">Chart read</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-txt-muted">{selectedAnalysis.analysis.chartRead}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                          <span className="font-mono text-[8.5px] uppercase tracking-wide text-txt-faint">
                            confidence {selectedAnalysis.analysis.confidence}
                          </span>
                          <button onClick={() => void runAnalysis()} className="text-[9.5px] text-cyan/80 hover:text-cyan">
                            Re-run analysis
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-[10.5px] leading-relaxed text-txt-faint">
                          Ask the backend to read this signal against its chart history. With no AI key configured it returns a clearly
                          labeled local heuristic instead of pretending to call a model.
                        </p>
                        <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => void runAnalysis()} className="mt-2.5">
                          Analyze signal
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              Public-feed headlines only. Opportunity scores are a local heuristic, not platform analytics. Chart history is stored on
              the server and grows each refresh; AI analysis uses your configured provider or the labeled local fallback. The curated
              demo library below is separate.
            </p>
          </>
        ) : null}
      </div>

      <Modal
        open={Boolean(produceSignal)}
        onClose={() => setProduceSignal(null)}
        title="Produce from this live signal"
        description={
          produceSignal
            ? `${produceSignal.source} · rank #${produceSignal.rank} · ${produceSignal.metricLabel}`
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProduceSignal(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Sparkles} disabled={!draft.trim()} onClick={startProduction}>
              Start production
            </Button>
          </>
        }
      >
        {produceSignal ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="label text-[9px]">Live signal</div>
                  <p className="mt-1 text-[12px] font-medium leading-snug text-txt">{produceSignal.title}</p>
                  {produceSignal.snippet ? (
                    <p className="mt-1 text-[10.5px] leading-relaxed text-txt-faint">{produceSignal.snippet}</p>
                  ) : null}
                </div>
                <span className={cx('shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tnum', scoreTone(produceSignal.score))}>
                  {produceSignal.score}
                </span>
              </div>
              <a
                href={produceSignal.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan"
              >
                Open original source <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </a>
              {data?.fetchedAt ? (
                <p className="mt-1 font-mono text-[8.5px] text-txt-faint">
                  Fetched {relativeTime(data.fetchedAt)} by your local backend · {produceSignal.points || 1} snapshot
                  {produceSignal.points === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-txt-muted">
                Platform
                <Select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)} className="mt-1">
                  <option value="youtube-short">YouTube Short</option>
                  <option value="instagram-reel">Instagram Reel</option>
                  <option value="youtube-long">Long-form video</option>
                </Select>
              </label>
              <label className="text-[11px] text-txt-muted">
                Language
                <Select value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="mt-1">
                  {LANGUAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <label className="block text-[11px] text-txt-muted">
              Brief for the Executive Producer
              <Textarea className="mt-1" rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              This starts the 13-stage local simulation. The live headline and link are carried into the brief; you can render a real
              local cut in the workspace. Nothing is published automatically, and claims need human verification.
            </p>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
