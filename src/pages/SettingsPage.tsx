import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Clapperboard,
  Cpu,
  Gauge,
  Info,
  Link2,
  Monitor,
  RefreshCcw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { Avatar, Badge, Button, Field, Input, Modal, Select, Toggle } from '../components/ui'
import { useDemo } from '../lib/store'
import { useBackendHealth } from '../lib/useLive'
import type { Language, Platform, Settings } from '../lib/types'
import { LANGUAGE_LABELS, PLATFORM_LABELS, relativeTime } from '../lib/utils'

const TONES: { value: Settings['tone']; label: string }[] = [
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'documentary', label: 'Documentary' },
]

const QUALITIES: { value: Settings['quality']; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Adapts to the device' },
  { value: 'high', label: 'High', hint: 'Full 3D detail' },
  { value: 'balanced', label: 'Balanced', hint: 'Reduced particle count' },
  { value: 'low', label: 'Low', hint: 'Minimal 3D work' },
  { value: 'off', label: 'Off', hint: 'CSS glass only' },
]

const INTEGRATIONS = [
  { id: 'youtube', name: 'YouTube Studio', detail: 'Upload to your channel after approval' },
  { id: 'instagram', name: 'Instagram', detail: 'Publish Reels after approval' },
  { id: 'drive', name: 'Google Drive', detail: 'Mirror deliverables to a folder' },
] as const

