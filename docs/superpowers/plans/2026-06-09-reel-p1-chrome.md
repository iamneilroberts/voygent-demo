# Reel Replay P1 (Intro · Pacing · Callouts · End CTA · Registry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the voygent-demo reel from a bare autoplay into a framed, watchable, self-explaining marketing experience: an intro gate, readable pacing with a 1×/2× control, pause-and-explain callouts on the engineered moments, an end "Try it yourself" CTA into live mode with a greeting, and a registry so multiple reels can rotate on load.

**Architecture:** Client-only, claude-skin native. No worker / MCP / faithful / fixtures changes. The existing client-side player (`web/src/lib/recording.ts` `replayChat`) is extended with a semantic pacing layer, a speed getter, and a highlight track that pauses playback and surfaces a callout. `App.tsx` gains a reel lifecycle (`intro → playing → ended`) and renders three claude-skin overlays. A reel registry replaces the hardcoded `dublin-oct.json` import; P1 ships one reel (Dublin), more are incremental content.

**Tech Stack:** TypeScript, React (function components + hooks), Vite, Vitest. Existing patterns: shared `ServerEvent` reducer (`applyEvent`), `cl-*` claude-skin CSS namespace (`web/src/skin-claude.css`), "test logic not DOM" (pure modules unit-tested; presentational JSX verified by `tsc` + manual smoke).

**Spec:** `docs/superpowers/specs/2026-06-09-reel-p1-chrome-design.md`

---

## Pre-flight (execution time)

- Create an isolated worktree before writing code (another session shares this clone). Use `superpowers:using-git-worktrees`, slug `reel-p1`. Or `/branch reel-p1`.
- Baseline: from repo root run `npx tsc --noEmit` (clean) and `npx vitest run` (all green) before Task 1. If baseline is red, stop and report.
- Copy-voice rule for ALL strings in this plan: no em-dashes; plain cadence (memory `feedback-demo-copy-voice-no-em-dash`). The strings below already follow it; keep it when editing.

---

## File Structure

**Create:**
- `web/src/lib/pacing.ts` — `computeDelay(frame, prev, opts)`: semantic per-event display delay + speed divisor. One responsibility: pacing math.
- `web/src/lib/pacing.test.ts` — pacing unit tests.
- `web/src/lib/highlights.ts` — `Highlight`/`HighlightTrack` types + `resolveHighlightFrames(frames, highlights)` (maps each highlight to the frame index it fires after, via an event matcher).
- `web/src/lib/highlights.test.ts` — matcher/resolver unit tests.
- `web/src/recordings/dublin-oct.highlights.json` — the Dublin sidecar highlight track (4 callouts).
- `web/src/recordings/registry.ts` — `ReelEntry`, `REELS`, `selectReel(search)` (round-robin + `?reel=` override).
- `web/src/recordings/registry.test.ts` — rotation/override tests.
- `web/src/ReelIntro.tsx` — intro modal (Direction A).
- `web/src/ReelCallout.tsx` — spotlight dim + anchored callout card.
- `web/src/ReelEndCard.tsx` — end bookend card.

**Modify:**
- `web/src/lib/recording.ts` — extend `ReplayOpts` (`speed`, `highlights`, `onHighlight`) + `ReplayHandlers`; use pacing + fire highlights.
- `web/src/lib/recording.test.ts` — add highlight pause/resume test.
- `web/src/ClaudeChatView.tsx` — `postReel` prop: greeting banner + post-reel Welcome lead.
- `web/src/App.tsx` — reel lifecycle, `selectReel`, overlays, speed state, `onHighlight`, replay/reset, plan-your-own / try-it-yourself handlers.
- `web/src/skin-claude.css` — `cl-reel-*` styles (intro, callout, end, speed toggle, greeting banner).

---

## Task 1: Pacing module (`pacing.ts`)

**Files:**
- Create: `web/src/lib/pacing.ts`
- Test: `web/src/lib/pacing.test.ts`

Semantic pacing replaces "trust the captured delay". Rules (constants tunable in one place):
- `text` delta → typing cadence: `clamp(delta.length * MS_PER_CHAR, TEXT_MIN, TEXT_MAX)`.
- `board` event → `BOARD_DWELL` (read time for options).
- `folio` event → `FOLIO_DWELL`.
- `tool` event → `TOOL_BEAT` (small; caps real dead air).
- `inspector` / `turn-complete` / `error` → `MICRO` (near-instant, board-side telemetry).
- `user` frame → `USER_BEAT` (a new question registers).
- `turn-end` frame → `TURN_BEAT`.
Then divide by `speed` (>=1). `reducedMotion` collapses every result to `REDUCED` (small fixed).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/pacing.test.ts
import { describe, it, expect } from "vitest";
import { computeDelay } from "./pacing";
import type { Frame } from "./recording";

const ev = (e: any): Frame => ({ delayMs: 0, kind: "event", event: e });

