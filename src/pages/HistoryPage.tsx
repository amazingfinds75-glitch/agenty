import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dot,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  StatusPill,
} from '../components/ui'
import { useDemo } from '../lib/store'
import { cx, relativeTime } from '../lib/utils'

export default function HistoryPage() {
  const { state, actions, pushToast } = useDemo()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const sessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...state.sessions]
      .filter((s) => {
        if (!q) return true
        const messageText = s.messages.map((m) => m.content).join(' ')
        return `${s.title} ${messageText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.updatedAt.localeCompare(a.updatedAt))
  }, [state.sessions, query])

  const renameTarget = state.sessions.find((s) => s.id === renameId)
  const deleteTarget = state.sessions.find((s) => s.id === deleteId)
  const totalProjects = state.sessions.reduce((count, s) => count + s.projectIds.length, 0)

  const openSession = (id: string) => navigate(`/c/${id}`)

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-txt sm:text-[27px]">Chat History</h1>
          <p className="mt-1 text-[12.5px] text-txt-muted">
            Every brief stays attached to its production, deliverables and revision trail.
          </p>
        </div>
        <Button variant="primary" icon={MessageSquarePlus} onClick={() => { actions.newChat(); navigate('/') }}>
          New chat
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations and messages"
            aria-label="Search conversations"
            className="h-9 pl-9 text-base sm:text-[12.5px]"
          />
        </div>
        <span className="font-mono text-[10px] text-txt-faint">
          {sessions.length} conversations · {totalProjects} productions
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08]">
        {sessions.length ? (
          <ul className="divide-y divide-white/[0.05]">
            {sessions.map((session) => {
              const last = [...session.messages].reverse().find((m) => m.role !== 'system')
              const projects = session.projectIds
                .map((id) => state.projects.find((p) => p.id === id))
                .filter(Boolean)
              const active = projects.find((p) => p?.status === 'running')
              return (
                <li key={session.id} className="group relative bg-white/[0.012] transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
                    <button
                      onClick={() => actions.togglePinSession(session.id)}
                      className={cx(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                        session.pinned
                          ? 'border-cyan/25 bg-cyan/[0.08] text-cyan'
                          : 'border-white/[0.07] text-txt-faint hover:border-white/15 hover:text-txt-muted',
                      )}
                      aria-label={session.pinned ? `Unpin ${session.title}` : `Pin ${session.title}`}
                      title={session.pinned ? 'Unpin conversation' : 'Pin conversation'}
                    >
                      {session.pinned ? <Pin className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5 opacity-50" />}
                    </button>

                    <button className="min-w-0 flex-1 text-left" onClick={() => openSession(session.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-txt">{session.title}</span>
                        {session.pinned ? <Badge mono tone="cyan">Pinned</Badge> : null}
                        {active ? <StatusPill status="running" /> : null}
                        {projects[0] ? (
                          <span className="hidden font-mono text-[9px] text-txt-faint sm:inline">
                            {projects.length} production{projects.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11.5px] text-txt-faint">
                        {last ? `${last.role === 'user' ? 'You: ' : 'Producer: '}${last.content}` : 'No messages yet'}
                      </p>
                      <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-txt-faint">
                        <span>{session.messages.length} messages</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {relativeTime(session.updatedAt)}</span>
                        {active ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-cyan/80">
                              <Dot tone="cyan" pulse /> producing
                            </span>
                          </>
                        ) : null}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Menu
                        align="right"
                        label={`Actions for ${session.title}`}
                        trigger={<IconButton label={`Actions for ${session.title}`} icon={MoreHorizontal} />}
                        items={[
                          { label: 'Open conversation', icon: History, onClick: () => openSession(session.id) },
                          {
                            label: 'Rename',
                            icon: Pencil,
                            onClick: () => {
                              setRenameId(session.id)
                              setRenameValue(session.title)
                            },
                          },
                          {
                            label: session.pinned ? 'Unpin' : 'Pin to top',
                            icon: session.pinned ? PinOff : Pin,
                            onClick: () => actions.togglePinSession(session.id),
                          },
                          {
                            label: 'Delete conversation',
                            icon: Trash2,
                            danger: true,
                            onClick: () => setDeleteId(session.id),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="p-3">
            <EmptyState
              icon={query ? Search : History}
              title={query ? 'No conversations match' : 'No conversations saved yet'}
              description={
                query
                  ? 'Search checks both conversation titles and message content.'
                  : 'Start a brief in the chat workspace. Sessions, revisions and project links are saved locally in this browser.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button variant="primary" icon={MessageSquarePlus} onClick={() => { actions.newChat(); navigate('/') }}>
                    Start a chat
                  </Button>
                )
              }
            />
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-txt-faint">
        History is stored in localStorage for this demo. Clearing site data or resetting the workspace erases it.
      </p>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameId(null)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!renameValue.trim()}
              onClick={() => {
                if (!renameTarget) return
                actions.renameSession(renameTarget.id, renameValue.trim())
                setRenameId(null)
                pushToast({ tone: 'success', title: 'Conversation renamed' })
              }}
            >
              Save name
            </Button>
          </>
        }
      >
        <label className="text-[11px] text-txt-muted">
          Title
          <Input
            className="mt-1"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter' && renameValue.trim() && renameTarget) {
                actions.renameSession(renameTarget.id, renameValue.trim())
                setRenameId(null)
              }
            }}
          />
        </label>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteId(null)}
        title="Delete conversation?"
        description="This removes the conversation and its messages from this browser. Productions and deliverables are managed separately under Active Productions."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                if (!deleteTarget) return
                actions.deleteSession(deleteTarget.id)
                setDeleteId(null)
                pushToast({ tone: 'info', title: 'Conversation deleted' })
              }}
            >
              Delete conversation
            </Button>
          </>
        }
      >
        <p className="text-[12px] text-txt-muted">“{deleteTarget?.title}”</p>
      </Modal>
    </div>
  )
}
