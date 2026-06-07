# Demo Enrichment Pipeline + Automated Record/Replay — Design

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` (branch `demo-enrichment`, off `main` `eddffa5`)
**Status:** Approved (spec review passed 2026-06-06; dining source locked to `tripadvisor_search`) → writing-plans

## Goal

Make the demo trip *rich* — past flights+hotels to **excursions, free things to do, dining
"local picks," boilerplate "includes," and a day-by-day itinerary** — and ship an
**automated "▶ Watch the demo" mode** that replays one curated golden run flawlessly ($0,
deterministic) while the existing free-form chat stays as the interactive mode.

This is **sub-project 1** of a larger effort. Goal A ("show off the rich resulting itinerary
without much user intervention"). The interactive selection-board work (Goal B) largely already
exists from the shipped `claude-skin` session; sub-project 2 will extend it (excursion boards,
folio-board edits).

## Context (verified against the codebase)

- The demo is a hand-rolled MCP agent host: `worker/session-do.ts` runs `runAgentLoop`
  (`worker/agent/loop.ts`) over a restricted `DEMO_TOOLS` catalog, streaming SSE
  (`shared/events.ts`) to a React SPA (`web/src/App.tsx`). Search results come from
  **deterministic fixtures** (`worker/mcp/replay.ts`, captured by `scripts/capture-fixtures.mjs`);
  `save_trip`/`patch_trip`/`read_trip` run **live against staging**. A daily USD budget cap and an
  Engineering Inspector (telemetry) already exist.
- The folio re-projects after each trip-mutating tool call: `session-do.ts` `onFolio` →
  `read_trip` → `tripToFolio` (`worker/agent/folio-sync.ts`) → `{type:"folio"}` SSE →
  `setFolio`. **`isTripMutating` already includes `excursion_search`/`confirm_lodging`/`add_booking`**,
  so enrichment mutations re-project the folio for free.
- The shipped `claude-skin` session added (all in `main`): the `?skin=claude` split-screen,
  interactive flight/hotel boards, the `{type:"board"}` SSE event + `worker/agent/boards.ts`,
  a `boardsMode` latch + `BOARDS_WORKFLOW_OVERRIDE` constant in `session-do.ts`, an optional
  `buildBoard` hook in `loop.ts`, and `App.tsx`'s timeline (`items: TimelineItem[]`).
  `replay.ts` was **untouched** by that session.

## Scope split (coordinated with `claude-skin`, per the worktree journal)

**This sub-project (`demo-enrichment`) OWNS:**
- Worker enrichment: new `DEMO_TOOLS`, a separate additive `ENRICHMENT_WORKFLOW` prompt
  constant, `replay.ts` fixtures + slim mappers for the new tools.
- The `FolioData` **data-shape extension** (day-by-day / activities / dining / includes) and
  `tripToFolio` projection of it. *Rendering* the new fields in `FolioArtifact` (claude skin)
  and `FolioPanel` (board skin).
- The **record/replay** system and the **auto-vs-interactive MODE axis** (a sibling of the
  skin axis).

**Out of scope (owned elsewhere / deferred):**
- Board presentation + the `board` event + `boards.ts` + `BOARDS_WORKFLOW_OVERRIDE` (`claude-skin`, shipped).
- A `kind:"excursion"` *selection* board — **deferred**, ping `claude-skin` before adding (sub-project 2).
- Demo-safety layer / demo advisor subdomain / public exposure (separate deferred slice).
- Folio-board inline-edit *interaction* in the interactive mode (sub-project 2).

## Architecture

Two independent components. Component A is worker-only (enrichment); Component B is
client-only (record/replay). They meet only at the existing `{type:"folio"}` event and the
extended `FolioData` shape.

```
Component A (worker)                          Component B (client)
  DEMO_TOOLS += excursion/gap/dining            ?record=1 → capture {delayMs, frame}[] → export JSON
  SYSTEM_HINT += ENRICHMENT_WORKFLOW            golden-recording.json (committed)
  replay.ts += fixtures + slim mappers          replayChat(recording, onEvent) → same App reducer, paced
  FolioData += days[]/includes[]                ?mode=auto → "▶ Watch the demo" plays it (in claude skin)
  tripToFolio projects them
            │                                              │
            └──────── {type:"folio"} SSE (richer FolioData) ───── rendered by FolioArtifact + FolioPanel
