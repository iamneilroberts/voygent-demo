# Inspector rail + demo surface polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the claude-skin live demo wow both audiences — a clean travel chat for regular users, a deep, drillable Engineering Inspector for technical viewers — by (A) fixing alarming prices, (B) making tool chips self-describing, (C) turning the Inspector into a compact live rail that expands on demand with an extensible stat registry + contextual deep-dive links, and (D) adding drill-down telemetry.

**Architecture:** Worker (Cloudflare, TypeScript) replays captured fixtures and emits SSE events; the React web app renders chat + folio + Inspector. Price/chip context rides cheaply (ints/bools) on existing slim payloads and events; heavy fields stay out-of-band. The Inspector's `idle|live|collapsed` state machine becomes `idle|peek|open` (never auto-expands); stats become registry data so the rail, panel tiles, and deep-dive links all derive from one source.

**Tech Stack:** TypeScript, React, Vitest, Cloudflare Workers/Wrangler. Tests: `npx vitest run`. Typecheck: `npx tsc --noEmit`. Deploy: `VITE_API_BASE="" npm run build:web && npx wrangler deploy`.

**Spec:** `docs/superpowers/specs/2026-06-10-inspector-rail-and-surface-polish-design.md`
**Mockup:** https://demo.voygent.ai/mockups/inspector-rail

**Conventions:** plain copy, no em-dashes (memory `feedback-demo-copy-voice-no-em-dash`). Commission/ladder stay advisor-gated. Don't bloat the model-facing slim payload beyond cheap ints/bools. Run `npx tsc --noEmit` + `npx vitest run` before every commit; deploy is asset+worker, verify bundle hash + `/blog//stats` 200 (edge lags ~5s); Neil smokes (no headless).

---

## Phase A — Price display fixes (ship first)

Captured prices are real but lack context; the advisor ladder mixed per-night with stay-total. Headline the client price, add "all-inclusive · N nts · M travelers", fix the ladder, show flights per-person.

### Task A1: cpmaxx slim payload carries travelers + all-inclusive

**Files:**
- Modify: `worker/mcp/replay.ts` (`slimCpmaxxHotel`, `hotelSearch`, `hotelList`)
- Test: `worker/mcp/replay.test.ts`

- [ ] **Step 1: Write the failing test** (append to the `credentialed cpmaxx hotel replay` describe in `replay.test.ts`):

```ts
it("cpmaxx slim payload carries travelers + allInclusive (cheap context, no heavy fields)", () => {
  const r = new FixtureReplay("demo-x");
  const out = JSON.parse(r["hotelSearch"]({ location: "Cancun" }));
  const first = out.candidates[0];
  expect(first.travelers).toBe(CANCUN.route.adults); // 2
  expect(first.nights).toBe(cpmaxxHotelsFor(CANCUN)[0].nights);
  expect(typeof first.allInclusive).toBe("boolean");
  // a Cancun resort whose blurb says all-inclusive flags true
  const dreams = out.candidates.find((c: any) => c.id === "497758");
  expect(dreams.allInclusive).toBe(true);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run worker/mcp/replay.test.ts -t "travelers"`
Expected: FAIL (`travelers` undefined).

- [ ] **Step 3: Implement.** In `replay.ts`, change `slimCpmaxxHotel` to take travelers and derive `allInclusive` from the blurb (without shipping the blurb):

```ts
function slimCpmaxxHotel(c: CpmaxxHotel, travelers: number) {
  const blurb = (c.marketingBlurb ?? "").toLowerCase();
  return {
    id: c.id, source: "cpmaxx" as const, name: c.name,
    stars: c.stars ?? null, area: c.area ?? null,
    pricePerNight: c.pricePerNight ?? null, priceTotal: c.priceTotal ?? null,
    nights: c.nights ?? null, currency: c.currency ?? "USD",
    travelers,
    allInclusive: /all[-\s]?inclusive/.test(blurb),
    commission: c.commission ?? null, commissionPct: c.commissionPct ?? null,
    clientPrice: c.clientPrice ?? null, profitScore: c.profitScore ?? null,
    otaFrom: otaFrom(c),
  };
}
```

