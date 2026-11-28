# Agent Workforce

The live multi-agent production system behind AI Viral Studio. It is separate from the studio canvas:
the studio pages are a timer-driven preview, while `/workforce` shows real persisted jobs executed by the
local server.

## Entry points

- **Chat** — every brief sent from the home composer also POSTs to `/api/workforce/productions`. The
  assistant reply links to the production and states how many specialists the manager planned and created.
- **Dashboard** — `/#/workforce` (Live board, Specialists, Improvements, Runtimes). Deep link: `/#/workforce?p=<productionId>`.
- **Runtimes** — `/#/workforce` → Runtimes tab shows the live local runtime, Qoder Cloud status and any Qoder Desktop
  IDE agent profiles found on this machine, with an explicit callable / not-callable reason for each.
- **API** — `/api/workforce/*` (listed in `GET /api`), including `events/stream` and `runtime/*`.

## Runtime

- 13-stage pipeline: research → strategy → script → fact-check → storyboard → narration → visual design →
  video edit → captions → thumbnail → metadata → QC → producer review. Dependencies are explicit; two
  independent tasks run at once (`CONCURRENCY = 2`).
- Tasks retry twice (`MAX_ATTEMPTS = 2`) with backoff; failures are recorded in memory and on the board.
- State is JSON at `server/data/workforce.json` (agents, memory, versions, productions, tasks, artifacts,
  evaluations, improvements, event log); renders live in `server/data/renders/`. Both survive restarts.
- Agent Factory: the manager asks for a capability, finds no active specialist, and creates one from the
  capability template (`agent.created` event). Operators can also register, version, test, give memory to
  and retire specialists; no cap on the roster.
- Improvement cycle: evaluation → measured proposal → before/after sandbox test against the previous
  directives → human approve or reject → rollback. Approval is refused when `test.passed` is false.
- Render path: the browser paints the storyboard on canvas, captures it with MediaRecorder (MP4 when the
  browser supports H.264, otherwise WebM), uploads the bytes, and the server verifies the container
  signature (`ftyp` / EBML `1A 45 DF A3`) before storing. Downloads support Range requests.
- Live events: the dashboard subscribes to `GET /api/workforce/events/stream` (server-sent events, replay
  from `Last-Event-ID`, 15s heartbeats) and falls back to 3s polling when the stream drops. Event rows are
  stored engine events with a monotonic `seq`.
- Script gate: `requireScriptApproval` pauses the production at `awaiting_script_approval`. `POST
  /api/workforce/productions/:id/approve-script` continues; `POST .../revision` resets the script and every
  transitive downstream task, writes the operator note into each affected agent's memory and re-runs them.

## Qoder integration

| Runtime | What it is | State |
| --- | --- | --- |
| local-runtime | The engine in this repo; all specialists actually execute here | Connected, live |
| qoder-cloud | Qoder Cloud Agents API (beta), managed sessions | Wired server-side; `not_configured` until `QODER_ACCESS_TOKEN` is set |
| qoder-ide | Agent profiles in `~/.qoder/agents` / `./.qoder/agents` | Discovered and listed, `callable: false` |

Qoder Desktop agent profiles are hosted inside the Desktop process and exposed only to Desktop host tools;
they have no public endpoint, so the website cannot call them. The Runtimes tab says so per agent. Qoder
Cloud is the supported external path: `server/lib/qoder/client.mjs` talks to
`https://api.qoder.com/api/v1/cloud` (sessions, messages, events, SSE proxy) using a token read from the
server environment only. `GET /api/health` reports the redacted status; no token or provider key is ever
returned to the browser or written to disk. Session creation without a token returns 503 `not_configured`
instead of a fake success.

## What is real vs blocked

| Area | State |
| --- | --- |
| Planning, task graph, parallel execution, retries | Real, local |
| Specialist creation, versions, memory, evaluations | Real, persisted |
| Research signals | Real public RSS/search feeds when reachable; labeled when no match |
| Script, storyboard, captions, metadata, QC | Real output from the local directive engine (not a model) |
| Browser video render + server verification | Real; 30s Reel verified end to end |
| Live dashboard event stream (SSE) | Real; replay + polling fallback verified against the running engine |
| Script approval gate and operator revisions | Real; gate, approval, downstream reset and re-run verified |
| Qoder Cloud sessions | Wired; blocked without `QODER_ACCESS_TOKEN` (503, never simulated) |
| Qoder Desktop IDE agents | Found on disk and shown as IDE-local; not callable by a deployed site |
| LLM (OpenAI / Anthropic / Gemini) | Not configured. Adapters exist; merge path untested without a key |
| TTS narration audio | Not implemented. Script and timing exist, no speech track |
| External video providers (Luma, Replicate) | Not configured. Never reported as successful |
| Publishing (YouTube, Instagram) | Not implemented. Manual download only |

## Verification (2026-11-27)

- End-to-end: a 30-second Instagram Reel brief typed into the chat created `prd_883b4d197cfc4b02`;
  13/13 tasks, 13 distinct agents, 31 artifacts, quality 70%, 103 events. Chrome rendered an
  **11,093,538-byte `video/mp4`** (`ftypisom` header) that downloaded through the API unchanged.
- Browser recovery: `scripts/cdp-workforce-check.mjs` verified the Runtimes tab shows Qoder Cloud as
  unconfigured and the discovered Desktop agent as not callable, the production feed reports **live SSE**,
  and the selected production plus event history reappeared after a reload. Console errors: 0.
- Runtime registry: `/api/workforce/runtime/status?probe=1` reported `local-runtime: connected`,
  `qoder-cloud: not_configured`, `qoder-ide: detected_not_callable`; session creation without a token
  returned the expected 503. No token or provider key appears in any browser response.
- Script review / revision: `prd_8856d897db514772` paused at script approval, resumed to 13/13, accepted a
  revision that reset 10 dependent tasks and added a correction memory, changed the script hook, then
  paused again at the next script gate.
- `node scripts/workforce-tests.mjs` passes: agent create → patch (v2) → memory → sandbox test → retire;
  improvement approve (v+1) → rollback; pause → resume → cancel; 2 tasks observed overlapping; factory
  refill of a retired Thumbnail specialist during a new brief.
- `node scripts/e2e-reel.mjs` automates the chat → workforce → render → download path in headless Chrome.
- Task-level retry is implemented but was not force-triggered in the latest run; production-level failure
  and retry are recorded in the event log.

## Run

```bash
npm run build
npm run server        # http://localhost:8787
node scripts/e2e-reel.mjs
node scripts/workforce-tests.mjs
node scripts/cdp-workforce-check.mjs
```

Set `STUDIO_BASE=http://127.0.0.1:<port>` to point the verification scripts at another local backend.

Write endpoints accept an optional `Authorization: Bearer <API_TOKEN>` check when `API_TOKEN` is set.
Model calls additionally require a provider key and the agent's `canCallModel` permission.
