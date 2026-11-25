import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  Cpu,
  FlaskConical,
  Info,
  MinusCircle,
  Radio,
  RefreshCcw,
  Server,
  ShieldQuestion,
} from 'lucide-react'
import { Button } from '../components/ui'
import { supportsVideoRender } from '../lib/render'
import { useBackendHealth } from '../lib/useLive'
import { ttsSupported } from '../lib/voice'

type Status = 'pass' | 'warn' | 'fail'

interface Check {
  label: string
  status: Status
  detail: string
}

function storageWorks() {
  try {
    const key = '__aivs_test__'
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function webglInfo() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return { ok: false, detail: 'No WebGL context — the CSS glass fallback will be used.' }
    return { ok: true, detail: 'WebGL context created. The 3D core can run.' }
  } catch {
    return { ok: false, detail: 'WebGL detection failed.' }
  }
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function VerificationPage() {
  const [checks, setChecks] = useState<Check[]>([])
  const [runAt, setRunAt] = useState('')

  const run = () => {
    const gl = webglInfo()
    const recorder = supportsVideoRender()
    const tts = ttsSupported()
    const next: Check[] = [
      gl.ok
        ? { label: 'WebGL', status: 'pass', detail: gl.detail }
        : { label: 'WebGL', status: 'warn', detail: gl.detail },
      recorder
        ? { label: 'Video rendering', status: 'pass', detail: 'captureStream + MediaRecorder available. Renders are real, local 10s demo cuts.' }
        : { label: 'Video rendering', status: 'fail', detail: 'This browser lacks captureStream or MediaRecorder. The render button reports this instead of pretending to work.' },
      tts
        ? { label: 'Voice preview', status: 'pass', detail: 'speechSynthesis available. Voices depend on installed system voices.' }
        : { label: 'Voice preview', status: 'fail', detail: 'No speechSynthesis. Narration preview buttons explain the limitation.' },
      storageWorks()
        ? { label: 'Local storage', status: 'pass', detail: 'Workspace persists to localStorage in this browser.' }
        : { label: 'Local storage', status: 'fail', detail: 'Storage is blocked. The app runs in memory and will not persist.' },
      { label: 'Reduced motion', status: 'pass', detail: reducedMotion() ? 'prefers-reduced-motion is on — the 3D core and typing animations are calmed.' : 'prefers-reduced-motion is off — motion follows your system setting.' },
    ]
    setChecks(next)
    setRunAt(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">What works in this build</h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-txt-muted">
            A visual prototype is not proof of working functionality. This page separates what is really implemented
            from what is simulated, untested or absent.
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCcw} onClick={run}>
          Re-run checks
        </Button>
      </div>

      <section className="panel mt-4 p-4" aria-labelledby="env-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="h-4 w-4 text-txt-faint" aria-hidden="true" />
            <h2 id="env-heading" className="text-[13px] font-semibold text-txt">This browser</h2>
          </div>
          {runAt ? <span className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">Checked {runAt}</span> : null}
        </div>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2">
              <StatusIcon status={check.status} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-txt">{check.label}</p>
                <p className="text-[9.5px] leading-relaxed text-txt-faint">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <LiveServicesPanel />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Category
          tone="emerald"
          icon={CheckCircle2}
          title="Implemented and tested"
          note="Exercised in this build with the browser’s own APIs."
          items={[
            ['Chat → production flow', 'Sending a prompt creates a session, builds a plan message and starts the simulated pipeline. Cancelling and revising work.'],
            ['Live trend desk', 'The local backend fetches Google Trends RSS and Hacker News headlines; opportunity scores are computed locally. No platform analytics are used.'],
            ['Chart history', 'Each fetch appends a snapshot to server/data/trends.json. The detail view charts score and rank movement across recorded snapshots.'],
            ['Live topic → production', 'A live headline becomes a seeded brief that runs through the same 13-stage simulated pipeline and local canvas render.'],
            ['Production controls', 'Pause, resume, retry, approve and schedule buttons mutate the stored project and surface status. Scheduling requires approval.'],
            ['Canvas artwork', 'Thumbnails and covers are painted on a canvas from the real title, theme and language, then downloadable as JPEG.'],
            ['Script and metadata editing', 'Edits in Script, YouTube and Instagram studios persist to the project via the store.'],
            ['Captions export', 'SRT is generated from scene timing and downloaded as a real .srt file.'],
            ['Downloads', 'Artwork, scripts, captions and video renders download through real Blob URLs.'],
            ['Persistence', 'Sessions, projects, edits and settings survive a reload via localStorage, flushed on tab hide and page unload, with interrupted-running recovery.'],
            ['Resilience', 'Every route sits behind an error boundary with reload and back-to-workspace recovery. WebGL loss falls back to a CSS glass structure.'],
            ['Keyboard access', 'Dialogs trap Tab, close on Escape and restore focus. The command palette is a keyboard-navigable combobox and every page focuses main content after navigation.'],
            ['Navigation and search', 'Every sidebar route resolves; command palette and list filters work on real data.'],
          ]}
        />
        <Category
          tone="amber"
          icon={FlaskConical}
          title="Implemented, not fully tested"
          note="Real code paths whose behaviour depends on the machine or browser."
          items={[
            ['Video render quality', 'MediaRecorder output is a genuine 10-second local cut, but codec choice (mp4/webm) varies by browser and has not been verified on every target.'],
            ['AI signal analysis', 'With a provider key in .env, analysis calls OpenAI, Anthropic or Gemini for strict JSON. The call path is unverified without a real key; unconfigured or failing calls return a labeled local heuristic.'],
            ['External video providers', 'Luma and Replicate adapters exist but have never completed a live job. Use them only after testing with your own account; the in-app renderer is the verified path.'],
            ['Voice preview', 'Uses installed system voices. Telugu/Hindi/Tamil/Kannada pronunciation quality and availability vary by OS.'],
            ['Large uploads', 'Files above 1.2 MB remain session-only; behaviour under storage pressure has not been stress-tested.'],
            ['3D performance', 'Quality tiers adapt to width and cores, but 60 FPS is not guaranteed on low-end onboard GPUs.'],
            ['Cross-tab changes', 'Storage is written per tab; simultaneous tabs are not synchronised.'],
          ]}
        />
        <Category
          tone="violet"
          icon={CircleDashed}
          title="Demo / simulated"
          note="Presented in the interface but driven by local mock data."
          items={[
            ['12-agent pipeline', 'Stage progression is a local timer-based simulation. No agents, models or external services are called.'],
            ['Demo trend library', 'The curated list on the Trends page is ten seeded signals with demo:// sources. The live desk above it is real; the two are labeled separately.'],
            ['Research items', 'Research attached to productions is synthetic demo copy, even when the brief came from a live headline.'],
            ['Generated copy', 'Scripts, titles, captions and hashtags come from templates and seeded randomness, not an LLM. Only signal analysis optionally calls a model.'],
            ['Quality control', 'QC rows and scores are illustrative checklist text, not automated verification.'],
            ['Media library generated entries', 'Indexed from productions; some entries exist as metadata without a downloadable file.'],
            ['Profile & notifications', 'Preferences persist locally. No email, push or account backend exists.'],
          ]}
        />
        <Category
          tone="rose"
          icon={MinusCircle}
          title="Not implemented"
          note="No UI pretends these exist."
          items={[
            ['Real AI generation', 'No model is bundled. Scripts stay template-driven; the only model call is optional signal analysis once you add a key.'],
            ['Automatic live topic monitoring', 'Snapshots are recorded only when the desk or another client fetches trends; there is no background scheduler and no alerting.'],
            ['Real video editing', 'Renders are canvas motion graphics with a demo tone, not edited footage or synthesized speech tracks.'],
            ['Publishing integrations', 'YouTube, Instagram and Drive show “Not connected”. Upload controls are disabled; publish manually via downloads.'],
            ['Accounts & collaboration', 'Single-browser local state only. No sign-in, teams, sharing or cloud sync.'],
            ['Payments / billing', 'No plans, checkout or usage metering.'],
            ['Scheduled publishing', 'Calendar entries and reminders are local planning data only; nothing posts at a scheduled time.'],
          ]}
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.015] p-4 text-[10.5px] leading-relaxed text-txt-faint">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          Demo copy, demo research and demo QC must be verified before any real publication. Publishing is
          intentionally manual: approve a production, download its package, and upload it yourself. See{' '}
          <Link to="/settings" className="text-cyan/80 hover:text-cyan">
            Settings → Publishing integrations
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

function LiveServicesPanel() {
  const { health, connection } = useBackendHealth()
  const online = health?.sources.filter((s) => s.status === 'connected') ?? []
  const rows: { icon: typeof Server; label: string; status: Status; detail: string }[] = connection === 'checking'
    ? [{ icon: Server, label: 'Live backend', status: 'warn', detail: 'Checking the local service on /api/health…' }]
    : connection === 'offline' || !health
      ? [
          { icon: Server, label: 'Live backend', status: 'fail', detail: 'Not running. Start it with “npm run server”; the live desk, charts and analysis stay unavailable until then.' },
          { icon: Radio, label: 'Live trend feeds', status: 'fail', detail: 'Google Trends RSS and Hacker News are fetched by the backend, so nothing live loads offline.' },
          { icon: Cpu, label: 'Signal analysis', status: 'warn', detail: 'Unavailable offline. With the backend running and no AI key, analysis returns a labeled local heuristic.' },
          { icon: Clapperboard, label: 'External video providers', status: 'warn', detail: 'Not configured. Renders inside the app remain real local canvas + MediaRecorder captures.' },
        ]
      : [
          {
            icon: Server,
            label: 'Live backend',
            status: 'pass',
            detail: `v${health.version} · up ${Math.max(1, Math.floor(health.uptimeSec / 60))}m · ${health.trends.count} cached signals · ${health.trends.geo} geo`,
          },
          {
            icon: Radio,
            label: 'Live trend feeds',
            status: online.length ? 'pass' : 'warn',
            detail: online.length
              ? `${online.map((s) => s.name).join(' + ')} responding · scores are a local heuristic, not platform analytics`
              : health.sources.map((s) => `${s.name}: ${s.status}`).join(' · '),
          },
          {
            icon: Cpu,
            label: 'Signal analysis',
            status: 'warn',
            detail: health.ai.configured
              ? `${health.ai.provider} · ${health.ai.model} configured, but the call path is unverified until you run an analysis with a real key.`
              : 'No AI key configured. Analysis falls back to a labeled local heuristic that makes no model call.',
          },
          {
            icon: Clapperboard,
            label: 'External video providers',
            status: 'warn',
            detail: health.video.configured
              ? `${health.video.provider} configured, but no job has completed — treat it as unverified scaffolding.`
              : 'Luma and Replicate adapters are wired but untested. Unconfigured requests return 503 instead of pretending.',
          },
          {
            icon: MinusCircle,
            label: 'Publishing',
            status: 'fail',
            detail: health.publishing.detail,
          },
        ]

  return (
    <section className="panel mt-4 p-4" aria-labelledby="live-heading">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-txt-faint" aria-hidden="true" />
        <h2 id="live-heading" className="text-[13px] font-semibold text-txt">Live services</h2>
        <span className="ml-auto font-mono text-[8.5px] uppercase tracking-wider text-txt-faint">backend + providers</span>
      </div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div key={row.label} className="flex items-start gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2">
              <StatusIcon status={row.status} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-txt">
                  <Icon className="h-3 w-3 text-txt-faint" aria-hidden="true" />
                  {row.label}
                </p>
                <p className="text-[9.5px] leading-relaxed text-txt-faint">{row.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'pass') return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
  if (status === 'warn') return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
  return <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
}

function Category({
  tone,
  icon: Icon,
  title,
  note,
  items,
}: {
  tone: 'emerald' | 'amber' | 'violet' | 'rose'
  icon: typeof CheckCircle2
  title: string
  note: string
  items: [string, string][]
}) {
  const toneClass = {
    emerald: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10',
    amber: 'text-amber-200 border-amber-400/25 bg-amber-400/10',
    violet: 'text-violet-200 border-violet/30 bg-violet/10',
    rose: 'text-rose-200 border-rose-400/25 bg-rose-500/10',
  }[tone]
  return (
    <section className="panel p-4" aria-label={title}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-[12.5px] font-semibold text-txt">{title}</h2>
          <p className="text-[9.5px] text-txt-faint">{note}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map(([label, detail]) => (
          <li key={label} className="border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
            <p className="text-[11px] font-medium text-txt-muted">{label}</p>
            <p className="text-[9.5px] leading-relaxed text-txt-faint">{detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