Update both call sites to pass `fixture.route.adults`:
```ts
// in hotelSearch and hotelList, where cpmaxx is served:
const candidates = cpmaxx.map((h) => slimCpmaxxHotel(h, fixture.route.adults));
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/mcp/replay.test.ts -t "travelers"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/mcp/replay.ts worker/mcp/replay.test.ts
git commit -m "feat(demo): cpmaxx slim payload carries travelers + all-inclusive context"
```

### Task A2: BoardCandidate gains context fields; cpmaxx board mapper reconciles price

**Files:**
- Modify: `shared/events.ts` (`BoardCandidate`)
- Modify: `worker/agent/boards.ts` (`cpmaxxHotelCandidate`, `flightCandidate`)
- Test: `worker/agent/boards.test.ts`

- [ ] **Step 1: Add fields** to `BoardCandidate` in `shared/events.ts` (after `photoCount?`):

```ts
  nights?: number;         // stay length (hotel context)
  travelers?: number;      // party size, for "for N travelers" / per-person framing
  allInclusive?: boolean;  // cpmaxx resort all-inclusive flag (context for the rate)
  perPerson?: number;      // flight per-person price, USD
```

- [ ] **Step 2: Write the failing test** (replace the cpmaxx assertions in the `maps a featured hotel_search result to a credentialed cpmaxx board` test, add these):

```ts
    // client price headline; per-night reconciles FROM the headline, not the raw rate
    const cp = cpmaxx[0];
    expect(first.clientPrice).toBe(cp.clientPrice);
    expect(first.price).toBe(`$${Math.round(cp.clientPrice! / cp.nights!).toLocaleString("en-US")}/night`);
    expect(first.nights).toBe(cp.nights);
    expect(first.travelers).toBe(2);
    // ladder NOT shown when OTA ~= client (no fake savings): otaFrom dropped
    expect(first.otaFrom).toBeUndefined();
```

And a flight per-person test (append to the flight describe):

```ts
it("flight candidate shows travelers + per-person", () => {
  const build = createBoardBuilder();
  const ev = build("flight_list", JSON.stringify({ status:"ok", action:"list", count:1, version:1,
    candidates:[{ id:"serp:f1", route:"ATL→CUN", airline:"Delta", price:2954, pricePerPerson:1477, stops:0, cabin:"Economy" }] }), TRIP);
  if (ev?.type !== "board") throw new Error("board");
  const c = ev.candidates[0];
  expect(c.travelers).toBe(2);
  expect(c.perPerson).toBe(1477);
  expect(c.meta).toMatch(/2 travelers/);
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run worker/agent/boards.test.ts -t "cpmaxx board"`
Expected: FAIL (price uses pricePerNight; otaFrom present; no travelers).

- [ ] **Step 4: Implement.** In `boards.ts` `cpmaxxHotelCandidate`, after reading fields:

```ts
  const nights = num(c.nights, fx?.nights ?? undefined);
  const clientPrice = num(c.clientPrice, c.client_price, fx?.clientPrice ?? undefined);
  // Headline = what the CLIENT pays; per-night reconciles from it (not the raw cpmaxx rate).
  const headlineTotal = clientPrice ?? totalN;
  const perNightFromHeadline = headlineTotal && nights ? Math.round(headlineTotal / nights) : perNightN;
  const perNight = usd(perNightFromHeadline);
  const total = usd(headlineTotal);
  // context chip pieces
  const travelers = num(c.travelers);
  const allInc = c.allInclusive === true;
  const ctx = [allInc ? "All-inclusive" : null, nights ? `${nights} nts` : null, travelers ? `${travelers} travelers` : null].filter(Boolean).join(" · ");
  const meta = [area, starLabel, ctx || null].filter(Boolean).join(" · ") || undefined;
  const price = perNight ? `${perNight}/night` : total;
  const summary = [c.name, total, ctx].filter(Boolean).join(", ");
  const out: BoardCandidate = { id, title: c.name, price, meta, summary };
  if (typeof nights === "number") out.nights = nights;
  if (typeof travelers === "number") out.travelers = travelers;
  if (allInc) out.allInclusive = true;
  if (typeof clientPrice === "number") out.clientPrice = clientPrice;
```