```

## Component A — Content enrichment (worker only)

### A1. Tool catalog (`session-do.ts` `DEMO_TOOLS`)
Add (names verified against the live voygent catalog during planning):
- `excursion_search` (Viator — licensed/safe) and its promote/apply step,
- `suggest_gap_tours` / `apply_gap_tour_picks` (free things to fill open days),
- one dining source — `tripadvisor_search` (local picks). **Locked 2026-06-06** (was a
  `google_places_lookup`-vs-`tripadvisor_search` choice; Neil chose TripAdvisor for meal recs for now).

Keep the cost guardrail intact: only the tools the golden run uses are added; the Inspector's
`toolCatalog` savings number simply reflects the new (still-small) count.

### A2. Prompt (`session-do.ts`)
Add a **separate** `ENRICHMENT_WORKFLOW` constant (mirrors how `claude-skin` added
`BOARDS_WORKFLOW_OVERRIDE` — `SYSTEM_HINT` stays byte-identical to avoid merge friction).
Appended to the seed message for all sessions. It extends the one-category-at-a-time workflow:
after hotels → **excursions** (pick 2–3) → **free activities** to fill open days →
**dining local picks** (framed explicitly as suggestions, not bookable inventory) →
**includes** (what's-included / travel tips, template-seeded). Data-integrity rule unchanged:
tool data only for bookable items; dining clearly framed as editorial.

It must compose with `BOARDS_WORKFLOW_OVERRIDE`: in boards mode, flights/hotels still
present-and-wait; enrichment categories (no boards yet) auto-add. The two prompt constants are
orthogonal and both appended.

### A3. Fixtures (`worker/mcp/replay.ts`)
Mirror the existing `slimFlight`/`slimHotel` + `INTERCEPTED` + `FIXTURE_BY_ID` pattern: add
`slimExcursion`/`slimActivity`/`slimDining` mappers, add the new search/list tools to
`INTERCEPTED`, and extend `scripts/capture-fixtures.mjs` to capture real results for the golden
trip once.

**Fabrication guarantee (must preserve):** enrichment writes into the trip must be
fixture-grounded the same way promote_* is. Excursion/activity/dining items the agent stages
must carry real fixture candidate ids, and the promote/apply step (or an interception in
`replay.ts`) must write **only** fixture-keyed objects — so the model can never inject invented
excursion/dining data into the folio. Exact mechanism (which voygent tool promotes excursions,
whether it needs a `replay.ts` interception) is resolved in the plan against the live tools.

### A4. Folio data shape (`shared/events.ts` + `worker/agent/folio-sync.ts`)
Extend `FolioData` (additive — existing `flights`/`hotels` unchanged), mirroring voygent's
`FolioBoardData` (`src/folio-board/types.ts`):
```ts
export interface FolioActivity { time?: string; name: string; description?: string; url?: string }
export interface FolioDining   { name: string; description?: string; cuisine?: string; url?: string }
export interface FolioDay {
  date?: string; title: string; location?: string;
  activities: FolioActivity[]; dining: FolioDining[]; stay?: string;
}
export interface FolioInclude { key: string; title: string; body: string } // plain text/markdown, escaped at render
export interface FolioData {
  tripId: string; title: string;
  flights: FolioFlight[]; hotels: FolioHotel[];
  days?: FolioDay[];          // NEW — day-by-day (activities = excursions + free things; dining)
  includes?: FolioInclude[];  // NEW — boilerplate "what's included / tips"
}
```
`tripToFolio` projects `days`/`includes` from the staging trip (its `itinerary[]`/`days[]`,
`excursions`, `includes` as written by the voygent enrichment tools — exact source fields
verified during the capture run, mirroring voygent's DayBlock projection). Tolerant of absent
fields (older/partial trips render flights+hotels only, as today).

### A5. Rendering (client)
Extend the two existing folio renderers to show `days`/`includes` (handoff names both):
- `web/src/FolioArtifact` (in `ClaudeChatView.tsx`) — claude skin inline card.
- `web/src/FolioPanel.tsx` — board skin sidebar.
New fields render only when present; absent → unchanged. Board-skin uses its amber classes;
claude-skin uses `cl-*` (never cross the token namespaces — the claude CSS firewall rule).

## Component B — Automated record/replay (client only)

The client already receives every SSE event in `App.tsx`'s `send()` reducer, so record/replay
needs **no worker change**.

### B1. Recorder (`?record=1`)
A capture wrapper around the event callback buffers an ordered list of frames with inter-frame
delays, plus the synthetic user turns (the scripted prompt + board picks + edits), and exports
JSON (download / console). Recording schema:
```ts
type Frame =
  | { delayMs: number; kind: "user"; text: string }      // push user msg + assistant placeholder, busy=true
  | { delayMs: number; kind: "event"; event: ServerEvent } // run through the shared reducer
  | { delayMs: number; kind: "turn-end" };                 // busy=false
