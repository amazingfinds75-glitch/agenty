import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Flame,
  Info,
  Lightbulb,
  Plus,
  Radar,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  Badge,
  Button,
  Delta,
  EmptyState,
  Input,
  Modal,
  Select,
  Sparkline,
  Stat,
  Textarea,
} from '../components/ui'
import { PlatformMark } from '../components/Brand'
import { LiveFeed } from '../components/live/LiveFeed'
import { useDemo } from '../lib/store'
import type { Language, Platform, Trend } from '../lib/types'
import { cx, platformLabel } from '../lib/utils'

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'kn', label: 'Kannada' },
]

export default function TrendsPage() {
  const { state, actions, pushToast } = useDemo()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'score' | 'growth'>('score')
  const [selected, setSelected] = useState<Trend | null>(null)
  const [draft, setDraft] = useState('')
  const [platform, setPlatform] = useState<Platform>('youtube-short')
  const [language, setLanguage] = useState<Language>('en')

  const categories = useMemo(() => ['all', ...Array.from(new Set(state.trends.map((t) => t.category)))], [state.trends])

  const trends = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...state.trends]
      .filter((t) => category === 'all' || t.category === category)
      .filter((t) => !q || `${t.title} ${t.summary} ${t.category}`.toLowerCase().includes(q))
      .sort((a, b) => (sort === 'score' ? b.score - a.score : b.growth - a.growth))
  }, [state.trends, query, category, sort])

  const fastest = [...state.trends].sort((a, b) => b.growth - a.growth)[0]
  const avgScore = state.trends.length
    ? Math.round(state.trends.reduce((sum, t) => sum + t.score, 0) / state.trends.length)
    : 0
  const coveredPlatforms = new Set(state.trends.flatMap((t) => t.platforms)).size

  const openBrief = (trend: Trend) => {
    setSelected(trend)
    setPlatform(trend.platforms[0] ?? 'youtube-short')
    setLanguage('en')
    setDraft(
      `Create a ${platformLabel(trend.platforms[0] ?? 'youtube-short')} explaining this trend: "${trend.title}". Open with this angle: ${trend.hooks[0]}`,
    )
  }

  const startProduction = () => {
    if (!selected || !draft.trim()) return
    const result = actions.sendPrompt({
      text: draft.trim(),
      sessionId: null,
      platform,
      language,
    })
    setSelected(null)
    pushToast({ tone: 'info', title: 'Brief sent to the Executive Producer', description: 'The team is building a production plan.' })
    navigate(result.sessionId ? `/c/${result.sessionId}` : '/')
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Trend Intelligence</h1>
            <Badge mono tone="cyan">Demo + live</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Turn a live headline or a curated demo signal into a production brief with chart history and analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-txt-faint sm:flex">
            <Info className="h-3 w-3" aria-hidden="true" /> Demo library stays curated
          </div>
          <Button variant="primary" icon={Plus} onClick={() => { actions.newChat(); navigate('/') }}>
            New brief
          </Button>
        </div>
      </div>

      <LiveFeed />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-txt">Demo signal library</h2>
          <p className="mt-0.5 text-[11px] text-txt-faint">Illustrative signals bundled with the app. Works offline; not refreshed from the web.</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">curated · not live</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Tracked topics" value={String(state.trends.length)} hint="Across niches" icon={Radar} />
        <Stat label="Avg. opportunity" value={String(avgScore)} hint="Composite score /100" icon={Sparkles} tone="violet" />
        <Stat label="Fastest riser" value={`+${fastest?.growth ?? 0}%`} hint={fastest?.category ?? '—'} icon={Flame} tone="amber" />
        <Stat label="Platforms covered" value={String(coveredPlatforms)} hint="YouTube & Instagram" icon={TrendingUp} tone="emerald" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cx(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              category === cat
                ? 'border-cyan/30 bg-cyan/[0.08] text-cyan'
                : 'border-white/10 bg-white/[0.02] text-txt-faint hover:text-txt-muted',
            )}
          >
            {cat === 'all' ? 'All categories' : cat}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
            {(['score', 'growth'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSort(option)}
                className={cx(
                  'rounded-md px-2 py-1 font-mono text-[10px] capitalize transition-colors',
                  sort === option ? 'bg-white/[0.08] text-txt' : 'text-txt-faint hover:text-txt-muted',
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search signals"
              aria-label="Search trend signals"
              className="h-9 pl-9 text-[12.5px]"
            />
          </div>
        </div>
      </div>

      {trends.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trends.map((trend) => (
            <article key={trend.id} className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0f16]/70 p-4 transition-colors hover:border-white/[0.14]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">{trend.category}</span>
                <div className="flex items-center gap-2">
                  <Delta value={trend.growth} />
                  <span className="rounded-md border border-cyan/20 bg-cyan/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-cyan tnum">
                    {trend.score}
                  </span>
                </div>
              </div>
              <h2 className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-snug text-txt">{trend.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-txt-faint">{trend.summary}</p>

              <div className="mt-3 flex items-end justify-between gap-3">
                <Sparkline values={trend.sparkline} className="h-9 w-28" />
                <div className="text-right">
                  <div className="font-mono text-[10px] text-txt-muted">{trend.volume}</div>
                  <div className="text-[9px] text-txt-faint">{trend.source}</div>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                {trend.platforms.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-1 py-0.5 text-[9px] text-txt-faint">
                    <PlatformMark platform={p} className="h-2.5 w-2.5" />
                    {platformLabel(p)}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
                <Button size="sm" variant="secondary" icon={Lightbulb} className="flex-1" onClick={() => openBrief(trend)}>
                  Turn into brief
                </Button>
                <span className="font-mono text-[9px] text-txt-faint">demo://{trend.id}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Search}
            title="No signals match"
            description="Try a broader category or clear the search."
            action={
              <Button variant="secondary" onClick={() => { setQuery(''); setCategory('all') }}>
                Clear filters
              </Button>
            }
          />
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[10px] text-txt-faint">
        <Info className="h-3 w-3" aria-hidden="true" />
        This signal set ships with the demo and is not refreshed from live sources. Scores, volumes and sparklines are illustrative.
      </p>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Turn signal into a production"
        description={selected ? `${selected.title} · ${selected.source}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Sparkles} disabled={!draft.trim()} onClick={startProduction}>
              Start production
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="label text-[9px]">Publisher hooks</div>
              <div className="mt-1.5 space-y-1.5">
                {selected.hooks.map((hook) => (
                  <button
                    key={hook}
                    onClick={() => setDraft(`${draft.trim()}\n\nHook option: "${hook}"`)}
                    className="block w-full rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-left text-[11.5px] text-txt-muted transition-colors hover:border-cyan/25 hover:text-txt"
                  >
                    {hook}
                  </button>
                ))}
              </div>
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
              <Textarea
                className="mt-1"
                rows={4}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <p className="text-[10px] leading-relaxed text-txt-faint">
              Demo copy is generated locally from this brief. Claims and sources still need human verification.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
