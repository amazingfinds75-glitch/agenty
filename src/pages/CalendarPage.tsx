import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Plus,
  Trash2,
} from 'lucide-react'
import { PlatformMark } from '../components/Brand'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Stat,
  StatusPill,
  Tabs,
} from '../components/ui'
import { useDemo } from '../lib/store'
import type { CalendarEvent, Platform } from '../lib/types'
import {
  addDays,
  cx,
  formatDate,
  platformLabel,
  startOfMonth,
  startOfWeek,
  toISODate,
} from '../lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarPage() {
  const { state, actions, pushToast } = useDemo()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'month' | 'list'>('month')
  const [addOpen, setAddOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [time, setTime] = useState('18:30')
  const [platform, setPlatform] = useState<Platform>('youtube-short')

  const events = state.calendar
  const todayISO = toISODate(new Date())
  const selected = events.find((event) => event.id === selectedId) ?? null

  const cells = useMemo(() => {
    const first = startOfWeek(startOfMonth(month))
    return Array.from({ length: 42 }, (_, index) => addDays(first, index))
  }, [month])

  const openAdd = (isoDate?: string) => {
    setTitle('')
    setDate(isoDate ?? toISODate(new Date()))
    setTime('18:30')
    setPlatform('youtube-short')
    setAddOpen(true)
  }

  const addSlot = () => {
    if (!title.trim()) return
    actions.addCalendarEvent({
      title: title.trim(),
      date,
      time,
      platform,
      status: 'planned',
    })
    setAddOpen(false)
    pushToast({ tone: 'success', title: 'Slot added to calendar', description: `${date} · ${time}` })
  }

  const sortedUpcoming = useMemo(() => {
    return [...events]
      .filter((event) => event.date >= todayISO)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  }, [events, todayISO])

  const counts = {
    planned: events.filter((e) => e.status === 'planned').length,
    producing: events.filter((e) => e.status === 'in-production').length,
    ready: events.filter((e) => e.status === 'ready').length,
    published: events.filter((e) => e.status === 'published').length,
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Content Calendar</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Plan YouTube and Instagram slots. Scheduling records a reminder — it never publishes on its own.
          </p>
        </div>
        <Button variant="primary" icon={CalendarPlus} onClick={() => openAdd()}>
          Add slot
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Planned" value={String(counts.planned)} hint="Awaiting production" icon={CalendarDays} />
        <Stat label="In production" value={String(counts.producing)} hint="Team working" icon={Clock3} tone="violet" />
        <Stat label="Ready to publish" value={String(counts.ready)} hint="Human upload pending" icon={CalendarPlus} tone="emerald" />
        <Stat label="Published" value={String(counts.published)} hint="Reported manually" icon={ArrowUpRight} tone="amber" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[
            { id: 'month', label: 'Month' },
            { id: 'list', label: 'Upcoming', count: sortedUpcoming.length },
          ]}
          value={view}
          onChange={setView}
          size="sm"
          ariaLabel="Calendar view"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label="Previous month" icon={ChevronLeft} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <span className="min-w-[130px] text-center text-[12px] font-medium text-txt">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <IconButton label="Next month" icon={ChevronRight} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08]">
          <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.02]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-2 py-1.5 text-center font-mono text-[9px] uppercase tracking-wider text-txt-faint last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, index) => {
              const iso = toISODate(cell)
              const dayEvents = events.filter((event) => event.date === iso)
              const inMonth = cell.getMonth() === month.getMonth()
              const isToday = iso === todayISO
              return (
                <div
                  key={iso + index}
                  className={cx(
                    'group relative min-h-[92px] border-b border-r border-white/[0.04] p-1.5 last:border-r-0 sm:min-h-[108px]',
                    inMonth ? 'bg-transparent' : 'bg-black/20',
                    index >= 35 && 'border-b-0',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cx(
                        'flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] tnum',
                        isToday ? 'bg-cyan text-[#04121a]' : inMonth ? 'text-txt-muted' : 'text-txt-faint/50',
                      )}
                    >
                      {cell.getDate()}
                    </span>
                    <button
                      onClick={() => openAdd(iso)}
                      className="rounded p-0.5 text-txt-faint opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-txt group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Add slot on ${formatDate(cell.toISOString())}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedId(event.id)}
                        className={cx(
                          'flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-[9px] leading-tight transition-colors',
                          event.status === 'published'
                            ? 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100/90'
                            : event.status === 'ready'
                              ? 'border-cyan/20 bg-cyan/[0.06] text-cyan/90'
                              : event.status === 'in-production'
                                ? 'border-violet/25 bg-violet/[0.08] text-violet-200'
                                : 'border-white/10 bg-white/[0.03] text-txt-muted',
                        )}
                      >
                        <span className="shrink-0 font-mono text-[8px] opacity-70">{event.time.slice(0, 5)}</span>
                        <span className="truncate">{event.title}</span>
                      </button>
                    ))}
                    {dayEvents.length > 2 ? (
                      <button
                        onClick={() => openAdd(iso)}
                        className="px-1 font-mono text-[8.5px] text-txt-faint hover:text-txt-muted"
                      >
                        +{dayEvents.length - 2} more
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08]">
          {sortedUpcoming.length ? (
            <ul className="divide-y divide-white/[0.05]">
              {sortedUpcoming.map((event) => (
                <li key={event.id}>
                  <button
                    onClick={() => setSelectedId(event.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] sm:px-4"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-txt-faint">
                        {new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}
                      </div>
                      <div className="font-display text-[17px] font-semibold leading-none text-txt tnum">
                        {new Date(`${event.date}T12:00:00`).getDate()}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-txt">{event.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-txt-faint">
                        <PlatformMark platform={event.platform} className="h-3 w-3" />
                        {platformLabel(event.platform)}
                        <span aria-hidden="true">·</span>
                        {event.time}
                      </div>
                    </div>
                    <StatusPill status={event.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3">
              <EmptyState
                icon={CalendarDays}
                title="No upcoming slots"
                description="Add a slot manually or schedule a completed production from its deliverables page."
                action={
                  <Button variant="primary" icon={CalendarPlus} onClick={() => openAdd()}>
                    Add slot
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-txt-faint">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          This calendar is a local planning aid. Status changes are manual; there is no publishing integration connected in the demo.
        </span>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add calendar slot"
        description="A planning reminder for a human-published post."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={CalendarPlus} disabled={!title.trim()} onClick={addSlot}>
              Add slot
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-[11px] text-txt-muted">
            Title
            <Input
              className="mt-1"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. On-device AI explainer"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-txt-muted">
              Date
              <Input type="date" className="mt-1" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="text-[11px] text-txt-muted">
              Time
              <Input type="time" className="mt-1" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
          </div>
          <label className="block text-[11px] text-txt-muted">
            Platform
            <Select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)} className="mt-1">
              <option value="youtube-short">YouTube Short</option>
              <option value="instagram-reel">Instagram Reel</option>
              <option value="youtube-long">Long-form video</option>
            </Select>
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? 'Calendar slot'}
        description={selected ? `${formatDate(`${selected.date}T12:00:00`)} · ${selected.time} · ${platformLabel(selected.platform)}` : undefined}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                if (!selected) return
                actions.deleteCalendarEvent(selected.id)
                setSelectedId(null)
                pushToast({ tone: 'info', title: 'Slot removed' })
              }}
            >
              Delete
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                pushToast({ tone: 'success', title: 'Slot updated' })
                setSelectedId(null)
              }}
            >
              Done
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <PlatformMark platform={selected.platform} className="h-3.5 w-3.5 text-cyan/80" />
              <span className="text-[11.5px] text-txt-muted">{platformLabel(selected.platform)}</span>
              <Badge mono className="ml-auto">
                {selected.projectId ? 'Linked production' : 'Manual slot'}
              </Badge>
            </div>
            <label className="block text-[11px] text-txt-muted">
              Status
              <Select
                className="mt-1"
                value={selected.status}
                onChange={(event) =>
                  actions.updateCalendarEvent(selected.id, { status: event.target.value as CalendarEvent['status'] })
                }
              >
                <option value="planned">Planned</option>
                <option value="in-production">In production</option>
                <option value="ready">Ready to publish</option>
                <option value="published">Published</option>
              </Select>
            </label>
            {selected.projectId ? (
              <Link
                to={`/productions/${selected.projectId}`}
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-txt-muted hover:border-cyan/25 hover:text-txt"
              >
                Open linked production <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
            <p className="text-[10px] leading-relaxed text-txt-faint">
              Marking a slot “Published” only updates this local calendar — nothing is uploaded.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
