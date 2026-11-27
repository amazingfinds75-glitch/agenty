# Agent Workforce

The live multi-agent production system behind AI Viral Studio. It is separate from the studio canvas:
the studio pages are a timer-driven preview, while `/workforce` shows real persisted jobs executed by the
local server.

## Entry points

- **Chat** — every brief sent from the home composer also POSTs to `/api/workforce/productions`. The
  assistant reply links to the production and states how many specialists the manager planned and created.
- **Dashboard** — `/#/workforce` (Live board, Specialists, Improvements). Deep link: `/#/workforce?p=<productionId>`.
- **API** — `/api/workforce/*` (listed in `GET /api`).

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

## What is real vs blocked

| Area | State |
| --- | --- |
| Planning, task graph, parallel execution, retries | Real, local |
| Specialist creation, versions, memory, evaluations | Real, persisted |
| Research signals | Real public RSS/search feeds when reachable; labeled when no match |
| Script, storyboard, captions, metadata, QC | Real output from the local directive engine (not a model) |
| Browser video render + server verification | Real; 30s Reel verified end to end |
| LLM (OpenAI / Anthropic / Gemini) | Not configured. Adapters exist; merge path untested without a key |
| TTS narration audio | Not implemented. Script and timing exist, no speech track |
| External video providers (Luma, Replicate) | Not configured. Never reported as successful |
| Publishing (YouTube, Instagram) | Not implemented. Manual download only |

## Verification (2026-11-27)

- End-to-end: a 30-second Instagram Reel brief typed into the chat created `prd_bcde759cf8e54494`; 13/13
  tasks, 13 distinct agents, 30 artifacts, quality 70%, 103 events. The browser rendered a **9,930,909-byte
  `video/mp4`** (`ftypisom` header) that downloaded through the API unchanged. The file and all state were
  still present after a server restart.
- `node scripts/workforce-tests.mjs` passes: agent create → patch (v2) → memory → sandbox test (score
  0.83) → retire; improvement approve (v+1) → rollback; pause → resume → cancel; 2 tasks observed
  overlapping; factory refill of a retired Thumbnail specialist during a new brief.
- `node scripts/e2e-reel.mjs` automates the chat → workforce → render → download path in headless Chrome.
- Task-level retry is implemented but was not force-triggered in the latest run; production-level failure
  and retry are recorded in the event log.

## Run

```bash
npm run build
npm run server        # http://localhost:8787
node scripts/e2e-reel.mjs
node scripts/workforce-tests.mjs
```

Write endpoints accept an optional `Authorization: Bearer <API_TOKEN>` check when `API_TOKEN` is set.
Model calls additionally require a provider key and the agent's `canCallModel` permission.