export default function SettingsPage() {
  const { state, actions, pushToast } = useDemo()
  const settings = state.settings

  const [name, setName] = useState(settings.name)
  const [email, setEmail] = useState(settings.email)
  const [role, setRole] = useState(settings.role)
  const [resetOpen, setResetOpen] = useState(false)
  const [integrationOpen, setIntegrationOpen] = useState<(typeof INTEGRATIONS)[number] | null>(null)

  useEffect(() => {
    setName(settings.name)
    setEmail(settings.email)
    setRole(settings.role)
  }, [settings.name, settings.email, settings.role])

  const profileDirty = name !== settings.name || email !== settings.email || role !== settings.role
  const profileValid = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SO'

  const saveProfile = () => {
    if (!profileValid) return
    actions.updateSettings({ name: name.trim(), email: email.trim(), role: role.trim() })
    pushToast({ tone: 'success', title: 'Profile saved' })
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Settings</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">Workspace profile, studio defaults and demo engine controls.</p>
        </div>
        <Badge mono tone="cyan">Local demo workspace</Badge>
      </div>

      <div className="mt-4 space-y-4">
        <section className="panel p-4 sm:p-5" aria-labelledby="profile-heading">
          <SectionTitle id="profile-heading" icon={UserRound} title="Profile" hint="Shown in the sidebar and on exports." />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Avatar initials={initials} name={name} className="h-14 w-14 text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-txt">{name || 'Unnamed producer'}</p>
              <p className="text-[11px] text-txt-faint">{role || 'Role not set'} · {email || 'No email'}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="settings-name">
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} />
            </Field>
            <Field label="Email" htmlFor="settings-email" hint="Local only">
              <Input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
            </Field>
            <Field label="Role" htmlFor="settings-role" className="sm:col-span-2">
              <Input id="settings-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Executive Producer" maxLength={60} />
            </Field>
          </div>
          {!profileValid ? <p className="mt-2 text-[10.5px] text-amber-300">Enter a name and a valid email to save.</p> : null}
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setName(settings.name)
                setEmail(settings.email)
                setRole(settings.role)
              }}
              disabled={!profileDirty}
            >
              Revert
            </Button>
            <Button variant="primary" icon={Save} onClick={saveProfile} disabled={!profileDirty || !profileValid}>
              Save profile
            </Button>
          </div>
        </section>

        <section className="panel p-4 sm:p-5" aria-labelledby="defaults-heading">
          <SectionTitle id="defaults-heading" icon={Sparkles} title="Studio defaults" hint="Applied to new productions from the composer." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Default language" htmlFor="settings-language">
              <Select
                id="settings-language"
                value={settings.language}
                onChange={(e) => actions.updateSettings({ language: e.target.value as Language })}
              >
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default platform" htmlFor="settings-platform">
              <Select
                id="settings-platform"
                value={settings.defaultPlatform}
                onChange={(e) => actions.updateSettings({ defaultPlatform: e.target.value as Platform })}
              >
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
                  <option key={platform} value={platform}>
                    {PLATFORM_LABELS[platform]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default tone" htmlFor="settings-tone" hint="Affects generated copy">
              <Select id="settings-tone" value={settings.tone} onChange={(e) => actions.updateSettings({ tone: e.target.value as Settings['tone'] })}>
                {TONES.map((tone) => (
                  <option key={tone.value} value={tone.value}>
                    {tone.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <p className="text-[10px] leading-relaxed text-txt-faint">
                Defaults apply when you send a prompt without choosing a platform or language. Existing productions keep the settings they were created with.
              </p>
            </div>
          </div>
          <div className="mt-2 divide-y divide-white/[0.06]">
            <Toggle
              label="Generate captions"
              description="Captions and SRT are always generated in this build. This preference is stored but not yet used to gate exports."
              checked={settings.captions}
              onChange={(captions) => actions.updateSettings({ captions })}
            />
            <Toggle
              label="Auto-approve completed productions"
              description="Disabled in this build. You explicitly approve every production before it can be scheduled or published."
              checked={settings.autoApprove}
              onChange={() => undefined}
              disabled
            />
          </div>
        </section>

        <section className="panel p-4 sm:p-5" aria-labelledby="visual-heading">
          <SectionTitle id="visual-heading" icon={Monitor} title="Visuals & performance" hint="Controls the 3D glass core and motion." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="3D quality" htmlFor="settings-quality">
              <Select
                id="settings-quality"
                value={settings.quality}
                onChange={(e) => actions.updateSettings({ quality: e.target.value as Settings['quality'] })}
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label} — {q.hint}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Motion" htmlFor="settings-motion" hint="Reduced motion always wins">
              <Select
                id="settings-motion"
                value={settings.motion}
                onChange={(e) => actions.updateSettings({ motion: e.target.value as Settings['motion'] })}
              >
                <option value="system">Follow system</option>
                <option value="on">Always on</option>
                <option value="off">Off</option>
              </Select>
            </Field>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
            <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            The 3D core pauses when the tab is hidden and falls back to a CSS glass structure when WebGL is unavailable or quality is off.
          </p>
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] text-txt-muted">
                <Gauge className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" /> Demo engine speed
              </span>
              <span className="font-mono text-[9.5px] text-txt-faint">{state.simSpeed}×</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {[1, 2, 4, 8].map((speed) => (
                <Button
                  key={speed}
                  size="sm"
                  variant={state.simSpeed === speed ? 'primary' : 'secondary'}
                  onClick={() => actions.setSimSpeed(speed)}
                  aria-pressed={state.simSpeed === speed}
                  className="flex-1"
                >
                  {speed}×
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-txt-faint">
              Speeds up the simulated pipeline only. It does not change real render or voice-preview time.
            </p>
          </div>
        </section>

        <BackendSection />

        <section className="panel p-4 sm:p-5" aria-labelledby="notifications-heading">
          <SectionTitle id="notifications-heading" icon={Bell} title="Notifications" hint="In-app preferences for this demo." />
          <div className="mt-2 divide-y divide-white/[0.06]">
            <Toggle
              label="Production complete"
              description="Stored preference only — in-app toasts always appear in this build. No email or push is sent."
              checked={settings.notifications.productionComplete}
              onChange={(productionComplete) =>
                actions.updateSettings({ notifications: { ...settings.notifications, productionComplete } })
              }
            />
            <Toggle
              label="Agent errors"
              description="Stored preference only — failures always surface in the production panel and thread. Nothing is emailed."
              checked={settings.notifications.agentErrors}
              onChange={(agentErrors) => actions.updateSettings({ notifications: { ...settings.notifications, agentErrors } })}
            />
            <Toggle
              label="Weekly digest"
              description="Not generated in this build. The preference is remembered for when email is configured."
              checked={settings.notifications.weeklyDigest}
              onChange={(weeklyDigest) => actions.updateSettings({ notifications: { ...settings.notifications, weeklyDigest } })}
            />
          </div>
        </section>

        <section className="panel p-4 sm:p-5" aria-labelledby="integrations-heading">
          <SectionTitle id="integrations-heading" icon={Link2} title="Publishing integrations" hint="Nothing is connected in this build." />
          <div className="mt-4 space-y-1.5">
            {INTEGRATIONS.map((integration) => (
              <div key={integration.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                  <Link2 className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-txt">{integration.name}</p>
                  <p className="text-[10px] text-txt-faint">{integration.detail}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-txt-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Not connected
                </span>
                <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setIntegrationOpen(integration)}>
                  Details
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
            <ShieldCheck className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            OAuth credentials are not configured. Publishing remains manual: download the package and upload it yourself.
          </p>
        </section>

        <section className="panel border-rose-400/15 p-4 sm:p-5" aria-labelledby="data-heading">
          <SectionTitle id="data-heading" icon={RotateCcw} title="Workspace data" hint="Everything lives in this browser." />
          <p className="mt-3 text-[11px] leading-relaxed text-txt-muted">
            Sessions, productions, artwork and settings are saved to localStorage. Resetting restores the original
            demo workspace and permanently removes your local changes, uploads and renders.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="danger" icon={AlertTriangle} onClick={() => setResetOpen(true)}>
              Reset demo workspace
            </Button>
            <Link to="/verification" className="text-[10.5px] text-cyan/80 hover:text-cyan">
              See what works in this build →
            </Link>
          </div>
        </section>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the demo workspace?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              onClick={() => {
                actions.resetDemo()
                setResetOpen(false)
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-txt-muted">
          {['All sessions and chat history', 'All productions, renders and artwork edits', 'Uploads and media entries', 'Profile, defaults and notification preferences'].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={Boolean(integrationOpen)}
        onClose={() => setIntegrationOpen(null)}
        title={integrationOpen ? `${integrationOpen.name} — not connected` : 'Not connected'}
        description="No provider credentials are configured in this demo build."
        footer={
          <Button variant="secondary" icon={Check} onClick={() => setIntegrationOpen(null)}>
            Understood
          </Button>
        }
      >
        <p className="text-[12px] leading-relaxed text-txt-muted">
          Connecting {integrationOpen?.name ?? 'this provider'} requires OAuth credentials, a verified callback URL and a
          real upload pipeline. None of that exists here, so upload controls stay disabled and nothing is sent to a
          third party. Download deliverables from a production to publish manually.
        </p>
      </Modal>
    </div>
  )
}

function ServicePill({ label, tone }: { label: string; tone: 'online' | 'error' | 'warn' | 'config' | 'muted' }) {
  const classes = {
    online: 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300',
    error: 'border-rose-400/25 bg-rose-500/[0.06] text-rose-300',
    warn: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200',
    config: 'border-cyan/25 bg-cyan/[0.06] text-cyan',
    muted: 'border-white/10 text-txt-faint',
  }[tone]
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] ${classes}`}>
      {label}
    </span>
  )
}

function BackendSection() {
  const { health, connection, checkedAt, refresh } = useBackendHealth()

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="backend-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionTitle
          id="backend-heading"
          icon={Server}
          title="Live backend, AI & video"
          hint="Optional local service. Keys stay on the server, never in the browser."
        />
        <Button size="sm" variant="secondary" icon={RefreshCcw} onClick={() => void refresh()} disabled={connection === 'checking'}>
          {connection === 'checking' ? 'Checking' : 'Re-check'}
        </Button>
      </div>

      {connection === 'checking' ? (
        <p className="mt-4 text-[11px] text-txt-faint">Checking <code className="font-mono">/api/health</code>…</p>
      ) : connection === 'offline' ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5">
          <div className="flex items-start gap-2.5">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-amber-100">Backend offline</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-txt-muted">
                The live desk, chart history and analysis endpoints need the local service. The rest of the workspace keeps working
                offline.
              </p>
              <div className="mt-2 space-y-1 font-mono text-[9.5px] text-txt-muted">
                <p><span className="text-txt-faint">1.</span> npm run server</p>
                <p><span className="text-txt-faint">2.</span> npm run dev <span className="text-txt-faint">(separate terminal; restart Vite once so /api proxies)</span></p>
                <p className="text-txt-faint">or: npm run build && npm run server</p>
              </div>
              <Button size="sm" variant="secondary" icon={RefreshCcw} onClick={() => void refresh()} className="mt-2.5">
                Check again
              </Button>
            </div>
          </div>
        </div>
      ) : health ? (
        <>
          <div className="mt-4 space-y-1.5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Server className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-txt">Local backend</p>
                <p className="text-[10px] text-txt-faint">
                  v{health.version} · uptime {health.uptimeSec >= 3600 ? `${Math.floor(health.uptimeSec / 3600)}h ${Math.floor((health.uptimeSec % 3600) / 60)}m` : `${Math.max(1, Math.floor(health.uptimeSec / 60))}m`} ·{' '}
                  {checkedAt ? `checked ${relativeTime(new Date(checkedAt).toISOString())}` : 'connected'}
                </p>
              </div>
              <ServicePill label="online" tone="online" />
            </div>

            <div className="pt-1 font-mono text-[8.5px] uppercase tracking-wider text-txt-faint">Live sources</div>
            {health.sources.map((source) => (
              <div key={source.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                  <Activity className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-txt">{source.name}</p>
                  <p className="text-[10px] leading-relaxed text-txt-faint">
                    {source.status === 'connected'
                      ? `${source.count} items · fetched ${source.lastFetch ? relativeTime(source.lastFetch) : 'recently'}`
                      : source.lastError
                        ? source.lastError
                        : source.detail}
                  </p>
                  {source.id === 'youtube' && source.status === 'not-configured' ? (
                    <p className="mt-0.5 font-mono text-[8.5px] text-txt-faint">YOUTUBE_API_KEY</p>
                  ) : null}
                </div>
                <ServicePill
                  label={source.status === 'connected' ? 'connected' : source.status === 'not-configured' ? 'not configured' : source.status === 'idle' ? 'not fetched' : 'error'}
                  tone={source.status === 'connected' ? 'online' : source.status === 'error' ? 'error' : 'muted'}
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Cpu className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-txt">Signal analysis AI</p>
                <p className="text-[10px] leading-relaxed text-txt-faint">{health.ai.detail}</p>
                {health.ai.configured ? (
                  <p className="mt-0.5 font-mono text-[8.5px] text-txt-faint">
                    {health.ai.provider} · {health.ai.model} · called only when you press Analyze
                  </p>
                ) : (
                  <p className="mt-0.5 font-mono text-[8.5px] text-txt-faint">OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY</p>
                )}
              </div>
              <ServicePill label={health.ai.configured ? 'configured' : 'heuristic only'} tone={health.ai.configured ? 'config' : 'muted'} />
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Clapperboard className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-txt">AI video provider</p>
                <p className="text-[10px] leading-relaxed text-txt-faint">{health.video.detail}</p>
                {health.video.configured ? (
                  <p className="mt-0.5 font-mono text-[8.5px] text-amber-200/75">
                    {health.video.provider} · {health.video.model} · unverified until a real job completes
                  </p>
                ) : (
                  <p className="mt-0.5 font-mono text-[8.5px] text-txt-faint">VIDEO_PROVIDER / LUMA_API_KEY / REPLICATE_API_TOKEN</p>
                )}
              </div>
              <ServicePill label={health.video.configured ? 'unverified' : 'not configured'} tone={health.video.configured ? 'warn' : 'muted'} />
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
            <ShieldCheck className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              Configure providers in <code className="rounded bg-black/30 px-1 font-mono text-[9.5px]">.env</code> (copy{' '}
              <code className="rounded bg-black/30 px-1 font-mono text-[9.5px]">.env.example</code>) and restart{' '}
              <code className="rounded bg-black/30 px-1 font-mono text-[9.5px]">npm run server</code>. Keys are read server-side only.
              Publishing stays manual; the browser canvas renderer is still the verified video path. For a phone or
              tablet on the same Wi-Fi, set <code className="rounded bg-black/30 px-1 font-mono text-[9.5px]">HOST=0.0.0.0</code>{' '}
              and open the printed network address. The API has no login, so use a trusted network.
            </span>
          </p>
        </>
      ) : null}
    </section>
  )
}

function SectionTitle({
  id,
  icon: Icon,
  title,
  hint,
}: {
  id: string
  icon: typeof Info
  title: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
        <Icon className="h-3.5 w-3.5 text-txt-faint" aria-hidden="true" />
      </span>
      <div>
        <h2 id={id} className="text-[13px] font-semibold text-txt">
          {title}
        </h2>
        <p className="text-[10px] text-txt-faint">{hint}</p>
      </div>
    </div>
  )
}