describe("computeDelay", () => {
  it("gives boards a long readable dwell and tools a short beat", () => {
    const board = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1 });
    const tool = computeDelay(ev({ type: "tool", tool: "flight_search", phase: "done" }), null, { speed: 1 });
    expect(board).toBeGreaterThan(tool);
    expect(board).toBeGreaterThanOrEqual(2000);
  });

  it("scales text by length within clamps", () => {
    const short = computeDelay(ev({ type: "text", delta: "Hi" }), null, { speed: 1 });
    const long = computeDelay(ev({ type: "text", delta: "x".repeat(400) }), null, { speed: 1 });
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(2500); // TEXT_MAX
    expect(short).toBeGreaterThanOrEqual(120); // TEXT_MIN
  });

  it("2x is ~half of 1x", () => {
    const one = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1 });
    const two = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 2 });
    expect(two).toBe(Math.round(one / 2));
  });

  it("reducedMotion collapses everything to the reduced floor", () => {
    const d = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1, reducedMotion: true });
    expect(d).toBeLessThanOrEqual(120);
  });

  it("inspector events are near-instant (board-side telemetry)", () => {
    const d = computeDelay(ev({ type: "inspector", kind: "savings", exchangeId: "x", mechanism: "patch", tokensSaved: 1, basis: "chars/4", scope: "perTurn", detail: "" }), null, { speed: 1 });
    expect(d).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/pacing.test.ts`
Expected: FAIL ("Cannot find module './pacing'").

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/pacing.ts
import type { Frame } from "./recording";

export interface PacingOpts { speed: number; reducedMotion?: boolean }

const MS_PER_CHAR = 16;
const TEXT_MIN = 120, TEXT_MAX = 2500;
const BOARD_DWELL = 2600;
const FOLIO_DWELL = 1800;
const TOOL_BEAT = 700;
const MICRO = 90;
const USER_BEAT = 650;
const TURN_BEAT = 500;
const REDUCED = 90;

// Base (1x) display delay derived from event semantics, not the captured delay.
function baseDelay(f: Frame): number {
  if (f.kind === "user") return USER_BEAT;
  if (f.kind === "turn-end") return TURN_BEAT;
  const e = f.event;
  switch (e.type) {
    case "text": return Math.min(TEXT_MAX, Math.max(TEXT_MIN, e.delta.length * MS_PER_CHAR));
    case "board": return BOARD_DWELL;
    case "folio": return FOLIO_DWELL;
    case "tool": return TOOL_BEAT;
    default: return MICRO; // inspector, turn-complete, error
  }
}

export function computeDelay(f: Frame, _prev: Frame | null, opts: PacingOpts): number {
  if (opts.reducedMotion) return REDUCED;
  const speed = opts.speed >= 1 ? opts.speed : 1;
  return Math.round(baseDelay(f) / speed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/pacing.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pacing.ts web/src/lib/pacing.test.ts
git commit -m "feat(reel): semantic pacing module (readable per-event dwell + speed divisor)"
```

---

## Task 2: Highlight types + resolver (`highlights.ts`)

**Files:**
- Create: `web/src/lib/highlights.ts`
- Test: `web/src/lib/highlights.test.ts`

A highlight pins to the frame index of the **nth event matching a matcher** (`eventType` + optional `kind` + optional `where` field equality). `resolveHighlightFrames` returns `Map<frameIndex, Highlight>` (fires AFTER that frame applies). Unmatched highlights are skipped (logged by caller), never throw.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/highlights.test.ts
import { describe, it, expect } from "vitest";
import { resolveHighlightFrames, type Highlight } from "./highlights";
import type { Frame } from "./recording";

const ev = (e: any): Frame => ({ delayMs: 0, kind: "event", event: e });
const frames: Frame[] = [
  { delayMs: 0, kind: "user", text: "Plan Dublin" },
  ev({ type: "board", kind: "flight", boardId: "b1", tripId: "t", candidates: [] }),
  ev({ type: "inspector", kind: "savings", exchangeId: "x", mechanism: "patch", tokensSaved: 1, basis: "chars/4", scope: "perTurn", detail: "" }),
  ev({ type: "inspector", kind: "validation", exchangeId: "x", check: "c", label: "L", status: "repaired" }),
];

const hl = (match: Highlight["match"]): Highlight => ({ match, anchor: "board", eyebrow: "E", title: "T", body: "B" });

describe("resolveHighlightFrames", () => {
  it("maps a matcher to the index of the matching frame", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "board", kind: "flight" })]);
    expect([...m.keys()]).toEqual([1]);
  });
  it("matches on a where-field (validation status)", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "inspector", kind: "validation", where: { status: "repaired" } })]);
    expect([...m.keys()]).toEqual([3]);
  });
  it("skips a highlight whose matcher never matches", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "board", kind: "hotel" })]);
    expect(m.size).toBe(0);
  });
  it("nth selects the nth match (1-based)", () => {
    const two = [...frames, ev({ type: "inspector", kind: "savings", exchangeId: "y", mechanism: "template", tokensSaved: 2, basis: "chars/4", scope: "perTurn", detail: "" })];
    const m = resolveHighlightFrames(two, [hl({ eventType: "inspector", kind: "savings", nth: 2 })]);
    expect([...m.keys()]).toEqual([4]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/highlights.test.ts`
Expected: FAIL ("Cannot find module './highlights'").

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/highlights.ts
import type { Frame } from "./recording";
import type { ServerEvent } from "../../../shared/events";

export interface HighlightMatch {
  eventType: ServerEvent["type"];        // "inspector" | "board" | "folio" | "tool" | "text" | ...
  kind?: string;                          // inspector kind or board kind
  where?: Record<string, string>;         // field equality on the event (stringified), e.g. { status: "repaired" }
  nth?: number;                           // 1-based; default 1
}

export interface Highlight {
  match: HighlightMatch;
  anchor: "chat" | "board";
  eyebrow: string;
  title: string;
  body: string;
  dwellMs?: number;                       // default applied by the player (~4000)
}

export interface HighlightTrack { trip: string; highlights: Highlight[] }

function frameMatches(f: Frame, m: HighlightMatch): boolean {
  if (f.kind !== "event") return false;
  const e = f.event as Record<string, unknown>;
  if (e.type !== m.eventType) return false;
  if (m.kind != null && String(e.kind) !== m.kind) return false;
  if (m.where) for (const [k, v] of Object.entries(m.where)) if (String(e[k]) !== v) return false;
  return true;
}

// Map each highlight to the frame index of its nth match. Unmatched → omitted.
export function resolveHighlightFrames(frames: Frame[], highlights: Highlight[]): Map<number, Highlight> {
  const out = new Map<number, Highlight>();
  for (const h of highlights) {
    const target = h.match.nth ?? 1;
    let seen = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frameMatches(frames[i], h.match)) {
        seen++;
        if (seen === target) { out.set(i, h); break; }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/highlights.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/highlights.ts web/src/lib/highlights.test.ts
git commit -m "feat(reel): highlight track types + event-matcher frame resolver"
```

---

## Task 3: Author the Dublin highlight track

**Files:**
- Create: `web/src/recordings/dublin-oct.highlights.json`

The four approved moments, anchored to beats verified present in `dublin-oct.json` (recovery=validation/repaired ×1, savings ×10, summary ×3, flight board ×1).

- [ ] **Step 1: Confirm the anchors exist in the recording**

Run (from repo root):
```bash
grep -c '"status": "repaired"' web/src/recordings/dublin-oct.json   # expect 1
grep -c '"mechanism": "searchDistill"' web/src/recordings/dublin-oct.json  # expect 2
grep -c '"kind": "summary"' web/src/recordings/dublin-oct.json      # expect 3
grep -c '"type": "board", "kind": "flight"' web/src/recordings/dublin-oct.json   # expect 1 (allow spacing variance; if 0, try: grep -c '"kind": "flight"')
```
Expected: the recovery (1), searchDistill (2), summary (3), and a flight board exist. If any is 0, adjust that highlight's matcher to an existing beat (e.g. recovery → `inspector kind:savings nth:1`) and note it in the commit.

- [ ] **Step 2: Write the track**

```json
{
  "trip": "dublin-oct",
  "highlights": [
    {
      "match": { "eventType": "board", "kind": "flight", "nth": 1 },
      "anchor": "chat",
      "eyebrow": "Real supplier data",
      "title": "These are real live fares",
      "body": "Every option here came from a live flight search, not from the model's imagination. Voygent only writes real, sourced inventory into a trip."
    },
    {
      "match": { "eventType": "inspector", "kind": "savings", "where": { "mechanism": "searchDistill" }, "nth": 1 },
      "anchor": "board",
      "eyebrow": "Context saved",
      "title": "It distilled a big search instead of resending it",
      "body": "A full supplier response is large. Voygent keeps a slim version in context and reuses it, so later turns stay cheap. The engineering panel counts the tokens saved."
    },
    {
      "match": { "eventType": "inspector", "kind": "validation", "where": { "status": "repaired" }, "nth": 1 },
      "anchor": "board",
      "eyebrow": "Self-correction",
      "title": "It caught a problem and fixed it",
      "body": "A trip-integrity check found something off in the projected trip and repaired it in place. The panel logs the check honestly, pass or repaired."
    },
    {
      "match": { "eventType": "inspector", "kind": "summary", "nth": 1 },
      "anchor": "board",
      "eyebrow": "What it cost",
      "title": "A full planning session for pennies",
      "body": "Model routing and context discipline keep spend low. This is measured routed cost for the whole run, not an estimate."
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/recordings/dublin-oct.highlights.json
git commit -m "feat(reel): Dublin highlight track (supplier, context-saved, self-correction, cost)"
```

---

## Task 4: Reel registry + rotation (`registry.ts`)

**Files:**
- Create: `web/src/recordings/registry.ts`
- Test: `web/src/recordings/registry.test.ts`

`selectReel(search)`: `?reel=<id>` wins; else round-robin via a localStorage counter (reproducible for QA, swappable). Pure core `pickReel(reels, param, counter)` is unit-tested; `selectReel` wraps it with URL/localStorage I/O.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/recordings/registry.test.ts
import { describe, it, expect } from "vitest";
import { pickReel, type ReelEntry } from "./registry";

const reels = [{ id: "a" }, { id: "b" }, { id: "c" }] as ReelEntry[];

describe("pickReel", () => {
  it("honors an explicit ?reel id", () => {
    expect(pickReel(reels, "b", 0).id).toBe("b");
  });
  it("ignores an unknown ?reel id and falls back to rotation", () => {
    expect(pickReel(reels, "zzz", 0).id).toBe("a");
  });
  it("round-robins by counter", () => {
    expect(pickReel(reels, null, 0).id).toBe("a");
    expect(pickReel(reels, null, 1).id).toBe("b");
    expect(pickReel(reels, null, 3).id).toBe("a");
  });
  it("always returns the only reel when there is one", () => {
    const one = [{ id: "dublin-oct" }] as ReelEntry[];
    expect(pickReel(one, null, 7).id).toBe("dublin-oct");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/recordings/registry.test.ts`
Expected: FAIL ("Cannot find module './registry'").

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";

export interface ReelEntry {
  id: string;
  title: string;        // shown on the intro card
  blurb: string;        // one honest line on the intro card
  durationLabel: string; // e.g. "~2 min"
  recording: Recording;
  highlights: Highlight[];
}

export const REELS: ReelEntry[] = [
  {
    id: "dublin-oct",
    title: "Five days in Dublin",
    blurb: "Watch Voygent build a real Dublin trip from live flights and hotels.",
    durationLabel: "~2 min",
    recording: dublin as Recording,
    highlights: (dublinHl as HighlightTrack).highlights,
  },
];

const ROT_KEY = "voygent-demo-reel-rot";

// Pure: explicit id wins; else round-robin by counter. Never throws.
export function pickReel(reels: ReelEntry[], param: string | null, counter: number): ReelEntry {
  if (param) { const hit = reels.find((r) => r.id === param); if (hit) return hit; }
  const i = ((counter % reels.length) + reels.length) % reels.length;
  return reels[i];
}

export function selectReel(search?: string): ReelEntry {
  let param: string | null = null;
  try { param = new URLSearchParams(search ?? window.location.search).get("reel"); } catch { /* default */ }
  let counter = 0;
  try { counter = parseInt(localStorage.getItem(ROT_KEY) ?? "0", 10) || 0; } catch { /* default */ }
  const entry = pickReel(REELS, param, counter);
  // advance rotation only when not explicitly overridden, so a shared ?reel link is stable
  if (!param) { try { localStorage.setItem(ROT_KEY, String(counter + 1)); } catch { /* ignore */ } }
  return entry;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/recordings/registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/recordings/registry.ts web/src/recordings/registry.test.ts
git commit -m "feat(reel): reel registry + round-robin selectReel (?reel override)"
```

---

## Task 5: Extend `replayChat` (pacing + speed + highlights)

**Files:**
- Modify: `web/src/lib/recording.ts`
- Test: `web/src/lib/recording.test.ts` (add a case)

`ReplayOpts` gains `speed?: () => number` (read per frame, default 1), `highlights?: Highlight[]`, and `ReplayHandlers` gains `onHighlight?: (h: Highlight) => Promise<void>`. Pacing replaces `delayMs * scale`. After applying a frame whose index is in the resolved highlight map, `await h.onHighlight(highlight)` (abortable). Existing `reducedMotion` still honored (now via pacing).

- [ ] **Step 1: Write the failing test (append to recording.test.ts)**

```ts
import { resolveHighlightFrames } from "./highlights"; // (top-of-file import; place with other imports)

describe("replayChat highlights", () => {
  it("invokes onHighlight after the matching frame and continues", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 1, kind: "event", event: { type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] } as ServerEvent },
      { delayMs: 1, kind: "event", event: { type: "text", delta: "done" } as ServerEvent },
      { delayMs: 1, kind: "turn-end" },
    ] };
    const fired: string[] = [];
    await replayChat(rec, {
      applyEvent: () => {},
      pushUser: () => {},
      setBusy: () => {},
      onHighlight: async (h) => { fired.push(h.title); },
    }, {
      wait: async () => {},
      highlights: [{ match: { eventType: "board", kind: "flight" }, anchor: "chat", eyebrow: "E", title: "Real fares", body: "B" }],
    });
    expect(fired).toEqual(["Real fares"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/recording.test.ts`
Expected: FAIL (onHighlight not invoked / type error on `highlights` opt).

- [ ] **Step 3: Implement — replace `recording.ts` lines 14-48**

```ts
// imports at top of recording.ts (add):
import { computeDelay } from "./pacing";
import { resolveHighlightFrames, type Highlight } from "./highlights";

export interface ReplayHandlers {
  applyEvent: (e: ServerEvent) => void;  // caller binds claude=true
  pushUser: (text: string) => void;      // user bubble + assistant placeholder
  setBusy: (b: boolean) => void;
  onHighlight?: (h: Highlight) => Promise<void>; // paused callout; resolves to resume
}

export interface ReplayOpts {
  reducedMotion?: boolean;
  wait?: (ms: number) => Promise<void>;  // injected in tests for instant playback
  signal?: AbortSignal;
  speed?: () => number;                  // current speed multiplier (>=1); read each frame
  highlights?: Highlight[];              // sidecar callouts for this recording
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function replayChat(rec: Recording, h: ReplayHandlers, opts: ReplayOpts = {}): Promise<void> {
  const wait = opts.wait ?? ((ms: number) => sleep(ms, opts.signal));
  const getSpeed = opts.speed ?? (() => 1);
  const hlMap = opts.highlights ? resolveHighlightFrames(rec.frames, opts.highlights) : null;
  let prev: Frame | null = null;
  for (let i = 0; i < rec.frames.length; i++) {
    const f = rec.frames[i];
    if (opts.signal?.aborted) return;
    await wait(computeDelay(f, prev, { speed: getSpeed(), reducedMotion: opts.reducedMotion }));
    if (opts.signal?.aborted) return;
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
    prev = f;
    const hit = hlMap?.get(i);
    if (hit && h.onHighlight) {
      if (opts.signal?.aborted) return;
      await h.onHighlight(hit);
    }
  }
}
```

(Keep `Frame` and `Recording` type declarations above unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/lib/recording.test.ts`
Expected: PASS (existing recorder + replay end-state tests + new highlight test).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/recording.ts web/src/lib/recording.test.ts
git commit -m "feat(reel): replayChat uses semantic pacing + fires highlight callouts"
```

---

## Task 6: Intro modal component (`ReelIntro.tsx`)

**Files:**
- Create: `web/src/ReelIntro.tsx`

Presentational (Direction A). Props drive copy + the two actions. No logic to unit-test; verified by `tsc` + manual smoke.

- [ ] **Step 1: Create the component**

```tsx
// web/src/ReelIntro.tsx
export function ReelIntro(
  { title, blurb, durationLabel, onWatch, onPlanYourOwn }:
  { title: string; blurb: string; durationLabel: string; onWatch: () => void; onPlanYourOwn: () => void },
) {
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label="Watch a real session">
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">▶ Watch a real session</div>
        <h2 className="cl-reel-h">{title}</h2>
        <p className="cl-reel-p">{blurb} Nothing in the results is scripted.</p>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={onWatch}>
          Watch the 2× replay<span className="cl-reel-btn-meta">{durationLabel}</span>
        </button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onPlanYourOwn}>
          Plan your own trip instead<span className="cl-reel-btn-meta">live · type anything</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean (component unused yet is fine; if "declared but never used" surfaces only at app wiring, ignore until Task 11).

- [ ] **Step 3: Commit**

```bash
git add web/src/ReelIntro.tsx
git commit -m "feat(reel): intro modal component (Direction A)"
```

---

## Task 7: Callout overlay component (`ReelCallout.tsx`)

**Files:**
- Create: `web/src/ReelCallout.tsx`

Dims the reel and shows the anchored callout card with an auto-resume progress bar and a Continue button. Anchoring is by pane region (`anchor: "chat" | "board"`) via a class, not pixel-locked to an element (robust). The auto-resume timer + the Continue click both call `onContinue`; App owns the resolve.

- [ ] **Step 1: Create the component**

```tsx
// web/src/ReelCallout.tsx
import { useEffect } from "react";
import type { Highlight } from "./lib/highlights";

export function ReelCallout(
  { highlight, dwellMs, onContinue }:
  { highlight: Highlight; dwellMs: number; onContinue: () => void },
) {
  // Auto-resume after dwell; the key on the element (App side) resets this per highlight.
  useEffect(() => {
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    const t = setTimeout(onContinue, reduced ? 0 : dwellMs);
    return () => clearTimeout(t);
  }, [dwellMs, onContinue]);

  return (
    <div className={`cl-reel-spotlight cl-reel-anchor-${highlight.anchor}`} role="note" aria-live="polite">
      <div className="cl-reel-callout">
        <div className="cl-reel-callout-ey">{highlight.eyebrow}</div>
        <h4 className="cl-reel-callout-h">{highlight.title}</h4>
        <p className="cl-reel-callout-b">{highlight.body}</p>
        <div className="cl-reel-callout-bar">
          <span className="cl-reel-prog"><i style={{ animationDuration: `${dwellMs}ms` }} /></span>
          <button type="button" className="cl-reel-continue" onClick={onContinue}>Continue ▶</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/ReelCallout.tsx
git commit -m "feat(reel): spotlight callout overlay (auto-resume + continue)"
```

---

## Task 8: End bookend component (`ReelEndCard.tsx`)

**Files:**
- Create: `web/src/ReelEndCard.tsx`

Honest recap chips (static for the current Dublin reel) + the two actions.

- [ ] **Step 1: Create the component**

```tsx
// web/src/ReelEndCard.tsx
const RECAP = ["✈ live flights", "🏨 live hotels", "↩ self-corrected", "◇ context cached", "low cost"];

export function ReelEndCard(
  { onTryYourself, onReplay }: { onTryYourself: () => void; onReplay: () => void },
) {
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label="That was a real session">
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">✓ That was a real session</div>
        <h2 className="cl-reel-h">Now it&#39;s your turn</h2>
        <p className="cl-reel-p">Everything you just watched was a real Voygent run. Nothing in the results was scripted.</p>
        <div className="cl-reel-recap">{RECAP.map((r) => <span key={r}>{r}</span>)}</div>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={onTryYourself}>Try it yourself →</button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onReplay}>↺ Replay the demo</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/ReelEndCard.tsx
git commit -m "feat(reel): end bookend card (honest recap + try-it-yourself CTA)"
```

---

## Task 9: Claude-skin CSS (`skin-claude.css`)

**Files:**
- Modify: `web/src/skin-claude.css` (append a `cl-reel-*` block; all rules scoped under `:root[data-skin="claude"]`)

- [ ] **Step 1: Append the styles**

```css
/* ============================ reel chrome (P1) ============================ */
/* Scrim + centered card (intro + end bookend) */
:root[data-skin="claude"] .cl-reel-scrim {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: #1f1e1c40; backdrop-filter: blur(2px);
}
:root[data-skin="claude"] .cl-reel-card {
  background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 16px;
  max-width: 480px; width: 100%; padding: 26px 28px 22px; box-shadow: 0 24px 60px #00000026; text-align: center;
}
:root[data-skin="claude"] .cl-reel-eyebrow {
  font: 600 .6875rem/1 var(--cl-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--cl-accent);
}
:root[data-skin="claude"] .cl-reel-h { font: 600 1.375rem/1.2 var(--cl-sans); margin: 11px 0 6px; letter-spacing: -.01em; }
:root[data-skin="claude"] .cl-reel-p { color: var(--cl-muted); font-size: .875rem; margin: 0 auto 18px; max-width: 46ch; }
:root[data-skin="claude"] .cl-reel-recap {
  display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin: 0 0 20px;
}
:root[data-skin="claude"] .cl-reel-recap span {
  font: 500 .75rem/1 var(--cl-mono); color: var(--cl-ink-2); background: var(--cl-tool-bg);
  border: 1px solid var(--cl-line); border-radius: 999px; padding: 7px 11px;
}
:root[data-skin="claude"] .cl-reel-btn {
  display: block; width: 100%; border-radius: 11px; padding: 13px 16px; font: 600 .9375rem/1.2 var(--cl-sans);
  cursor: pointer; border: 1px solid transparent; text-align: center;
}
:root[data-skin="claude"] .cl-reel-btn-primary { background: var(--cl-accent); color: var(--cl-accent-ink); }
:root[data-skin="claude"] .cl-reel-btn-secondary { background: var(--cl-surface); color: var(--cl-ink); border-color: var(--cl-line); margin-top: 9px; }
:root[data-skin="claude"] .cl-reel-btn-meta { display: block; font: 500 .75rem/1 var(--cl-mono); opacity: .85; margin-top: 5px; }

/* Spotlight dim + anchored callout */
:root[data-skin="claude"] .cl-reel-spotlight {
  position: absolute; inset: 0; z-index: 38; background: #1f1e1c2e; display: flex; padding: 22px;
}
:root[data-skin="claude"] .cl-reel-anchor-chat { align-items: flex-end; justify-content: flex-start; }
:root[data-skin="claude"] .cl-reel-anchor-board { align-items: flex-start; justify-content: flex-end; }
:root[data-skin="claude"] .cl-reel-callout {
  background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 12px; width: 272px;
  padding: 13px 15px; box-shadow: 0 18px 48px #00000033;
}
:root[data-skin="claude"] .cl-reel-callout-ey { font: 600 .625rem/1 var(--cl-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--cl-accent); }
:root[data-skin="claude"] .cl-reel-callout-h { font: 600 .875rem/1.25 var(--cl-sans); margin: 8px 0 5px; }
:root[data-skin="claude"] .cl-reel-callout-b { font-size: .78rem; line-height: 1.5; color: var(--cl-muted); margin: 0; }
:root[data-skin="claude"] .cl-reel-callout-bar { display: flex; align-items: center; gap: 8px; margin-top: 11px; }
:root[data-skin="claude"] .cl-reel-prog { flex: 1; height: 3px; border-radius: 2px; background: var(--cl-line); overflow: hidden; }
:root[data-skin="claude"] .cl-reel-prog i { display: block; height: 100%; width: 0; background: var(--cl-accent); animation: cl-reel-fill linear forwards; }
@keyframes cl-reel-fill { from { width: 0 } to { width: 100% } }
:root[data-skin="claude"] .cl-reel-continue { background: none; border: none; color: var(--cl-accent); font: 600 .6875rem/1 var(--cl-mono); cursor: pointer; }

/* Speed toggle (in the chat header area while playing) */
:root[data-skin="claude"] .cl-reel-speed { display: inline-flex; gap: 2px; border: 1px solid var(--cl-line); border-radius: 8px; padding: 2px; }
:root[data-skin="claude"] .cl-reel-speed button { background: none; border: none; padding: 4px 8px; border-radius: 6px; font: 600 .6875rem/1 var(--cl-mono); color: var(--cl-muted); cursor: pointer; }
:root[data-skin="claude"] .cl-reel-speed button[aria-pressed="true"] { background: var(--cl-accent); color: var(--cl-accent-ink); }

/* Post-reel greeting banner (kept separate from the legal disambiguation ribbon) */
:root[data-skin="claude"] .cl-reel-greet {
  margin: 0 auto 4px; max-width: 48rem; padding: 8px 24px; text-align: center;
  font: 600 .8125rem/1.35 var(--cl-mono); color: var(--cl-accent);
}

@media (prefers-reduced-motion: reduce) {
  :root[data-skin="claude"] .cl-reel-prog i { animation: none; width: 100%; }
}
```

- [ ] **Step 2: Verify build picks it up**

Run: `VITE_API_BASE="" npm run build:web`
Expected: builds clean (CSS bundles).

- [ ] **Step 3: Commit**

```bash
git add web/src/skin-claude.css
git commit -m "feat(reel): claude-skin styles for intro/callout/end/speed/greeting"
```

---

## Task 10: Post-reel greeting in `ClaudeChatView`

**Files:**
- Modify: `web/src/ClaudeChatView.tsx`

Add an optional `postReel?: boolean` prop. When true and on the first run, render a greeting banner above the column and swap the Welcome lead to the post-reel copy. **Keep the legal disambiguation ribbon unchanged** (do not repurpose it). The example chips are the existing presets.

- [ ] **Step 1: Extend `Welcome` to take a post-reel lead**

Replace the `Welcome` function (lines 128-146) with:

```tsx
function Welcome({ presets, geoCity, onSend, busy, postReel }: { presets: Preset[]; geoCity: string | null; onSend: (m: string) => void; busy: boolean; postReel?: boolean }) {
  return (
    <div className="cl-welcome">
      <h1 className="cl-welcome-h"><span className="cl-spark" aria-hidden="true">✳</span> {postReel ? "Your turn to plan" : "Where to next?"}</h1>
      {geoCity && <p className="cl-welcome-geo">Looks like you might be traveling from {geoCity}.</p>}
      <p className="cl-welcome-sub">{postReel
        ? "You're driving now. Tell me where you'd like to go and roughly when, and I'll pull real flights and hotels and build it the way you just watched. A rough idea is plenty; I'll ask if I need anything else."
        : "Voygent plans real trips with live flights and hotels. Pick one to watch it work, or describe your own."}</p>
      {presets.length > 0 && (
        <div className="cl-suggestions">
          {presets.map((p) => (
            <button key={p.id} type="button" className="cl-suggestion" disabled={busy} onClick={() => onSend(p.prompt)}>
              <span className="cl-suggestion-label">{p.label}</span>
              <span className="cl-suggestion-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Thread the `postReel` prop**

In the `ClaudeChatView` props destructure (line 149) add `postReel`, and in the props type (after `engHasContent: boolean;`) add `postReel?: boolean;`. Then in the render, just before `{firstRun && <Welcome ... />}` (line 194), add the banner, and pass `postReel` to `Welcome`:

```tsx
{firstRun && postReel && (
  <div className="cl-reel-greet" role="status">Live · you&#39;re driving now · real model, real supplier data</div>
)}
{firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} postReel={postReel} />}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean (prop optional; App passes it in Task 11).

- [ ] **Step 4: Commit**

```bash
git add web/src/ClaudeChatView.tsx
git commit -m "feat(reel): post-reel greeting banner + Welcome lead (legal ribbon unchanged)"
```

---

## Task 11: Wire the reel lifecycle into `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

Reel lifecycle `intro → playing → ended` (only meaningful when `mode==="auto"`), speed state, `selectReel`, `onHighlight` with a resolver ref, replay/reset, and the three overlays. Live transitions reuse the existing reload pattern (`toggleDemo`) so the session re-latches cleanly.

- [ ] **Step 1: Replace the hardcoded import**

Line 26 — replace:
```tsx
import dublinRecording from "./recordings/dublin-oct.json";
```
with:
```tsx
import { selectReel } from "./recordings/registry";
import { ReelIntro } from "./ReelIntro";
import { ReelCallout } from "./ReelCallout";
import { ReelEndCard } from "./ReelEndCard";
import type { Highlight } from "./lib/highlights";
```
Keep `import { replayChat, type Recording } from "./lib/recording";` (Recording type still used).

- [ ] **Step 2: Add reel state (after line 91, near `replayAbort`)**

```tsx
  const selectedReel = useRef(selectReel()).current;
  type ReelPhase = "intro" | "playing" | "ended";
  const [reelPhase, setReelPhase] = useState<ReelPhase>(() => (resolveInitialMode() === "auto" ? "intro" : "ended"));
  const [speed, setSpeed] = useState<number>(2);          // default 2x
  const speedRef = useRef(speed); useEffect(() => { speedRef.current = speed; }, [speed]);
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  const hlResolve = useRef<(() => void) | null>(null);
  const postReel = (() => { try { return new URLSearchParams(window.location.search).get("greet") === "reel"; } catch { return false; } })();
```

- [ ] **Step 3: Add a reset + onHighlight + replay handlers (after `pushUser`, ~line 227)**

```tsx
  function resetReelState() {
    setItems([]); setTools([]); setFolio(null);
    setInsTools([]); setInsTurns([]); setInsSummaries([]); setInsSavings([]);
    setInsOverhead([]); setInsStores([]); setInsValidations([]); setInsPhases([]);
  }

  function onReelHighlight(h: Highlight): Promise<void> {
    setActiveHighlight(h);
    return new Promise<void>((resolve) => {
      hlResolve.current = () => { hlResolve.current = null; setActiveHighlight(null); resolve(); };
    });
  }

  function startReel() { resetReelState(); setReelPhase("playing"); }
  function planYourOwn() { goLive(false); }
  function tryYourself() { goLive(true); }

  // Switch to live mode via a clean reload (re-latches the session), optionally flagged post-reel.
  function goLive(greet: boolean) {
    persistMode("live");
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mode", "live"); u.searchParams.set("skin", "claude");
      if (greet) u.searchParams.set("greet", "reel"); else u.searchParams.delete("greet");
      window.location.href = u.toString();
    } catch { /* no-op */ }
  }
```

- [ ] **Step 4: Replace the reel effect (lines 115-129)**

```tsx
  useEffect(() => {
    if (mode !== "auto" || reelPhase !== "playing") return;
    if (skin !== "claude") setSkin("claude");
    const ac = new AbortController();
    replayAbort.current?.abort();
    replayAbort.current = ac;
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    void replayChat(selectedReel.recording, {
      applyEvent: (e) => applyEvent(e, true),
      pushUser,
      setBusy,
      onHighlight: onReelHighlight,
    }, {
      reducedMotion: reduced,
      signal: ac.signal,
      speed: () => speedRef.current,
      highlights: selectedReel.highlights,
    }).then(() => { if (!ac.signal.aborted) setReelPhase("ended"); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reelPhase]);
```

- [ ] **Step 5: Render the overlays + speed toggle**

In the return, immediately after the opening `<div className="app">` (line 276), add:

```tsx
      {skin === "claude" && mode === "auto" && reelPhase === "intro" && (
        <ReelIntro
          title={selectedReel.title} blurb={selectedReel.blurb} durationLabel={selectedReel.durationLabel}
          onWatch={startReel} onPlanYourOwn={planYourOwn}
        />
      )}
      {skin === "claude" && mode === "auto" && reelPhase === "playing" && activeHighlight && (
        <ReelCallout
          key={activeHighlight.title}
          highlight={activeHighlight}
          dwellMs={activeHighlight.dwellMs ?? 4000}
          onContinue={() => hlResolve.current?.()}
        />
      )}
      {skin === "claude" && mode === "auto" && reelPhase === "playing" && (
        <div className="cl-reel-speed" role="group" aria-label="Playback speed">
          <button type="button" aria-pressed={speed === 1} onClick={() => setSpeed(1)}>1×</button>
          <button type="button" aria-pressed={speed === 2} onClick={() => setSpeed(2)}>2×</button>
        </div>
      )}
      {skin === "claude" && mode === "auto" && reelPhase === "ended" && (
        <ReelEndCard onTryYourself={tryYourself} onReplay={startReel} />
      )}
```

(The speed toggle is fixed-positioned by the CSS in Task 9; if it overlaps the header during smoke, adjust the `.cl-reel-speed` rule with `position:absolute; top:10px; right:16px;` — add that to the Task 9 block.)

- [ ] **Step 6: Pass `postReel` to ClaudeChatView**

In the `<ClaudeChatView ... />` props (around line 289-295) add `postReel={postReel}`.

- [ ] **Step 7: Verify it compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean tsc; all tests green (including the unchanged reducer/replay tests).

- [ ] **Step 8: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(reel): wire intro/pacing/callouts/end + registry into App lifecycle"
```

---

## Task 12: Full verification, manual smoke, deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green (existing 276+ plus the new pacing/highlights/registry/recording cases).

- [ ] **Step 2: Build**

Run: `rm -rf dist-web && VITE_API_BASE="" npm run build:web`
Expected: builds; `dist-web/assets/*.js` + `.css` emitted.

- [ ] **Step 3: Manual smoke (local preview or deployed)**

Verify on `?mode=auto` (default landing): intro card appears, reel does NOT autoplay until "Watch the 2× replay" is clicked; playback is readably paced; 1×/2× toggle changes speed live; each of the 4 callouts pauses, explains, and auto-resumes (~4s) with a working Continue; the end bookend appears at completion; "Replay" restarts cleanly; "Try it yourself" lands in live mode with the post-reel greeting banner + "Your turn to plan" Welcome + preset chips; the legal disambiguation ribbon is still present. `?mode=live` shows no reel chrome. `?reel=dublin-oct` forces the Dublin reel.

- [ ] **Step 4: Deploy (asset + client only; no worker/secret changes)**

Run: `npx wrangler deploy`
Then verify: `curl -s -o /dev/null -w "%{http_code}\n" https://demo.voygent.ai/` → 200 (or its gated redirect). Confirm with Neil before deploying if another session's coord note reserves a deploy.

- [ ] **Step 5: Update the worktree journal + finish the branch**

`/branch update --working-on "reel P1 shipped"`, then follow `superpowers:finishing-a-development-branch` (merge to main or PR). Remove the three `web/public/mockups/reel-*.html` brainstorming mockups in a follow-up cleanup commit if Neil wants them gone (they are harmless static assets; leave unless asked).

---

## Self-Review

**Spec coverage:**
- C1 intro modal → Task 6 + Task 11 (render gate). ✓
- C2 pacing + 1×/2× → Task 1 + Task 5 (replayChat) + Task 11 (speed state/toggle). ✓
- C3 callouts (Treatment 1, auto-resume, sidecar track, 4 moments) → Task 2 + Task 3 + Task 5 + Task 7 + Task 11. ✓
- C4 end CTA + crafted greeting + ribbon → Task 8 + Task 10 + Task 11 (deviation logged: greeting is a separate banner, legal disambiguation ribbon preserved). ✓
- C5 registry + rotation → Task 4 + Task 11. ✓
- Copy voice (no em-dash) → all strings written plain. ✓
- Client-only / claude-skin / no worker change → no worker files touched. ✓

**Placeholder scan:** No TBD/TODO. Task 3 includes a verify-then-author procedure with a concrete fallback rule (not a vague placeholder). Pacing constants are real values (calibrate during Step 3 smoke if needed).

**Type consistency:** `Frame`/`Recording` (recording.ts) reused everywhere; `Highlight`/`HighlightTrack`/`HighlightMatch` (highlights.ts) used in registry, recording.ts, ReelCallout, App; `ReelEntry` (registry) used in App; `computeDelay(frame, prev, {speed,reducedMotion})` signature matches its caller in recording.ts; `selectReel`/`pickReel` names consistent; `onHighlight` handler name consistent across recording.ts and App.

**Deviation from spec (logged):** the "ribbon flips to Live · you're driving now" is implemented as a **separate greeting banner** so the legal disambiguation ribbon (not-affiliated-with-Anthropic) is preserved. Confirm acceptable with Neil at smoke time.