interface Recording { skin: "claude"; trip: string; frames: Frame[] }
```
Captured once, live, by Neil running `/?skin=claude&record=1` through the full golden flow.
Committed as `web/src/recordings/<trip>.json`.

### B2. Reducer extraction (`App.tsx`)
Extract the inline per-event handler in `send()` (lines ~66–115) into a single
`applyEvent(e: ServerEvent, claude: boolean)` closure over the existing setters, called by
**both** the live stream callback and the replay player. Pure refactor — live behavior
byte-identical (guarded by the existing E2E + a new test).

### B3. Replay player (`replayChat` + `?mode=auto`)
`replayChat(recording, { applyEvent, pushUser, setBusy })` walks frames on a timer (honoring
`prefers-reduced-motion` by compressing delays), driving the same reducer → pixel-identical to
a live run. The **mode axis** (`?mode=auto`, persisted like skin) is orthogonal to the skin
axis; auto mode loads the claude skin and plays the golden recording. A "▶ Watch the demo /
Build your own" entry control (placement coordinated with the demo chrome — likely near
`SkinSwitch`). A restart control; optional autoplay on `?mode=auto`.

### B4. The golden recording (captured last)
After A + B land and merge, capture one Dublin run covering: build rich trip → flight board →
pick → hotel board → pick → excursions/free/dining/includes auto-add → rich folio → 1–2
simulated edits (exact edits chosen with Neil at capture) → folio updates + LLM acknowledgment.
Hand-trim timings if needed; commit.

## Data flow (golden showcase, replayed)
```
?mode=auto → load claude skin → replayChat(dublin.json)
  paced frames → applyEvent → items[]/folio/inspector update
  user-turn frames → user bubble + assistant placeholder
  board events → BoardView cards; the recorded "pick" frame highlights + sends the selection text
  folio events (progressively richer) → FolioArtifact shows flights→hotels→days→dining→includes
  edit frames → folio re-renders + assistant acknowledges
  → identical to a live run, $0, deterministic
```

## Testing
- `worker/mcp/replay.test.ts` extended: new fixtures → correct slim candidates/ids; promote/apply
  writes only fixture-keyed enrichment (fabrication guard holds for excursions/dining).
- `worker/agent/folio-sync.test.ts` extended: `tripToFolio` projects `days`/`includes` from a
  representative enriched trip; absent fields → flights/hotels-only (unchanged).
- New `web/src/lib/recording.test.ts`: frame schema + a tiny replay drives the reducer to an
  expected `items`/`folio` end-state (logic-level, matching the repo's "test logic not DOM"
  convention — no DOM-test stack added).
- `web/src/App` reducer extraction: a test asserting `applyEvent` produces the same state the
  inline reducer did for a representative event sequence.
- Regression: default `/` (board skin, no auto, no record) byte-identical; `npx tsc --noEmit`
  clean; full `vitest` green.

## Decisions locked
- Automated mode = **record-then-replay** (client-side, $0, deterministic).
- Boards/folio = the **real voygent surfaces** (claude-skin's claude.ai-style cards / the
  shipped board event); **no amber-CRT reskin** of boards.
- Skin is **another session's concern**; this work is skin-agnostic (worker + data + replay).
- Dining/free = **mixed** (excursions + free via real tools; dining as framed editorial picks).
  Dining source = **`tripadvisor_search`** (locked 2026-06-06).
- Golden/dev trip = **Dublin** (existing fixtures; claude-skin's test trip). Swappable.
- Soft defaults, decided at capture: the exact 1–2 showcased edits.

## Open items resolved during planning (not blockers)
- Exact voygent tool names/return shapes for excursion/gap/dining (dining = `tripadvisor_search`,
  locked) + the excursion promote/apply mechanism (verify against the live catalog).
- The trip-side fields the enrichment tools write (drives `tripToFolio` source paths).
- Placement of the "Watch the demo / Build your own" entry control vs `SkinSwitch`.