Replace the old `meta`/`price`/`summary`/`out` lines and the commission/sheet/image/photoCount block stays (re-add after the new `out`). **Ladder rule:** only set `otaFrom` when there's real savings:

```ts
  // ladder: only when the client total is materially below the public OTA total
  const otaTotal = (typeof ota === "number" && nights) ? ota * nights : undefined;
  if (typeof otaTotal === "number" && typeof clientPrice === "number" && clientPrice < otaTotal * 0.95) {
    out.otaFrom = ota; // genuine savings to show
  }
```
(Remove the unconditional `if (typeof ota === "number") out.otaFrom = ota;`.)

For `flightCandidate`, derive travelers/per-person:
```ts
  const perPerson = typeof c.pricePerPerson === "number" ? c.pricePerPerson : undefined;
  const travelers = perPerson && typeof c.price === "number" && perPerson > 0 ? Math.round(c.price / perPerson) : undefined;
  // ... add to meta:
  const meta = [c.airline, stopsLabel(c.stops), durationLabel(c.durationMinutes), c.cabin,
    travelers && travelers > 1 ? `${travelers} travelers` : null].filter(Boolean).join(" · ") || undefined;
  // ... after building out:
  if (typeof travelers === "number") out.travelers = travelers;
  if (typeof perPerson === "number") out.perPerson = perPerson;
```

- [ ] **Step 5: Run, verify pass** (and that the existing `hotel_search_and_rank` live tests still pass — they have no nights/travelers, so ctx is empty and price falls back to per-night):

Run: `npx vitest run worker/agent/boards.test.ts`
Expected: PASS (all). If the live cpmaxx test asserts an exact `price`, confirm it still matches (no nights → falls back to `perNightN`).

- [ ] **Step 6: Commit**

```bash
git add shared/events.ts worker/agent/boards.ts worker/agent/boards.test.ts
git commit -m "feat(demo): client-price headline + all-inclusive/traveler context; ladder only on real savings; flights per-person"
```

### Task A3: BoardView renders context + per-person; ladder honesty

**Files:**
- Modify: `web/src/BoardView.tsx`
- Modify: `web/src/skin-claude.css` (minor)

- [ ] **Step 1: Implement.** In `BoardView.tsx`, the price ladder block currently renders `public {otaFrom}/nt · client {clientPrice}`. Replace with a unit-consistent version: per-person for flights, and the ladder only when `otaFrom` is present (now it only is on real savings):

```tsx
                  {advisor && typeof c.otaFrom === "number" && typeof c.nights === "number" && (
                    <span className="cl-option-ladder">below public {fmtUsd(c.otaFrom * c.nights)}</span>
                  )}
                  {board.kind === "flight" && typeof c.perPerson === "number" && (
                    <span className="cl-option-ladder">{fmtUsd(c.perPerson)} each</span>
                  )}
```

