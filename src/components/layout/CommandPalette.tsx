import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CornerDownLeft, Plus, Search } from 'lucide-react'
import { NAV_ITEMS } from '../../lib/nav'
import { cx } from '../../lib/utils'
import { Kbd, Modal } from '../ui'
import { AGENTS } from '../../lib/agents'
import { AgentGlyph } from '../ui'

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const navItems = NAV_ITEMS.map((item) => ({
      kind: 'nav' as const,
      id: item.to,
      label: item.label,
      description: item.description,
      icon: item.icon,
      to: item.to,
    }))
    const actions = [
      {
        kind: 'action' as const,
        id: 'new',
        label: 'Start a new production',
        description: 'Open a fresh brief with the Executive Producer',
        icon: Plus,
        to: '/',
      },
    ]
    const agentItems = AGENTS.filter((a) =>
      q ? `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(q) : false,
    ).map((a) => ({
      kind: 'agent' as const,
      id: a.id,
      label: a.name,
      description: `${a.role} · ${a.description}`,
      agent: a,
      to: '/team',
    }))
    const all = [...actions, ...navItems]
    const filtered = q
      ? all.filter((i) => `${i.label} ${i.description}`.toLowerCase().includes(q))
      : all
    return [...filtered, ...agentItems].slice(0, 9)
  }, [query])

  useEffect(() => setIndex(0), [query])

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <Modal open={open} onClose={onClose} hideHeader size="md" ariaLabel="Command palette">
      <div className="-mx-5 -my-4">
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
          <Search className="h-4 w-4 text-txt-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (items.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => (i + 1) % items.length)
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => (i - 1 + items.length) % items.length)
              }
              if (e.key === 'Enter' && items[index]) {
                e.preventDefault()
                go(items[index].to)
              }
            }}
            placeholder="Search screens, agents and actions…"
            aria-label="Search workspace"
            role="combobox"
            aria-expanded={open}
            aria-controls="palette-results"
            aria-autocomplete="list"
            aria-activedescendant={
              items[index] ? `palette-option-${items[index].kind}-${items[index].id}` : undefined
            }
            className="h-8 flex-1 bg-transparent text-base text-txt placeholder:text-txt-faint focus:outline-none sm:text-sm"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div
          id="palette-results"
          className="max-h-[55vh] overflow-y-auto scroll-thin p-2"
          role="listbox"
          aria-label="Results"
        >
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-txt-faint">No matches for “{query}”.</div>
          ) : null}
          {items.map((item, i) => (
            <button
              key={`${item.kind}-${item.id}`}
              id={`palette-option-${item.kind}-${item.id}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(item.to)}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                i === index ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]',
              )}
            >
              {item.kind === 'agent' ? (
                <AgentGlyph agent={item.agent} size="sm" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                  <item.icon className="h-3.5 w-3.5 text-txt-muted" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-txt">{item.label}</span>
                <span className="block truncate text-[11px] text-txt-faint">{item.description}</span>
              </span>
              <ArrowRight className={cx('h-3.5 w-3.5 text-txt-faint', i === index ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2 text-[10.5px] text-txt-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> open
          </span>
          <span className="ml-auto">Demo build · local search</span>
        </div>
      </div>
    </Modal>
  )
}