The `meta` already carries the "All-inclusive · 7 nts · 2 travelers" string from the worker, so it renders without further change.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add web/src/BoardView.tsx web/src/skin-claude.css
git commit -m "feat(demo): board cards show all-inclusive/traveler context, per-person flights, honest ladder"
```

### Task A4: Folio lodging + flight context

**Files:**
- Modify: `shared/events.ts` (`FolioHotel`, `FolioFlight`)
- Modify: `worker/agent/folio-sync.ts` + `worker/mcp/replay.ts` (`synthCpmaxxLodging` already carries clientPrice; add travelers/allInclusive)
- Modify: `web/src/FolioPanel.tsx`
- Test: `worker/agent/folio-sync.test.ts`

- [ ] **Step 1: Add fields** to `FolioHotel` (`travelers?: number; allInclusive?: boolean; clientPrice?: number;`) and `FolioFlight` (`travelers?: number; perPerson?: string;`).

- [ ] **Step 2: Write the failing test** (append to `folio-sync.test.ts`):

```ts
it("folio lodging headlines client price with all-inclusive/traveler context", () => {
  const folio = tripToFolio("t1", { data: { lodging: [{
    name: "Live Aqua", total: 4946, clientPrice: 5342, nights: 7, travelers: 2, allInclusive: true, stars: 5,
  }] } });
  expect(folio.hotels[0].price).toBe("$5,342");      // client price, with separators
  expect(folio.hotels[0].allInclusive).toBe(true);
  expect(folio.hotels[0].travelers).toBe(2);
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run worker/agent/folio-sync.test.ts -t "all-inclusive"`
Expected: FAIL.

- [ ] **Step 4: Implement.** In `synthCpmaxxLodging` (`replay.ts`) add `travelers: <route adults>, allInclusive: <derived>` — pass adults into the synth like the slim function (thread `fixture.route.adults` + derive allInclusive from blurb). In `folio-sync.ts` hotel map, prefer `clientPrice` for the price and pass through the new fields:

```ts
    price: asPrice(h.clientPrice ?? h.price ?? h.total ?? h.rate ?? h.priceTotal),
    travelers: typeof h.travelers === "number" ? h.travelers : undefined,
    allInclusive: h.allInclusive === true ? true : undefined,
    clientPrice: typeof h.clientPrice === "number" ? h.clientPrice : undefined,
```
Use `asPrice` with comma separators (verify `asPrice` formats `5342` → `$5,342`; if it doesn't add separators, switch to `fmtUsd`-style). Add the test's expected `$5,342` accordingly — if `asPrice` yields `$5342`, update the test to match the real formatter rather than inventing one.

- [ ] **Step 5: FolioPanel render.** In `HotelCard`, add the all-inclusive/traveler context to the meta line:

```tsx
  const meta = [
    h.area,
    typeof h.stars === "number" ? `${h.stars}★` : null,
    h.allInclusive ? "All-inclusive" : null,
    typeof h.nights === "number" ? `${h.nights} nts` : null,
    typeof h.travelers === "number" ? `${h.travelers} travelers` : null,
  ].filter(Boolean).join(" · ");
```

- [ ] **Step 6: Run + typecheck + commit**

```bash
npx vitest run worker/agent/folio-sync.test.ts && npx tsc --noEmit
git add shared/events.ts worker/agent/folio-sync.ts worker/mcp/replay.ts web/src/FolioPanel.tsx worker/agent/folio-sync.test.ts
git commit -m "feat(demo): folio lodging headlines client price + all-inclusive/traveler context"
```

### Task A5: Deploy Phase A + smoke

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit` (all green).
- [ ] **Step 2:** `VITE_API_BASE="" npm run build:web && npx wrangler deploy`
- [ ] **Step 3:** verify: `curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'` matches the new bundle; `curl -s -o /dev/null -w "%{http_code}" https://demo.voygent.ai/blog//stats` → 200.
- [ ] **Step 4:** Hand Neil the smoke link (`?mode=live&skin=claude&advisor=1#code=<DEMO_ACCESS_CODE>`); prices should read sanely.

---

## Phase B — Self-describing tool chips

### Task B1: Shared tool-chip-title resolver (TDD)

**Files:**
- Create: `shared/tool-chip-title.ts`
- Test: `shared/tool-chip-title.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from "vitest";
import { toolChipTitle } from "./tool-chip-title";

describe("toolChipTitle", () => {
  it("maps search + promote tools", () => {
    expect(toolChipTitle("save_trip", {})).toBe("Starting your trip");
    expect(toolChipTitle("hotel_search", { location: "Cancún" })).toBe("Searching hotels in Cancún");
    expect(toolChipTitle("flight_search", { destination: "Cancún" })).toBe("Searching flights to Cancún");
    expect(toolChipTitle("promote_hotels_to_lodging", {})).toBe("Locking in the hotels");
    expect(toolChipTitle("excursion_search", {})).toBe("Finding things to do");
  });
  it("branches patch_trip on the updated key", () => {
    expect(toolChipTitle("patch_trip", { updates: { flights: [{}] } })).toBe("Saving your flight pick");
    expect(toolChipTitle("patch_trip", { updates: { hotels: [{}] } })).toBe("Shortlisting hotels");
    expect(toolChipTitle("patch_trip", { updates: { lodging: [{}] } })).toBe("Locking in the hotel");
    expect(toolChipTitle("patch_trip", { updates: { itinerary: [] } })).toBe("Building the day-by-day");
    expect(toolChipTitle("patch_trip", { updates: { meta: {} } })).toBe("Updating the trip");
  });
  it("falls back to a title-cased tool name", () => {
    expect(toolChipTitle("some_new_tool", {})).toBe("Some New Tool");
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run shared/tool-chip-title.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `shared/tool-chip-title.ts`:**

```ts
// Human, present-tense label for a tool-use chip, derived from the tool name + args.
// One source of truth for both the live worker path and the reel timeline builder.
function place(args: Record<string, any>): string | null {
  const v = args?.destination ?? args?.location ?? args?.city ?? args?.query;
  return typeof v === "string" && v ? v : null;
}
function titleCase(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function toolChipTitle(name: string, args: Record<string, any> = {}): string {
  const where = place(args);
  switch (name) {
    case "save_trip": return "Starting your trip";
    case "flight_search": return where ? `Searching flights to ${where}` : "Searching flights";
    case "flight_list": return "Ranking the flights";
    case "hotel_search": return where ? `Searching hotels in ${where}` : "Searching hotels";
    case "hotel_list": case "hotel_search_and_rank": return "Ranking the hotels";
    case "promote_flights": return "Locking in the flight";
    case "promote_hotels_to_lodging": return "Locking in the hotels";
    case "excursion_search": return "Finding things to do";
    case "tripadvisor_search": return "Finding places to eat";
    case "apply_gap_tour_picks": return "Adding activities to your days";
    case "resolve": case "resolve_destination": return where ? `Looking up ${where}` : "Looking up the destination";
    case "list_render": return "Updating your folio";
    case "patch_trip": {
      const u = (args?.updates ?? {}) as Record<string, unknown>;
      if ("flights" in u) return "Saving your flight pick";
      if ("lodging" in u) return "Locking in the hotel";
      if ("hotels" in u) return "Shortlisting hotels";
      if ("itinerary" in u) return "Building the day-by-day";
      return "Updating the trip";
    }
    default: return titleCase(name);
  }
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run shared/tool-chip-title.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add shared/tool-chip-title.* && git commit -m "feat(demo): shared tool-chip-title resolver"`

### Task B2: Emit title on the tool event + render it

**Files:**
- Modify: `shared/events.ts` (the `tool` ServerEvent + `ToolChipItem` via `web/src/timeline.ts`)
- Modify: `worker/agent/loop.ts:118` (start emit)
- Modify: `web/src/timeline.ts` (`ToolChipItem.title`)
- Modify: `web/src/App.tsx` (tool-event handler that builds the chip item)
- Modify: `web/src/ClaudeToolChip.tsx` (render title headline + mono tag)

- [ ] **Step 1:** In `shared/events.ts`, add `title?: string` to the `{ type: "tool" ... }` event. In `web/src/timeline.ts`, add `title?: string` to `ToolChipItem`.

- [ ] **Step 2:** In `loop.ts:118`, compute the title from the call's args (the loop has `t.input`):

```ts
      emit({ type: "tool", tool: t.name, phase: "start", title: toolChipTitle(t.name, t.input as Record<string, any>) });
```
Import `toolChipTitle` from `../../shared/tool-chip-title`.

- [ ] **Step 3:** In `App.tsx`, where the `tool` event creates/updates the `ToolChipItem`, carry `title: e.title`.

- [ ] **Step 4:** In `ClaudeToolChip.tsx`, render the title as the headline with the mono tool tag kept:

```tsx
        <span className="cl-tool-label">
          {item.title ? <><strong className="cl-tool-doing">{item.title}</strong> <code>{item.name}</code></>
                      : <>Using <strong>Voygent</strong> <code>{item.name}</code></>}
        </span>
```
Add a small `.cl-tool-doing` style (font-weight 600) and dim the `<code>` tag.

- [ ] **Step 5:** Reel path — in `web/src/timeline.ts` (or wherever recording tool items are built), set `title: toolChipTitle(name, args)` so reels get the same labels (fallback to the name label if a recording lacks args).

- [ ] **Step 6:** `npx tsc --noEmit` clean. Update any timeline/App test that builds tool items. Commit:

```bash
git add shared/events.ts worker/agent/loop.ts web/src/timeline.ts web/src/App.tsx web/src/ClaudeToolChip.tsx web/src/skin-claude.css
git commit -m "feat(demo): self-describing tool chips (human label + mono tool tag)"
```

### Task B3: Deploy Phase B + smoke
- [ ] Tests + tsc green, deploy, verify bundle + stats 200, hand Neil the smoke link. Chips should read "Searching hotels in Cancún", "Shortlisting hotels", "Building the day-by-day", etc.

---

## Phase C — Skinny live Inspector rail + stat registry + deep-dive links

### Task C1: EngState → idle | peek | open (TDD)
**Files:** Modify `web/src/lib/inspector-state.ts`; Test `web/src/lib/inspector-state.test.ts`.
- [ ] Test the new transitions: `engState(0, false) === "idle"`; `engState(3, false) === "peek"`; `engState(3, true) === "open"`; `engState(0, true) === "idle"` (no tools → idle regardless of expand).
- [ ] Implement:
```ts
export type EngState = "idle" | "peek" | "open";
export function engState(toolCount: number, expanded: boolean): EngState {
  if (toolCount === 0) return "idle";
  return expanded ? "open" : "peek";
}
```
- [ ] In `App.tsx`, rename `collapsed` state → `expanded` (default `false`); `engState(insTools.length, expanded)`; the rail click and panel `✕` set `expanded`. Remove the no-op-collapse guard (peek is always interactive once tools fire). Commit.

### Task C2: Grid + rail/panel CSS for peek/open
**Files:** Modify `web/src/styles.css` + `web/src/skin-claude.css`.
- [ ] `styles.css`: `.stage[data-eng="open"]` → `0.78fr 1fr`; `.stage[data-eng="idle"|"peek"]` → `1fr 96px`. `skin-claude.css`: `.stage[data-eng="open"]` → `1.15fr 1fr`. Rename all `data-eng="live"` → `data-eng="open"` and `"collapsed"` → fold into `"peek"`.
- [ ] Add the first-reveal attention beat (`.ins-rail.beat` keyframes: edge-glow + a one-shot "click to expand ⤢" hint that fades), `prefers-reduced-motion` aware. Port the visuals from the mockup (`.rail.beat`, `.hint`, `@keyframes railbeat/hintfade`). Commit.

### Task C3: Stat registry (TDD)
**Files:** Create `web/src/lib/inspector-stats.ts`; Test `web/src/lib/inspector-stats.test.ts`.
- [ ] Define `InspectorStat` (per spec Part 2) and `buildStats(input): InspectorStat[]` from the already-computed Inspector values (tools, distinct, persisted writes, context-kept-out, observed cost, cache-hit). Test: rail-priority sort + cap (`railStats(stats, slots)` returns top-N with a `rail` priority), and `deepDiveLinks(stats)` dedups slugs in registry order.
- [ ] Implement `buildStats`, `railStats`, `deepDiveLinks`. Commit.

### Task C4: Rail renders live (peek)
**Files:** Modify `web/src/Inspector.tsx`.
- [ ] Replace the `state !== "live"` dim-rail branch: for `peek`, render the live rail (label, live dot + active phase, the 6 pipeline dots via existing `stageActive`, `railStats` metrics with the tokens-saved fill bar, `⤢`); the whole rail click sets `expanded=true`. For `idle`, keep today's dim non-interactive label. Reuse `buildStats`. Commit.

### Task C5: Panel tiles from registry + collapse control
**Files:** Modify `web/src/Inspector.tsx`.
- [ ] In the `open` branch, render the tile header from `buildStats` (so adding a stat = new tile automatically). Add a `✕ collapse` control in the panel header that calls `onToggleCollapse` (sets `expanded=false`). Commit.

### Task C6: Deep-dive links bottom section
**Files:** Modify `web/src/Inspector.tsx`.
- [ ] At the panel bottom, render a "Dig deeper" section: primary links from `deepDiveLinks(stats)` (each `<STAT> — <subject blurb> ↗`, using `INFO_LINKS` blurbs), then a secondary "More on the engineering" group with the remaining `INFO_LINKS` not already shown, then the "More stats and stories land here as the system grows." footnote. Commit.

### Task C7: Mobile live indicator
**Files:** Modify `web/src/ClaudeChatView.tsx` (mobile toolbar) + `App.tsx`.
- [ ] On mobile (`mobileView`), add a compact button showing the top rail stat (`◉ {tools} · {cost}`) that opens the existing `.engineering` overlay. Keep the desktop rail behavior unchanged. Commit.

### Task C8: Deploy Phase C + smoke
- [ ] Tests + tsc green; deploy; verify bundle + stats 200; Neil smokes the rail (live at rest, attention beat on first tool, click-to-expand, deep-dive links, mobile button).

---

## Phase D — Drill-down telemetry (follow-on plan)

Detail these in their own plan after Phase C ships and Neil smokes the rail (they build on the registry + drillable panel). Sequenced by wow-per-effort (spec Part 6):

1. **Token Elimination Funnel** — distill ledger first (`raw → slim, −%` per search from fixture `meta.rawTokensEst` + replay measurement), Sankey later.
2. **Counterfactual Cost Simulator** — actual vs all-Sonnet / all-Opus / no-cache, grouped bars (from `summaries` costByModel + usage).
3. **Per-Phase Critical-Path Waterfall** — tool-call gantt with nested spans (from `tools[].latencyMs` + phase mapping + `overhead`).
4. **Per-turn token waterfall** (cacheRead/in/cacheWrite/out), **Model-routing swimlane** (`turns[].model`).
5. **Fabrication-guard ledger** — needs a small new replay event emitting the validated/rejected id tally.
6. **Latency breakdown / time-to-first-token**, then codex framings: cache thermodynamics, savings Pareto, context-budget heatmap, replay-provenance ledger.

Each becomes a registry entry and/or a drillable detail; new model-facing tokens stay 0 (telemetry is a side channel).

---

## Self-review notes
- **Spec coverage:** Part 1 → C1–C2,C4–C5,C7; Part 2 → C3; Part 3 → C6; Part 4 → B1–B2; Part 5 → A1–A4; Part 6 → Phase D. All parts mapped.
- **Type consistency:** `EngState = idle|peek|open` used in C1/C2/C4/C5; `InspectorStat`/`buildStats`/`railStats`/`deepDiveLinks` defined C3, used C4–C6; `toolChipTitle` defined B1, used B2 (worker + reel); `BoardCandidate` fields (`nights/travelers/allInclusive/perPerson/clientPrice`) defined A2, rendered A3, folio mirror A4.
- **Open verification:** confirm `asPrice` separator formatting in A4 (match the test to the real formatter); confirm `t.input` is the args object at `loop.ts:118` (else read args from the call record). Both are checks, not placeholders.
