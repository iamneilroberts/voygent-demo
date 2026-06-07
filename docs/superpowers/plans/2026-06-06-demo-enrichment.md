# Demo Enrichment Pipeline + Automated Record/Replay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the demo trip rich (excursions, free things, dining "local picks", day-by-day, includes) and ship an automated `?mode=auto` "▶ Watch the demo" replay of one curated golden run — while keeping the fabrication guarantee and leaving the live interactive chat unchanged.

**Architecture:** Two independent components meeting only at the existing `{type:"folio"}` SSE event + the extended `FolioData` shape. **Component A** (worker-only): new intercepted enrichment tools in `replay.ts` that write *only* fixture-keyed objects into `trip.itinerary[]`; a `FolioData` extension projected by `tripToFolio`; a separate additive `ENRICHMENT_WORKFLOW` prompt constant. **Component B** (client-only): a `?record=1` recorder, a shared `applyEvent` reducer, and a `replayChat` player on a `?mode=auto` axis. No worker change for record/replay.

**Tech Stack:** TypeScript, Cloudflare Workers + Durable Objects, React 18 (Vite), vitest. No new dependencies.

---

## Environment & conventions (read before starting)

- **The code-discovery hook blocks the `Read` tool on `.ts`/`.tsx`/`.html`.** View those files with `cat -n <path>` via Bash; author with `Write`/`Edit`. `.md`/`.json`/`.css` Read fine.
- A fresh worktree needs `npm install` (already done if you resumed this session; re-run if `node_modules` is absent).
- **Verification commands** (run from the worktree root `/home/neil/dev/voygent-demo-demo-enrichment`):
  - `npx tsc --noEmit` — must stay clean.
  - `npx vitest run` — full suite; all green (baseline before this work: 15 files / 87 tests).
  - Run a single test file: `npx vitest run worker/mcp/replay.test.ts`.
- **Keep every change additive.** `claude-skin` is merged into `main`; do NOT touch `worker/agent/boards.ts`, the `board` SSE variant, `BOARDS_WORKFLOW_OVERRIDE`, or the `boardBuilder` wiring. Do NOT add a `kind:"excursion"` board (deferred to sub-project 2).
- **Commit after each task** (TDD rhythm: red → green → commit). Stage files by name — never `git add -A` (untracked WIP / `.dev.vars` may sit alongside).
- **Do NOT deploy and do NOT capture the golden recording without Neil** (Tasks D1/D2 are run with him).

## Locked design decisions (resolved from the spec's "resolve during planning" list)

These were the spec's deferred items; verified against the voygent-lite source on 2026-06-06 and locked here so tasks are unambiguous.

1. **Excursion/free mechanism = `excursion_search` + `apply_gap_tour_picks`, both intercepted in `replay.ts`.** In voygent, `apply_gap_tour_picks({tripId, picks:[{day, productCode}]})` persists picks as activity objects into `trip.itinerary[n].activities[]` (real shape: `{name, provider:"Viator", source:"Viator", optional:true, addedBy:"gap-recommender", productCode, duration, priceFrom, currency, rating, reviewCount, description, url, coverImage}`). The demo replays this fixture-keyed. **`suggest_gap_tours` is NOT used** — it requires a pre-populated itinerary with port-hour gap analysis the demo trip doesn't have. "Free things to do" ride the same excursion fixture set, flagged `free:true` (`priceFrom` null/0).
2. **Dining source = `tripadvisor_search`** (locked with Neil at spec sign-off). Intercepted. Dining is *editorial, not bookable* → there is no promote step: `tripadvisor_search` with a `trip_id` **doubles as its own apply** — it returns slim candidates AND writes the fixture dining into `trip.itinerary[n].dining[]`. The model authors no dining content (fabrication-safe by construction).
3. **Includes = static boilerplate template** (`DEMO_INCLUDES` in `folio-sync.ts`), attached by `tripToFolio` once the trip has any itinerary days. Generic travel tips carry no supplier data, so a static template is both fabrication-irrelevant and deterministic. The prompt has the model *narrate* that it added "what's included / travel tips"; the content itself is template-seeded.
4. **Trip-side source fields driving `tripToFolio`:** day-by-day from `trip.itinerary[]` (each `{day, date, location, title, activities[], dining[]}`); flights/hotels unchanged (`trip.flights`, `trip.lodging`). `tripToFolio` is tolerant — absent `itinerary` → no `days`/`includes`, renders flights+hotels only as today.
5. **Fabrication guard for enrichment** is *stronger* than flights/hotels (hardened per the 2026-06-06 codex-review of this plan). Two layers:
   - **The folio's itinerary is ALWAYS replay-controlled.** `onFolio` sets `data.itinerary = promoted.itinerary` *unconditionally* (null → the folio shows no days). The live staging read's `itinerary` is never trusted. So even if the model writes a fabricated `itinerary` via live `patch_trip`, it can never reach `tripToFolio`.
   - **Model-initiated `patch_trip` is sanitized** in `session-do`'s `callTool` wrapper: `itinerary`/`days`/`activities`/`dining`/`includes` keys are stripped before the live write. Replay's own `helpers.patchTrip` calls `mcp.callTool` directly (bypassing that wrapper), so the fixture-keyed enrichment writes still go through.
   - The interception holds the itinerary in replay state (`itineraryByDay`, seeded from `fixture.itineraryDays`) and writes **only** activities/dining whose `productCode`/`id` exist in the fixture; an unknown `productCode` passed to `apply_gap_tour_picks` is dropped. `itineraryByDay` is cleared when the resolved enrichment fixture changes (no cross-route leakage within a session).
6. **"Watch the demo / Build your own" control** sits beside `SkinSwitch` (bottom-right harness chrome), as a sibling pill. `?mode=auto` loads the claude skin and autoplays.
7. **Golden/dev trip = Dublin** (`dublin-oct` fixture). The 1–2 showcased edits are chosen with Neil at capture time (Task D2).

## File map

**Component A (worker):**
- `shared/events.ts` — MODIFY: add `FolioActivity`/`FolioDining`/`FolioDay`/`FolioInclude`; extend `FolioData` with optional `days?`/`includes?`.
- `worker/fixtures/index.ts` — MODIFY: add `ExcursionCandidate`/`DiningCandidate`/`ItineraryDayScaffold` types; extend `Fixture` with optional `excursions?`/`dining?`/`itineraryDays?`.
- `worker/fixtures/dublin-oct.json` — MODIFY (Task D1, by Neil): real captured enrichment arrays. A small hand-authored stub is added in Task A3's tests only (inline, not the JSON).
- `worker/mcp/replay.ts` — MODIFY: add `slimExcursion`/`slimDining`; intercept `excursion_search`/`apply_gap_tour_picks`/`tripadvisor_search`; hold + write fixture-keyed `itinerary[]`; expose it via `lastPromoted()`.
- `worker/agent/folio-sync.ts` — MODIFY: project `days`/`includes`; add `apply_gap_tour_picks` + `tripadvisor_search` to `MUTATING`; add `DEMO_INCLUDES`.
- `worker/session-do.ts` — MODIFY: add the 3 tools to `DEMO_TOOLS`; add `ENRICHMENT_WORKFLOW` constant appended to every seed; overlay `promoted.itinerary` in `onFolio`.
- `scripts/capture-fixtures.mjs` — MODIFY (Task A5): capture real excursions/dining for the golden route.

**Component B (client):**
- `web/src/lib/mode.ts` (+ `mode.test.ts`) — NEW: live/auto axis, mirrors `lib/skin.ts`.
- `web/src/lib/recording.ts` (+ `recording.test.ts`) — NEW: `Frame`/`Recording` types, `replayChat` player.
- `web/src/lib/recorder.ts` — NEW: `?record=1` frame capture.
- `web/src/App.tsx` — MODIFY: extract `applyEvent`; wire recorder + replay + mode.
- `web/src/recordings/dublin-oct.json` — NEW: stub in Task B4, replaced by the real recording in Task D2.

**Component C (rendering):**
- `web/src/ClaudeChatView.tsx` — MODIFY: `FolioArtifact` renders `days`/`includes` (`cl-*` classes).
- `web/src/skin-claude.css` — MODIFY: `cl-*` rules for the new folio sections.
- `web/src/FolioPanel.tsx` — MODIFY: render `days`/`includes` (amber board classes).
- `web/src/styles.css` — MODIFY (if needed): board-skin day/dining/includes styles.

---

# Phase A — Worker content enrichment

## Task A1: Extend the `FolioData` shape

**Files:**
- Modify: `shared/events.ts`
- Test: `shared/events.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `shared/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { encodeSse, type FolioData } from "./events";

describe("FolioData enrichment shape", () => {
  it("encodes a folio carrying days[] and includes[]", () => {
    const folio: FolioData = {
      tripId: "t1", title: "Dublin", flights: [], hotels: [],
      days: [{
        title: "Day 1 — Dublin", date: "2026-10-12", location: "Dublin",
        activities: [{ name: "Kilmainham Gaol", description: "Historic tour", url: "https://x" }],
        dining: [{ name: "The Winding Stair", cuisine: "Irish", description: "Riverside", url: "https://y" }],
        stay: "Baggotrath House",
      }],
      includes: [{ key: "whats-included", title: "What's included", body: "Flights and hotels." }],
    };
    const line = encodeSse({ type: "folio", folio });
    expect(line).toContain("Kilmainham");
    expect(line).toContain("whats-included");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run shared/events.test.ts`
Expected: FAIL — TypeScript/`tsc` error that `days`/`includes` are not on `FolioData` (or a type error in the test).

- [ ] **Step 3: Add the types**

In `shared/events.ts`, insert after the `FolioHotel` interface (before `FolioData`):

```ts
export interface FolioActivity { time?: string; name: string; description?: string; url?: string }
export interface FolioDining   { name: string; description?: string; cuisine?: string; url?: string }
export interface FolioDay {
  date?: string; title: string; location?: string;
  activities: FolioActivity[]; dining: FolioDining[]; stay?: string;
}
export interface FolioInclude { key: string; title: string; body: string }
```

Then extend `FolioData` (add the two optional fields; leave the existing ones byte-identical):

```ts
export interface FolioData {
  tripId: string;
  title: string;
  flights: FolioFlight[];
  hotels: FolioHotel[];
  days?: FolioDay[];          // NEW — day-by-day (activities = excursions + free things; dining)
  includes?: FolioInclude[];  // NEW — boilerplate "what's included / tips"
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run shared/events.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add shared/events.ts shared/events.test.ts
git commit -m "feat(folio): extend FolioData with days[] and includes[]"
```

---

## Task A2: Project `days`/`includes` in `tripToFolio` + widen `isTripMutating`

**Files:**
- Modify: `worker/agent/folio-sync.ts`
- Test: `worker/agent/folio-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `worker/agent/folio-sync.test.ts`:

```ts
describe("tripToFolio enrichment projection", () => {
  it("projects itinerary[] into days[] and attaches includes when enriched", () => {
    const raw = { data: {
      meta: { title: "Dublin" },
      flights: { outbound: { route: "MOB→DUB", airline: "United", totalPrice: 3426, segments: [] }, return: null },
      lodging: [{ name: "Baggotrath House", total: 1343 }],
      itinerary: [{
        day: 1, date: "2026-10-12", location: "Dublin", title: "Arrive Dublin",
        activities: [{ name: "Kilmainham Gaol", description: "Historic gaol tour.", url: "https://v", priceFrom: 26 }],
        dining: [{ name: "The Winding Stair", cuisine: "Modern Irish", description: "Riverside bistro.", url: "https://t" }],
      }],
    } };
    const folio = tripToFolio("t1", raw);
    expect(folio.days?.[0].title).toContain("Dublin");
    expect(folio.days?.[0].activities[0].name).toBe("Kilmainham Gaol");
    expect(folio.days?.[0].dining[0].cuisine).toBe("Modern Irish");
    expect(folio.includes && folio.includes.length).toBeGreaterThan(0);
  });

  it("omits days/includes for an un-enriched trip (flights/hotels only, unchanged)", () => {
    const raw = { data: { meta: { title: "Dublin" }, flights: [], lodging: [] } };
    const folio = tripToFolio("t1", raw);
    expect(folio.days).toBeUndefined();
    expect(folio.includes).toBeUndefined();
  });
});

describe("isTripMutating enrichment tools", () => {
  it("flags apply_gap_tour_picks always, and tripadvisor_search with a trip id (snake or camel)", () => {
    expect(isTripMutating("apply_gap_tour_picks", {})).toBe(true);
    expect(isTripMutating("tripadvisor_search", { trip_id: "t1" })).toBe(true);
    expect(isTripMutating("tripadvisor_search", { tripId: "t1" })).toBe(true); // camelCase accepted
    expect(isTripMutating("tripadvisor_search", {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run worker/agent/folio-sync.test.ts`
Expected: FAIL — `folio.days` is undefined; `isTripMutating("apply_gap_tour_picks", {})` is false.

- [ ] **Step 3: Implement the projection + mutating set**

In `worker/agent/folio-sync.ts`:

(a) Update the import line to include the new types:

```ts
import type { FolioData, FolioFlight, FolioHotel, FolioDay, FolioActivity, FolioDining, FolioInclude } from "../../shared/events";
```

(b) Extend the `MUTATING` set (add the two new tools; keep the rest):

```ts
const MUTATING = new Set([
  "flight_search", "hotel_search", "excursion_search",
  "patch_trip", "confirm_lodging", "promote_flights",
  "promote_hotels_to_lodging", "add_booking",
  "apply_gap_tour_picks", "tripadvisor_search",
]);
```

(b2) Update `isTripMutating` so `_search` tools fire on a camelCase `tripId` too (the enrichment handlers accept either; without this `tripadvisor_search({tripId})` wouldn't re-project the folio). Replace the body:

```ts
export function isTripMutating(tool: string, args: Record<string, unknown>): boolean {
  if (!MUTATING.has(tool)) return false;
  // searches only mutate when accumulating into a trip (snake or camel id)
  if (tool.endsWith("_search")) return typeof args.trip_id === "string" || typeof args.tripId === "string";
  return true;
}
```

(c) Add the static includes template near the top (after `MUTATING`):

```ts
// Deterministic boilerplate "includes" — generic travel boilerplate carries no
// supplier data, so a static template is both fabrication-irrelevant and stable.
// Attached by tripToFolio once the trip has any itinerary days.
const DEMO_INCLUDES: FolioInclude[] = [
  { key: "whats-included", title: "What's included",
    body: "Round-trip flights, hand-picked hotels, and the day-by-day plan below — all booked and managed in one place." },
  { key: "good-to-know", title: "Good to know",
    body: "Activity and dining picks are suggestions you can swap anytime. Prices are live at time of search and confirmed before you book." },
  { key: "travel-tips", title: "Travel tips",
    body: "Bring layers for changeable weather, carry a contactless card for transit, and book popular excursions a few days ahead." },
];
```

(d) Add a day-projection helper (place above `tripToFolio`):

```ts
function asStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function projectDays(itinerary: unknown): FolioDay[] {
  if (!Array.isArray(itinerary)) return [];
  return itinerary
    .filter((d: any) => d && typeof d === "object")
    .map((d: any) => {
      const activities: FolioActivity[] = (Array.isArray(d.activities) ? d.activities : [])
        .filter((a: any) => a && typeof a === "object" && a.name)
        .map((a: any) => ({
          time: asStr(a.time),
          name: String(a.name),
          description: asStr(a.description),
          url: asStr(a.url ?? a.bookingUrl),
        }));
      const dining: FolioDining[] = (Array.isArray(d.dining) ? d.dining : [])
        .filter((m: any) => m && typeof m === "object" && m.name)
        .map((m: any) => ({
          name: String(m.name),
          description: asStr(m.description),
          cuisine: asStr(m.cuisine),
          url: asStr(m.url),
        }));
      // NB: a join of an all-empty array returns "" (not nullish), so `?? "Day"`
      // would never fire — use `|| "Day"` on the fallback to catch the empty case.
      const fallback = [asStr(d.day) ? `Day ${d.day}` : undefined, asStr(d.location)].filter(Boolean).join(" — ");
      const title = asStr(d.title) ?? (fallback || "Day");
      return {
        date: asStr(d.date),
        title,
        location: asStr(d.location),
        activities,
        dining,
        stay: asStr(d.stay ?? d.lodging?.name),
      };
    })
    .filter((day: FolioDay) => day.activities.length > 0 || day.dining.length > 0 || !!day.stay);
}
```

(e) At the end of `tripToFolio`, replace the final `return { tripId, title, flights, hotels };` with:

```ts
  const days = projectDays(t.itinerary);
  const base: FolioData = { tripId, title, flights, hotels };
  if (days.length > 0) { base.days = days; base.includes = DEMO_INCLUDES; }
  return base;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run worker/agent/folio-sync.test.ts` → PASS (incl. existing tests).
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add worker/agent/folio-sync.ts worker/agent/folio-sync.test.ts
git commit -m "feat(folio-sync): project itinerary into days[]/includes[]; widen mutating set"
```

---

## Task A3: Intercept enrichment tools in `replay.ts` (fabrication-guarded)

**Files:**
- Modify: `worker/fixtures/index.ts` (types only)
- Modify: `worker/mcp/replay.ts`
- Test: `worker/mcp/replay.test.ts`

- [ ] **Step 1: Add fixture types**

In `worker/fixtures/index.ts`, add after the `HotelCandidate` interface:

```ts
export interface ExcursionCandidate {
  productCode: string;        // real Viator product code — the load-bearing id
  title: string;
  day: number;                // 1-based itinerary day this belongs to
  free: boolean;              // true = "free thing to do" (priceFrom null/0)
  priceFrom: number | null;
  currency?: string | null;
  durationMinutes?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  description?: string | null;
  bookingUrl?: string | null;
  coverImage?: string | null;
}
export interface DiningCandidate {
  id: string;                 // real TripAdvisor location id
  name: string;
  day: number;                // 1-based itinerary day
  cuisine?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  priceLevel?: string | null; // "$$ - $$$"
  description?: string | null;
  url?: string | null;
}
export interface ItineraryDayScaffold {
  day: number; date: string; location: string; title: string;
}
```

Then extend the `Fixture` interface (add three optional fields; leave existing ones unchanged):

```ts
  excursions?: ExcursionCandidate[];
  dining?: DiningCandidate[];
  itineraryDays?: ItineraryDayScaffold[];
```

- [ ] **Step 2: Write the failing tests**

Append to `worker/mcp/replay.test.ts` (match the existing test file's imports/helpers — read the top of it first with `cat -n worker/mcp/replay.test.ts` and reuse its `ReplayHelpers` stub pattern). Add a self-contained block that builds a tiny fixture in-memory by reusing the real `FIXTURE_BY_ID` for `dublin-oct` if it has enrichment data, OR by exercising the guard with a known route. Use this structure:

```ts
import { FixtureReplay } from "./replay";

// Minimal in-memory helpers: capture what patchTrip writes so we can assert the
// fabrication guard wrote ONLY fixture-keyed objects.
function makeHelpers() {
  const trip: Record<string, any> = { meta: {}, flights: [], lodging: [], hotels: [], itinerary: [] };
  return {
    trip,
    h: {
      readTrip: async () => trip,
      patchTrip: async (u: Record<string, unknown>) => { Object.assign(trip, u); },
    },
  };
}

describe("enrichment interception (fabrication guard)", () => {
  it("excursion_search returns slim excursion candidates with real productCodes", async () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(await r.handle("excursion_search",
      { source: "viator", trip_id: "demo-x", destination: "Dublin" }, makeHelpers().h));
    // A fixture with no excursions yields count 0 + a note; with excursions, candidates carry productCode.
    expect(out.status).toBe("ok");
    if (out.count > 0) {
      expect(typeof out.candidates[0].productCode).toBe("string");
      expect(out.candidates[0]).not.toHaveProperty("coverImage"); // slim
    }
  });

  it("apply_gap_tour_picks writes ONLY fixture-keyed activities; drops unknown productCodes", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    const real = r.fixtureExcursionCodes(); // test helper added below; [] if the route has none
    const picks = [...real.slice(0, 1).map((code) => ({ day: 1, productCode: code })),
                   { day: 1, productCode: "FAKE-INVENTED-CODE" }];
    const out = JSON.parse(await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks }, h));
    expect(out).toBeTruthy();
    const allActs = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    // No activity may carry the invented code.
    expect(allActs.find((a: any) => a.productCode === "FAKE-INVENTED-CODE")).toBeUndefined();
    if (real.length > 0) expect(allActs.length).toBeGreaterThan(0);
  });

  it("tripadvisor_search writes only fixture dining into itinerary[].dining", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    const out = JSON.parse(await r.handle("tripadvisor_search",
      { trip_id: "demo-x", location: "Dublin", category: "restaurants" }, h));
    expect(out.status).toBe("ok");
    const allDining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    // Every written dining row must come from the fixture (matched by id).
    for (const d of allDining) expect(r.fixtureDiningIds().includes(d.id)).toBe(true);
  });
});
```

Then add a **positive-write** test that injects a tiny fixture (proves fixture-keyed activities/dining actually land — Codex flagged that the guard-only tests above don't prove this before D1):

```ts
import type { Fixture } from "../fixtures/index";

const TEST_FIXTURE: Record<string, Fixture> = {
  "test-dub": {
    route: { id: "test-dub", label: "T", origin: "MOB", destination: "DUB", city: "Dublin", depart: "2026-10-12", ret: "2026-10-14", adults: 2 },
    flights: [], hotels: [], promotedFlightsById: {}, promotedLodgingById: {},
    itineraryDays: [{ day: 1, date: "2026-10-12", location: "Dublin", title: "Arrive Dublin" }],
    excursions: [{ productCode: "VX1", title: "Kilmainham Gaol", day: 1, free: false, priceFrom: 26, currency: "USD", durationMinutes: 90, rating: 4.7, reviewCount: 1200, description: "Historic gaol.", bookingUrl: "https://v/1", coverImage: null }],
    dining: [{ id: "TA1", name: "The Winding Stair", day: 1, cuisine: "Irish", rating: 4.5, reviewCount: 800, priceLevel: "$$ - $$$", description: "Riverside.", url: "https://t/1" }],
  } as unknown as Fixture,
};

describe("enrichment positive writes (injected fixture)", () => {
  it("apply_gap_tour_picks writes the fixture-keyed activity into itinerary[day].activities", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: 1, productCode: "VX1" }] }, h);
    const acts = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ name: "Kilmainham Gaol", productCode: "VX1", addedBy: "gap-recommender" });
  });

  it("tripadvisor_search writes the fixture dining into itinerary[day].dining", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { trip, h } = makeHelpers();
    await r.handle("tripadvisor_search", { trip_id: "demo-x", location: "Dublin", category: "restaurants" }, h);
    const dining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    expect(dining).toHaveLength(1);
    expect(dining[0]).toMatchObject({ id: "TA1", name: "The Winding Stair" });
  });

  it("clears accumulated days when the enrichment route changes", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: 1, productCode: "VX1" }] }, h);
    // A search that resolves to no known fixture must reset the held itinerary.
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Nowhereville" }, h);
    expect(r.lastPromoted().itinerary).toBeNull();
  });
});
```

> Note: the guard-only tests above are tolerant of an enrichment-empty *real* fixture (they assert the *guard* holds, not a count) so they pass before Task D1 captures real Dublin data. The injected-fixture tests prove positive writes now. Hard count assertions against the real `dublin-oct.json` come in Task D1.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run worker/mcp/replay.test.ts`
Expected: FAIL — `r.handle("excursion_search", …)` returns the `not intercepted` error; `r.fixtureExcursionCodes` is not a function.

- [ ] **Step 4: Implement the interception**

In `worker/mcp/replay.ts`:

(a) Extend the imports from `../fixtures/index`:

```ts
import {
  FIXTURE_BY_ID, matchFlightFixture, matchHotelFixture, presetRoutes,
  type FlightCandidate, type HotelCandidate,
  type ExcursionCandidate, type DiningCandidate, type ItineraryDayScaffold,
} from "../fixtures/index";
```

(b) Add the three tools to `INTERCEPTED`:

```ts
const INTERCEPTED = new Set([
  "flight_search", "hotel_search",
  "flight_list", "hotel_list",
  "promote_flights", "promote_hotels_to_lodging",
  "excursion_search", "apply_gap_tour_picks", "tripadvisor_search",
]);
```

(c) Add slim mappers (after `slimHotel`):

```ts
function slimExcursion(c: ExcursionCandidate) {
  return {
    productCode: c.productCode,
    title: c.title,
    free: !!c.free,
    priceFrom: c.priceFrom ?? null,
    currency: c.currency ?? "USD",
    durationMinutes: c.durationMinutes ?? null,
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? null,
    description: c.description ?? null,
    bookingUrl: c.bookingUrl ?? null,
  };
}

function slimDining(c: DiningCandidate) {
  return {
    id: c.id,
    name: c.name,
    cuisine: c.cuisine ?? null,
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? null,
    priceLevel: c.priceLevel ?? null,
    description: c.description ?? null,
  };
}
```

(d) In the `FixtureReplay` class, add enrichment state + a getter for the itinerary overlay. Add these fields near `promotedLodging`:

```ts
  private enrichRouteId: string | null = null;
  // Itinerary the enrichment steps have built so far (day -> day object), seeded
  // lazily from the fixture's day scaffold. Held in replay state (not re-read from
  // staging) so it's deterministic and dodges KV eventual-consistency races —
  // exactly like promotedFlights/promotedLodging.
  private itineraryByDay: Map<number, Record<string, any>> = new Map();
```

(d0) Add a fixtures-injection seam so enrichment lookups can be unit-tested before real capture (Task D1). Change the constructor and add a `lookupHotelFixture` helper. Replace `constructor(private tripId: string) {}` with:

```ts
  // `fixtures` defaults to the real captured map; tests inject a small fixture
  // to exercise positive fixture-keyed writes before D1 captures real data.
  constructor(private tripId: string, private fixtures: Record<string, import("../fixtures/index").Fixture> = FIXTURE_BY_ID) {}

  // Match a destination/location to one of this replay's fixtures (mirrors
  // matchHotelFixture but over the injected map so tests can override).
  private lookupHotelFixture(location: unknown): import("../fixtures/index").Fixture | null {
    const m = matchHotelFixture(location);
    if (m && this.fixtures[m.route.id]) return this.fixtures[m.route.id];
    // Injected test fixtures aren't in the global FIXTURES that matchHotelFixture
    // scans, so fall back to a direct city/code match over this.fixtures.
    const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const t = norm(location);
    if (!t) return null;
    for (const f of Object.values(this.fixtures)) {
      const c = norm(f.route.destination), ci = norm(f.route.city);
      if (t === c || (ci && (t === ci || t.includes(ci) || ci.includes(t)))) return f;
    }
    return null;
  }
```

Everywhere this class currently reads `FIXTURE_BY_ID[...]` (in `currentFixture`, `applyGapTourPicks`, `fixtureExcursionCodes`, `fixtureDiningIds`, and the enrichment handlers below), read `this.fixtures[...]` instead. Flight/hotel matching (`matchFlightFixture`/`matchHotelFixture` + `flightRouteId`/`hotelRouteId`) is unchanged — only the enrichment path needs the override, and it goes through `lookupHotelFixture`.

(e) Extend `lastPromoted()` to also surface the itinerary:

```ts
  /** What promote_*/enrichment has committed this session — overlaid onto the folio snapshot. */
  lastPromoted(): { flights: unknown; lodging: Array<Record<string, unknown>> | null; itinerary: Record<string, any>[] | null } {
    const itinerary = this.itineraryByDay.size
      ? [...this.itineraryByDay.values()].sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
      : null;
    return { flights: this.promotedFlights, lodging: this.promotedLodging, itinerary };
  }
```

(f) Add test-only accessors (used by replay.test.ts):

```ts
  /** Test helper: productCodes available in the active enrichment fixture. */
  fixtureExcursionCodes(): string[] {
    const fx = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    return (fx?.excursions ?? []).map((e) => e.productCode);
  }
  /** Test helper: dining ids available in the active enrichment fixture. */
  fixtureDiningIds(): string[] {
    const fx = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    return (fx?.dining ?? []).map((d) => d.id);
  }
```

(g) Add the three cases to the `handle()` switch:

```ts
      case "excursion_search": return this.excursionSearch(args);
      case "apply_gap_tour_picks": return this.applyGapTourPicks(args, h);
      case "tripadvisor_search": return this.tripadvisorSearch(args, h);
```

(h) Add the handler methods (after `promoteHotels`). Note the day scaffold seeding + the fabrication guards:

```ts
  // Resolve the enrichment fixture from a destination/location arg, the same way
  // hotelSearch does. Sets enrichRouteId so apply/dining steps can find it.
  private resolveEnrichFixture(args: Record<string, any>): import("../fixtures/index").Fixture | null {
    const loc = args.destination ?? args.location ?? args.destination_name ?? args.query;
    const fixture = this.lookupHotelFixture(loc);
    const nextId = fixture ? fixture.route.id : null;
    // Clear accumulated days when the enrichment route changes (or resolves to
    // none) so a later route in the same session can't mix into old day objects.
    if (nextId !== this.enrichRouteId) this.itineraryByDay.clear();
    this.enrichRouteId = nextId;
    return fixture;
  }

  // Ensure the day object for `day` exists, seeded from the fixture scaffold.
  private ensureDay(fixture: import("../fixtures/index").Fixture, day: number): Record<string, any> {
    let d = this.itineraryByDay.get(day);
    if (!d) {
      const scaffold: ItineraryDayScaffold | undefined = (fixture.itineraryDays ?? []).find((s) => s.day === day);
      d = {
        day,
        date: scaffold?.date ?? null,
        location: scaffold?.location ?? fixture.route.city,
        title: scaffold?.title ?? `Day ${day} — ${fixture.route.city}`,
        activities: [],
        dining: [],
      };
      this.itineraryByDay.set(day, d);
    }
    return d;
  }

  private excursionSearch(args: Record<string, any>): string {
    const fixture = this.resolveEnrichFixture(args);
    if (!fixture || !(fixture.excursions && fixture.excursions.length)) {
      return JSON.stringify({
        status: "ok", source: "viator", tripId: this.tripId, count: 0, candidates: [],
        note: `No live activity results for ${args.destination ?? args.location ?? "?"}. Suggest one of these popular trips instead: ${suggestedTrips()}.`,
      });
    }
    const candidates = fixture.excursions.map(slimExcursion);
    const payload = JSON.stringify({
      status: "ok", source: "viator", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Choose 2-3 (mix paid + free), then call apply_gap_tour_picks with {tripId, picks:[{day, productCode}, ...]}.",
    });
    this.measurement = { tool: "excursionSearch" as any, modelFacingTokens: estTokens(payload) };
    return payload;
  }

  private async applyGapTourPicks(args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    const fixture = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    if (!fixture || !(fixture.excursions && fixture.excursions.length)) {
      return JSON.stringify({ status: "error", persisted: false, tripId: this.tripId, error: "No excursion candidates — call excursion_search first." });
    }
    const byCode = new Map(fixture.excursions.map((e) => [e.productCode, e]));
    const picks: Array<{ day: number; productCode: string }> = Array.isArray(args.picks) ? args.picks : [];
    const added: Array<{ day: number; productCode: string; name: string }> = [];
    const failed: Array<{ productCode: string; reason: string }> = [];
    for (const p of picks) {
      const code = typeof p?.productCode === "string" ? p.productCode : "";
      const ex = code ? byCode.get(code) : undefined;
      // Fabrication guard: only fixture-keyed productCodes reach the itinerary.
      if (!ex) { if (code) failed.push({ productCode: code, reason: "not a real candidate id" }); continue; }
      const day = this.ensureDay(fixture, ex.day);
      if ((day.activities as any[]).some((a) => a.productCode === code)) continue; // idempotent
      (day.activities as any[]).push({
        name: ex.title, provider: "Viator", source: "Viator", optional: true, addedBy: "gap-recommender",
        productCode: ex.productCode,
        duration: ex.durationMinutes != null ? `${ex.durationMinutes} min` : null,
        priceFrom: ex.priceFrom ?? null, currency: ex.currency ?? "USD",
        rating: ex.rating ?? null, reviewCount: ex.reviewCount ?? null,
        description: ex.description ?? null, url: ex.bookingUrl ?? null, coverImage: ex.coverImage ?? null,
        free: !!ex.free,
      });
      added.push({ day: ex.day, productCode: code, name: ex.title });
    }
    await this.writeItinerary(h);
    return JSON.stringify({
      status: added.length ? "ok" : "error", persisted: added.length > 0, tripId: this.tripId,
      added, ...(failed.length ? { failedPicks: failed } : {}),
    });
  }

  private async tripadvisorSearch(args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    const fixture = this.resolveEnrichFixture(args);
    if (!fixture || !(fixture.dining && fixture.dining.length)) {
      return JSON.stringify({ status: "ok", tripId: this.tripId, count: 0, candidates: [], note: `No dining results for ${args.location ?? "?"}.` });
    }
    const candidates = fixture.dining.map(slimDining);
    // Editorial dining is fixture-curated, not model-authored: writing it here
    // (search-doubles-as-apply) keeps it fabrication-safe by construction.
    if (typeof args.trip_id === "string" || typeof args.tripId === "string") {
      const byId = new Map((fixture.dining ?? []).map((d) => [d.id, d]));
      for (const d of byId.values()) {
        const day = this.ensureDay(fixture, d.day);
        if ((day.dining as any[]).some((x) => x.id === d.id)) continue;
        (day.dining as any[]).push({
          id: d.id, name: d.name, cuisine: d.cuisine ?? null, rating: d.rating ?? null,
          reviewCount: d.reviewCount ?? null, priceLevel: d.priceLevel ?? null,
          description: d.description ?? null, url: d.url ?? null,
        });
      }
      await this.writeItinerary(h);
    }
    const payload = JSON.stringify({ status: "ok", tripId: this.tripId, count: candidates.length, candidates,
      _next: "These are editorial local picks (not bookable inventory) — present a few in chat; they appear in the day-by-day folio." });
    this.measurement = { tool: "tripadvisorSearch" as any, modelFacingTokens: estTokens(payload) };
    return payload;
  }

  // Persist the full itinerary array (full-array write, per the demo's patch rule).
  private async writeItinerary(h: ReplayHelpers): Promise<void> {
    const itinerary = [...this.itineraryByDay.values()].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
    await h.patchTrip({ itinerary });
  }
```

> If `tsc` complains about `this.measurement` typing (`tool` is a narrow union), widen `measurement` to `{ tool: string; modelFacingTokens: number }` at its declaration — the `searchDistill` block in `session-do.ts` already narrows via a `metaKey` cast, so widening is safe. Verify with `cat -n worker/mcp/replay.ts` around the `measurement` field and the `lastMeasurement()` return type, and update both if needed.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run worker/mcp/replay.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add worker/fixtures/index.ts worker/mcp/replay.ts worker/mcp/replay.test.ts
git commit -m "feat(replay): intercept excursion_search/apply_gap_tour_picks/tripadvisor_search (fabrication-guarded)"
```

---

## Task A4: Wire enrichment into `session-do.ts` (tools, prompt, folio overlay)

**Files:**
- Modify: `worker/session-do.ts`

No new unit test (the DO is exercised end-to-end; `tsc` + the existing suite guard it). Verify carefully by reading the diff.

- [ ] **Step 1: Add the tools to `DEMO_TOOLS`**

Replace the `DEMO_TOOLS` set body:

```ts
const DEMO_TOOLS = new Set([
  "save_trip", "read_trip", "patch_trip",
  "flight_search", "flight_list", "promote_flights",
  "hotel_search", "hotel_list", "promote_hotels_to_lodging",
  "excursion_search", "apply_gap_tour_picks", "tripadvisor_search",
]);
```

- [ ] **Step 2: Add the `ENRICHMENT_WORKFLOW` constant**

Insert after the `BOARDS_WORKFLOW_OVERRIDE` constant (keep `SYSTEM_HINT` byte-identical):

```ts
// Enrichment workflow (additive, all sessions): after flights+hotels, build out
// the rest of the trip. Orthogonal to BOARDS_WORKFLOW_OVERRIDE — both are appended.
// Excursion selection boards are NOT built yet (deferred), so enrichment
// categories auto-add even in boards mode.
const ENRICHMENT_WORKFLOW =
  "AFTER flights and hotels are in the folio, enrich the trip (these categories do NOT use option cards — pick good ones yourself and add them):\n" +
  "6. EXCURSIONS & FREE THINGS: call excursion_search with { source:'viator', trip_id:<tripId>, destination:<city>, date:<departure_date> }. " +
  "From the candidates, choose 2-3 great ones — mix at least one free option (free:true) with a paid highlight — then call apply_gap_tour_picks with " +
  "{ tripId:<tripId>, picks:[ { day:<n>, productCode:'<id>' }, ... ] } using each candidate's own day and productCode. They appear in the day-by-day folio.\n" +
  "7. DINING (local picks): call tripadvisor_search with { trip_id:<tripId>, location:<city>, category:'restaurants' }. These are editorial local " +
  "recommendations, NOT bookable inventory — mention a couple in chat as suggestions to consider; they appear under each day in the folio.\n" +
  "8. Briefly tell the traveler the day-by-day plan now includes what's-included notes and travel tips — the folio carries the detail.\n" +
  "DATA RULES (unchanged): use ONLY tool-returned data for bookable items (flights, hotels, excursions). Dining picks are clearly framed as suggestions. " +
  "Never invent excursions, restaurants, prices, or ratings.";
```

- [ ] **Step 3: Append `ENRICHMENT_WORKFLOW` to the seed**

In `handleChat`, change the seed assembly so enrichment is appended for every session (after the optional boards override):

```ts
    if (this.messages.length === 0) {
      this.boardsMode = mode === "boards";
      const seed = SYSTEM_HINT
        + (this.boardsMode ? `\n\n${BOARDS_WORKFLOW_OVERRIDE}` : "")
        + `\n\n${ENRICHMENT_WORKFLOW}`;
      this.messages.push({ role: "user", content: `${seed}\n\nMy trip_id is ${this.tripId}.` });
    }
```

- [ ] **Step 4: Overlay the promoted itinerary in `onFolio` (always replay-controlled)**

In the `onFolio` callback, after the existing flights/lodging overlay lines, set the itinerary **unconditionally** from replay state. Unlike flights/lodging (which only overlay when non-null), the itinerary is *always* replay-controlled: the folio must never render a model-authored itinerary written via live `patch_trip`. This is the primary half of the enrichment fabrication guard (codex-review BLOCKER fix):

```ts
            const promoted = this.replay.lastPromoted();
            if (promoted.flights != null) data.flights = promoted.flights;
            if (promoted.lodging != null) data.lodging = promoted.lodging;
            // ALWAYS replay-controlled — a live/model-written itinerary is dropped.
            if (promoted.itinerary != null) data.itinerary = promoted.itinerary;
            else delete data.itinerary;
```

- [ ] **Step 4b: Sanitize model-initiated `patch_trip` (second half of the guard)**

In the `callTool` wrapper in `session-do.ts`, strip enrichment-content keys from a model `patch_trip` before the live staging write, so the model can't even persist a fabricated itinerary to staging. Replay's own `helpers.patchTrip` calls `mcp.callTool` directly and bypasses this wrapper, so fixture-keyed enrichment writes are unaffected. At the top of `callTool`, before the patch-savings block:

```ts
      if (name === "patch_trip") {
        const inAny = input as any;
        const updates = inAny.updates ?? inAny;
        if (updates && typeof updates === "object") {
          for (const k of ["itinerary", "days", "activities", "dining", "includes"]) delete updates[k];
        }
      }
```

> This sits inside `callTool` (the model-facing path), NOT `baseCallTool`/`helpers`. Verify by reading the current `callTool`/`helpers.patchTrip` split with `cat -n worker/session-do.ts` around lines 171–210 before editing.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add worker/session-do.ts
git commit -m "feat(session-do): wire enrichment tools + ENRICHMENT_WORKFLOW prompt + itinerary folio overlay"
```

---

## Task A5: Extend the fixture-capture script (run later, with Neil)

**Files:**
- Modify: `scripts/capture-fixtures.mjs`

This task writes the capture code but does **not** run it (running hits prod + needs API keys — that's Task D1, with Neil).

- [ ] **Step 1: Add an enrichment-capture step**

In `captureRoute(r)`, after the hotel promote block (step 7) and before the `meta` assembly, add real excursion + dining capture. The exact tool args mirror the voygent catalog; capture defensively (tolerate empties). Add:

```ts
  // 8. EXCURSIONS (viator) — real candidates for the demo's enrichment replay.
  //    Viator needs a destination_id; resolve via excursion_search's destination_name
  //    fallback, or pass a known code. Capture whatever comes back; map to the
  //    demo's ExcursionCandidate shape (productCode is load-bearing).
  let excursions = [];
  try {
    const ex = await callTool("excursion_search", { source: "viator", trip_id: tripId, destination_name: r.city, date: r.depart, max_results: 8 });
    record("excursion_search", { source: "viator", destination_name: r.city }, ex);
    const raw = ex.json?.candidates ?? ex.json?.products ?? [];
    // Spread across days round-robin so each demo day gets activity content.
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    excursions = raw.slice(0, 6).map((c, i) => ({
      productCode: c.productCode ?? c.product_code ?? c.id,
      title: c.title ?? c.name,
      day: (i % dayCount) + 1,
      free: Number(c.priceFrom ?? c.price_from ?? 0) === 0,
      priceFrom: c.priceFrom ?? c.price_from ?? null,
      currency: c.currency ?? "USD",
      durationMinutes: c.durationMinutes ?? c.duration_minutes ?? null,
      rating: c.rating ?? null,
      reviewCount: c.reviewCount ?? c.review_count ?? null,
      description: (c.description ?? c.descriptionShort ?? "").slice(0, 200),
      bookingUrl: c.bookingUrl ?? c.booking_url ?? null,
      coverImage: c.coverImage ?? c.cover_image ?? null,
    })).filter((e) => e.productCode && e.title);
    log(`  excursions: ${excursions.length}`);
  } catch (e) { log(`  excursion_search FAILED: ${e.message}`); }

  // 9. DINING (tripadvisor) — editorial local picks.
  let dining = [];
  try {
    const di = await callTool("tripadvisor_search", { trip_id: tripId, location: r.city, category: "restaurants", max_results: 8 });
    record("tripadvisor_search", { location: r.city }, di);
    const raw = di.json?.candidates ?? di.json?.results ?? di.json?.locations ?? [];
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    dining = raw.slice(0, 6).map((c, i) => ({
      id: String(c.id ?? c.location_id ?? c.locationId ?? i),
      name: c.name,
      day: (i % dayCount) + 1,
      cuisine: c.cuisine ?? (Array.isArray(c.cuisines) ? c.cuisines[0] : null),
      rating: c.rating ?? null,
      reviewCount: c.reviewCount ?? c.num_reviews ?? null,
      priceLevel: c.priceLevel ?? c.price_level ?? null,
      description: (c.description ?? "").slice(0, 200),
      url: c.url ?? c.web_url ?? null,
    })).filter((d) => d.name);
    log(`  dining: ${dining.length}`);
  } catch (e) { log(`  tripadvisor_search FAILED: ${e.message}`); }

  // Day scaffold (date + location + title per demo day).
  const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
  const itineraryDays = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1,
    date: addDays(r.depart, i),
    location: r.city,
    title: i === 0 ? `Arrive ${r.city}` : i === dayCount - 1 ? `Depart ${r.city}` : `${r.city} — Day ${i + 1}`,
  }));
```

Add two small date helpers near the top of the file (after `const ENC = ...`):

```ts
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) || 1; }
function addDays(d, n) { const t = new Date(Date.parse(d) + n * 86400000); return t.toISOString().slice(0, 10); }
```

- [ ] **Step 2: Include enrichment in the slim fixture write**

In the `writeFile(resolve(FIX_DIR, ...))` call, add the three fields to the written object:

```ts
    flights: flightCandidates,
    hotels: hotelCandidates,
    excursions,
    dining,
    itineraryDays,
    promotedFlightsById,
    promotedLodgingById,
    meta,
```

- [ ] **Step 3: Typecheck (script is JS, so just lint by running tsc on the rest)**

Run: `npx tsc --noEmit` → clean (the `.mjs` is not type-checked; this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-fixtures.mjs
git commit -m "feat(capture): capture real excursions + dining + day scaffold for enrichment fixtures"
```

---

# Phase B — Client record/replay

## Task B1: Mode axis (`live` | `auto`)

**Files:**
- Create: `web/src/lib/mode.ts`
- Test: `web/src/lib/mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveMode, normalizeMode, DEFAULT_MODE } from "./mode";

describe("mode resolution", () => {
  it("a known ?mode= param wins over storage", () => {
    expect(resolveMode("auto", "live")).toBe("auto");
    expect(resolveMode("live", "auto")).toBe("live");
  });
  it("falls back to storage then default for absent/unknown params", () => {
    expect(resolveMode(null, "auto")).toBe("auto");
    expect(resolveMode("bogus", null)).toBe(DEFAULT_MODE);
    expect(normalizeMode("nope")).toBe(DEFAULT_MODE);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/lib/mode.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `mode.ts`** (mirror `lib/skin.ts`)

Create `web/src/lib/mode.ts`:

```ts
// Mode axis — orthogonal to skin (lib/skin.ts) and theme (lib/theme.ts).
// "live" is the normal interactive chat; "auto" plays a committed golden
// recording ("▶ Watch the demo"). Resolution: ?mode= URL param (wins +
// persists) → localStorage → default.
export const MODE_IDS = ["live", "auto"] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const DEFAULT_MODE: ModeId = "live";
export const MODE_STORAGE_KEY = "voygent-demo-mode";

export function normalizeMode(raw: string | null | undefined): ModeId {
  return (MODE_IDS as readonly string[]).includes(raw ?? "") ? (raw as ModeId) : DEFAULT_MODE;
}

export function resolveMode(param: string | null | undefined, stored: string | null | undefined): ModeId {
  if (param && (MODE_IDS as readonly string[]).includes(param)) return param as ModeId;
  return normalizeMode(stored);
}

export function persistMode(id: ModeId): void {
  try { localStorage.setItem(MODE_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

export function resolveInitialMode(): ModeId {
  let param: string | null = null;
  let stored: string | null = null;
  try { param = new URLSearchParams(window.location.search).get("mode"); } catch { /* default */ }
  try { stored = localStorage.getItem(MODE_STORAGE_KEY); } catch { /* ignore */ }
  return resolveMode(param, stored);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run web/src/lib/mode.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/mode.ts web/src/lib/mode.test.ts
git commit -m "feat(mode): live/auto mode axis (mirrors skin axis)"
```

---

## Task B2: Extract the `applyEvent` reducer in `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

Pure refactor — live behavior must stay byte-identical. The existing E2E + suite guard it; `tsc` confirms wiring.

- [ ] **Step 1: Read the current `send()` reducer**

Run: `cat -n web/src/App.tsx` and locate the `streamChat(..., (e) => { ... }, ...)` callback body (the big `if (e.type === "text") … else if (e.type === "inspector") …` block).

- [ ] **Step 2: Extract `applyEvent`**

Inside `App`, above `send`, add a function that contains exactly the current per-event logic, parameterized by `claude`:

```ts
  // Single per-event reducer over the existing setters. Called by BOTH the live
  // stream callback and the replay player so they produce identical state.
  function applyEvent(e: ServerEvent, claude: boolean) {
    if (e.type === "text") setItems((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last && last.role === "assistant") c[c.length - 1] = { role: "assistant", text: last.text + e.delta };
      else c.push({ role: "assistant", text: e.delta });
      return c;
    });
    else if (e.type === "tool") {
      if (e.phase === "start") {
        setTools((t) => [...t, e.tool]);
        if (claude) setItems((m) => [...m, { role: "toolchip", name: e.tool, status: "running" }]);
      } else if (claude) {
        setItems((m) => {
          const c = [...m];
          for (let i = c.length - 1; i >= 0; i--) {
            const it = c[i];
            if (it.role === "toolchip" && it.name === e.tool && it.status === "running") {
              c[i] = { ...it, status: "done", summary: e.summary };
              break;
            }
          }
          return c;
        });
      }
    }
    else if (e.type === "board") setItems((m) => [...m, {
      role: "board", boardId: e.boardId, kind: e.kind, tripId: e.tripId, candidates: e.candidates,
    }]);
    else if (e.type === "folio") {
      setFolio(e.folio);
      setItems((m) => m.map((it) => (
        it.role === "board" && !it.resolved && !it.resolvedId &&
        ((it.kind === "flight" && e.folio.flights.length > 0) || (it.kind === "hotel" && e.folio.hotels.length > 0))
          ? { ...it, resolved: true } : it
      )));
    }
    else if (e.type === "error") showError(e.message);
    else if (e.type === "inspector") {
      if (e.kind === "tool") setInsTools((t) => [...t, e]);
      else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
      else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
      else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
      else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
    }
  }
```

Then replace the `streamChat` callback body with a one-liner delegating to it:

```ts
      await streamChat(API_BASE, sessionId, text, (e) => applyEvent(e, claude), claude ? "boards" : undefined);
```

(Leave the surrounding `setItems(... user + assistant placeholder)`, `setBusy`, `try/catch/finally` exactly as they are.)

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (no behavior change).

- [ ] **Step 4: Manual sanity (optional but recommended)**

Run `npm run dev:web` + `npm run dev:worker` in two shells, open `/?skin=claude`, click a preset, confirm flights/hotels promote and the folio renders exactly as before. (No deploy.)

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "refactor(app): extract applyEvent reducer (shared by live stream + replay)"
```

---

## Task B3: Recorder (`?record=1`)

**Files:**
- Create: `web/src/lib/recording.ts` (types only this task; player added in B4)
- Create: `web/src/lib/recorder.ts`
- Test: `web/src/lib/recording.test.ts` (schema test this task)

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/recording.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRecorder } from "./recorder";
import type { Recording } from "./recording";

describe("recorder", () => {
  it("captures user, event, and turn-end frames with non-negative delays", () => {
    let now = 1000;
    const rec = createRecorder("dublin-oct", () => now);
    rec.recordUser("Plan Dublin");
    now += 50; rec.recordEvent({ type: "text", delta: "Hi" });
    now += 20; rec.recordEvent({ type: "folio", folio: { tripId: "t", title: "Dublin", flights: [], hotels: [] } });
    rec.recordTurnEnd();
    const out: Recording = rec.export();
    expect(out.trip).toBe("dublin-oct");
    expect(out.skin).toBe("claude");
    expect(out.frames[0]).toMatchObject({ kind: "user", text: "Plan Dublin" });
    expect(out.frames[1]).toMatchObject({ kind: "event" });
    expect(out.frames.at(-1)).toMatchObject({ kind: "turn-end" });
    for (const f of out.frames) expect(f.delayMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/lib/recording.test.ts` → FAIL (modules not found).

- [ ] **Step 3: Add the recording types**

Create `web/src/lib/recording.ts`:

```ts
import type { ServerEvent } from "../../../shared/events";

export type Frame =
  | { delayMs: number; kind: "user"; text: string }       // push user msg + assistant placeholder; busy=true
  | { delayMs: number; kind: "event"; event: ServerEvent } // run through the shared reducer
  | { delayMs: number; kind: "turn-end" };                 // busy=false

export interface Recording {
  skin: "claude";
  trip: string;
  frames: Frame[];
}
```

- [ ] **Step 4: Implement the recorder**

Create `web/src/lib/recorder.ts`:

```ts
import type { ServerEvent } from "../../../shared/events";
import type { Frame, Recording } from "./recording";

// Captures a live claude-skin run into a Recording. `clock` returns ms (injected
// for tests; defaults to Date.now in the browser). Delay of each frame = time
// since the previous frame, so replay reproduces the live pacing.
export function createRecorder(trip: string, clock: () => number = () => Date.now()) {
  const frames: Frame[] = [];
  let last = clock();
  const delta = () => { const t = clock(); const d = Math.max(0, t - last); last = t; return d; };
  return {
    recordUser(text: string) { frames.push({ delayMs: delta(), kind: "user", text }); },
    recordEvent(event: ServerEvent) { frames.push({ delayMs: delta(), kind: "event", event }); },
    recordTurnEnd() { frames.push({ delayMs: delta(), kind: "turn-end" }); },
    export(): Recording { return { skin: "claude", trip, frames }; },
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run web/src/lib/recording.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Wire the recorder into `App.tsx` behind `?record=1`**

Add near the top of `App` (after the existing `useRef`s):

```ts
  const recordParam = (() => { try { return new URLSearchParams(window.location.search).get("record") === "1"; } catch { return false; } })();
  const recorder = useRef(recordParam ? createRecorder("dublin-oct") : null).current;
```

Import it: `import { createRecorder } from "./lib/recorder";`

In `send()`, hook the recorder at three points:
- right after `setItems((m) => [...m, { role: "user", text }, ...])`: `recorder?.recordUser(text);`
- inside the `streamChat` callback, wrap the delegate: `(e) => { recorder?.recordEvent(e); applyEvent(e, claude); }`
- in the `finally` block: `recorder?.recordTurnEnd();`

Add a tiny export affordance (so Neil can grab the JSON during capture). This is a **top-level `useEffect` inside `App`, placed beside the existing effects (NOT inside `send()` — a hook inside a function/callback is an invalid-hook-call runtime error).** It registers `window.__exportRecording` and cleans it up on unmount:

```ts
  useEffect(() => {
    if (!recorder) return;
    (window as any).__exportRecording = () => {
      const data = JSON.stringify(recorder.export(), null, 2);
      // eslint-disable-next-line no-console
      console.log("RECORDING_JSON_START\n" + data + "\nRECORDING_JSON_END");
      try {
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "dublin-oct.json"; a.click();
      } catch { /* console copy is the fallback */ }
      return data;
    };
    return () => { try { delete (window as any).__exportRecording; } catch { /* ignore */ } };
  }, [recorder]);
```

- [ ] **Step 7: Typecheck + suite**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/recording.ts web/src/lib/recorder.ts web/src/lib/recording.test.ts web/src/App.tsx
git commit -m "feat(recorder): ?record=1 captures a claude-skin run to a Recording"
```

---

## Task B4: Replay player + `?mode=auto` + "Watch the demo" control

**Files:**
- Modify: `web/src/lib/recording.ts` (add `replayChat`)
- Test: `web/src/lib/recording.test.ts`
- Create: `web/src/recordings/dublin-oct.json` (stub — replaced in Task D2)
- Modify: `web/src/App.tsx`
- Modify: `web/src/SkinSwitch.tsx` (or add a sibling control)

- [ ] **Step 1: Write the failing test for `replayChat`**

Append to `web/src/lib/recording.test.ts`:

```ts
import { replayChat } from "./recording";
import type { ServerEvent } from "../../../shared/events";

describe("replayChat", () => {
  it("drives the reducer to the recorded end-state (instant in tests)", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 5, kind: "user", text: "Plan Dublin" },
      { delayMs: 5, kind: "event", event: { type: "text", delta: "On it!" } as ServerEvent },
      { delayMs: 5, kind: "event", event: { type: "folio", folio: { tripId: "t", title: "Dublin", flights: [], hotels: [], days: [{ title: "Day 1", activities: [], dining: [], stay: "Hotel" }] } } as ServerEvent },
      { delayMs: 5, kind: "turn-end" },
    ] };
    const events: ServerEvent[] = [];
    const users: string[] = [];
    const busy: boolean[] = [];
    await replayChat(rec, {
      applyEvent: (e) => events.push(e),
      pushUser: (t) => users.push(t),
      setBusy: (b) => busy.push(b),
    }, { wait: async () => {} }); // instant
    expect(users).toEqual(["Plan Dublin"]);
    expect(events.map((e) => e.type)).toEqual(["text", "folio"]);
    expect(busy).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/lib/recording.test.ts` → FAIL (`replayChat` not exported).

- [ ] **Step 3: Implement `replayChat`**

Append to `web/src/lib/recording.ts`:

```ts
export interface ReplayHandlers {
  applyEvent: (e: ServerEvent) => void;  // caller binds claude=true
  pushUser: (text: string) => void;      // user bubble + assistant placeholder
  setBusy: (b: boolean) => void;
}

export interface ReplayOpts {
  reducedMotion?: boolean;               // compress delays for prefers-reduced-motion
  wait?: (ms: number) => Promise<void>;  // injected in tests for instant playback
  signal?: AbortSignal;                  // abort an in-flight replay (restart / mode switch)
}

// Abort-aware sleep: resolves on timeout OR immediately when the signal aborts,
// so a long recorded delay doesn't leave replay hanging after a restart/mode switch.
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
  const scale = opts.reducedMotion ? 0.2 : 1;
  for (const f of rec.frames) {
    if (opts.signal?.aborted) return;
    await wait(Math.round((f.delayMs ?? 0) * scale));
    if (opts.signal?.aborted) return;
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run web/src/lib/recording.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Add a stub recording so the build + auto path resolve**

Create `web/src/recordings/dublin-oct.json` (minimal valid `Recording`; replaced by the real capture in Task D2):

```json
{
  "skin": "claude",
  "trip": "dublin-oct",
  "frames": [
    { "delayMs": 300, "kind": "user", "text": "Plan the Dublin in October trip for 2." },
    { "delayMs": 600, "kind": "event", "event": { "type": "text", "delta": "Building your Dublin trip now…" } },
    { "delayMs": 400, "kind": "turn-end" }
  ]
}
```

- [ ] **Step 6: Wire auto mode + the control into `App.tsx`**

Add imports:

```ts
import { resolveInitialMode, persistMode, type ModeId } from "./lib/mode";
import { replayChat, type Recording } from "./lib/recording";
import dublinRecording from "./recordings/dublin-oct.json";
```

Add state + a replay-abort ref, and persist the resolved mode on load (so `?mode=auto` is sticky like the skin axis — codex-review nit):

```ts
  const [mode] = useState<ModeId>(resolveInitialMode);
  const replayAbort = useRef<AbortController | null>(null);
  useEffect(() => { persistMode(mode); }, [mode]);
```

Add `pushUser` (the user-bubble half of `send`, factored so replay can drive it):

```ts
  function pushUser(text: string) {
    setItems((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setTools([]);
  }
```

Add an auto-play effect (runs once on mount when `mode === "auto"`):

```ts
  useEffect(() => {
    if (mode !== "auto") return;
    if (skin !== "claude") setSkin("claude");      // auto always plays in the claude skin
    const ac = new AbortController();
    replayAbort.current?.abort();
    replayAbort.current = ac;
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    void replayChat(dublinRecording as Recording, {
      applyEvent: (e) => applyEvent(e, true),
      pushUser,
      setBusy,
    }, { reducedMotion: reduced, signal: ac.signal });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
```

Add a restart handler and a "Watch the demo / Build your own" control. Simplest: a `WatchDemoSwitch` pill rendered next to `SkinSwitch`. Add inline in the returned JSX, after `<SkinSwitch ... />`:

```tsx
      <button
        type="button"
        className="watch-demo"
        onClick={() => {
          const next: ModeId = mode === "auto" ? "live" : "auto";
          persistMode(next);
          try {
            const u = new URL(window.location.href);
            u.searchParams.set("mode", next);
            if (next === "auto") u.searchParams.set("skin", "claude");
            window.location.href = u.toString();   // reload re-latches the session cleanly
          } catch { /* no-op */ }
        }}
      >
        {mode === "auto" ? "● build your own" : "▶ watch the demo"}
      </button>
```

(Reload-to-switch keeps it simple and re-latches the worker session; in-place restart can be a later polish.)

Add standalone styling (do NOT reuse `.skin-switch` — that's a wrapper-with-child-buttons style; this is a standalone `<button>`). Append to `web/src/styles.css`:

```css
.watch-demo {
  position: fixed; bottom: 1rem; right: 9.5rem; z-index: 50;
  font: 600 0.72rem/1 var(--mono, ui-monospace, monospace);
  padding: 0.4rem 0.7rem; border-radius: 999px;
  background: #1a1a1a; color: #e8e8e8; border: 1px solid #333; cursor: pointer;
}
.watch-demo:hover { background: #262626; }
```

> Verify the `SkinSwitch` pill's actual fixed position/offset first (`cat -n web/src/SkinSwitch.tsx` and grep `.skin-switch` in `styles.css`) and adjust `right`/`bottom` so the two pills sit side by side without overlapping.

- [ ] **Step 7: Typecheck + suite + build**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green.
Run: `rm -rf dist-web && VITE_API_BASE="" npm run build:web` → builds clean (confirms the JSON import + new code bundle).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/recording.ts web/src/lib/recording.test.ts web/src/recordings/dublin-oct.json web/src/App.tsx web/src/styles.css
git commit -m "feat(replay): replayChat player + ?mode=auto autoplay + watch-the-demo control"
```

---

# Phase C — Rendering the enriched folio

## Task C1: Render `days`/`includes` in the claude-skin `FolioArtifact`

**Files:**
- Modify: `web/src/ClaudeChatView.tsx`
- Modify: `web/src/skin-claude.css`

No unit test (presentational; the suite tests logic, not DOM — matching repo convention). Verify visually.

- [ ] **Step 1: Render the new sections**

In `ClaudeChatView.tsx`, in `FolioArtifact`, broaden the early-return so a days-only/includes-only folio still renders, and add the sections after the Hotels block (before the closing `</div>` of `cl-artifact`):

Change the guard:

```ts
  const hasDays = !!folio.days && folio.days.length > 0;
  const hasIncludes = !!folio.includes && folio.includes.length > 0;
  if (folio.flights.length === 0 && folio.hotels.length === 0 && !hasDays && !hasIncludes) return null;
```

Add after the hotels section:

```tsx
      {hasDays && (
        <div className="cl-artifact-sec">
          <h4>Day by day</h4>
          {folio.days!.map((d, i) => (
            <div key={i} className="cl-day">
              <div className="cl-day-head">
                <span className="cl-day-title">{d.title}</span>
                {d.date && <span className="cl-day-date">{d.date}</span>}
              </div>
              {d.activities.length > 0 && (
                <ul className="cl-day-list">
                  {d.activities.map((a, j) => (
                    <li key={j}>
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}
                      {a.description && <span className="cl-day-desc"> — {a.description}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {d.dining.length > 0 && (
                <div className="cl-day-dining">
                  <span className="cl-day-dining-label">Local picks:</span>{" "}
                  {d.dining.map((m, j) => (
                    <span key={j} className="cl-dining-item">
                      {m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.name}</a> : m.name}
                      {m.cuisine ? ` (${m.cuisine})` : ""}{j < d.dining.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
              {d.stay && <div className="cl-day-stay">Stay: {d.stay}</div>}
            </div>
          ))}
        </div>
      )}
      {hasIncludes && (
        <div className="cl-artifact-sec">
          <h4>What's included &amp; good to know</h4>
          {folio.includes!.map((inc) => (
            <div key={inc.key} className="cl-include">
              <span className="cl-include-title">{inc.title}</span>
              <span className="cl-include-body">{inc.body}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 2: Add `cl-*` styles**

Append to `web/src/skin-claude.css` (all rules scoped under `:root[data-skin="claude"]`, matching the file's convention — verify the existing selector style with `cat -n web/src/skin-claude.css | head -30` and follow it exactly; never touch `--board/--ink/--amber`):

```css
:root[data-skin="claude"] .cl-day { padding: .5rem 0; border-top: 1px solid var(--cl-border, #ececec); }
:root[data-skin="claude"] .cl-day:first-of-type { border-top: none; }
:root[data-skin="claude"] .cl-day-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
:root[data-skin="claude"] .cl-day-title { font-weight: 600; }
:root[data-skin="claude"] .cl-day-date { font-size: .8em; opacity: .6; }
:root[data-skin="claude"] .cl-day-list { margin: .25rem 0 .25rem 1rem; padding: 0; }
:root[data-skin="claude"] .cl-day-desc { opacity: .7; }
:root[data-skin="claude"] .cl-day-dining { font-size: .9em; margin-top: .15rem; }
:root[data-skin="claude"] .cl-day-dining-label { opacity: .6; }
:root[data-skin="claude"] .cl-day-stay { font-size: .85em; opacity: .7; margin-top: .15rem; }
:root[data-skin="claude"] .cl-include { display: block; margin: .35rem 0; }
:root[data-skin="claude"] .cl-include-title { font-weight: 600; margin-right: .4rem; }
:root[data-skin="claude"] .cl-include-body { opacity: .8; }
```

- [ ] **Step 3: Typecheck + suite + build**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → green. `rm -rf dist-web && VITE_API_BASE="" npm run build:web` → clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/ClaudeChatView.tsx web/src/skin-claude.css
git commit -m "feat(folio-artifact): render day-by-day + dining + includes in claude skin"
```

---

## Task C2: Render `days`/`includes` in the board-skin `FolioPanel`

**Files:**
- Modify: `web/src/FolioPanel.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Render the new sections**

In `FolioPanel.tsx`, after the Hotels `<section>`, add (uses the board skin's existing visual language — plain sections; no `cl-*`):

```tsx
      {folio.days && folio.days.length > 0 && (
        <section>
          <h3>Day by day</h3>
          {folio.days.map((d, i) => (
            <div key={i} className="folio-day">
              <div className="folio-day-title">{d.title}{d.date ? ` · ${d.date}` : ""}</div>
              {d.activities.map((a, j) => (
                <div key={j} className="folio-day-act">
                  {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}
                  {a.description ? <span className="card-sub"> {a.description}</span> : null}
                </div>
              ))}
              {d.dining.length > 0 && (
                <div className="folio-day-dining">Local picks: {d.dining.map((m) => m.name + (m.cuisine ? ` (${m.cuisine})` : "")).join(", ")}</div>
              )}
              {d.stay && <div className="folio-day-stay">Stay: {d.stay}</div>}
            </div>
          ))}
        </section>
      )}
      {folio.includes && folio.includes.length > 0 && (
        <section>
          <h3>What's included &amp; good to know</h3>
          {folio.includes.map((inc) => (
            <div key={inc.key} className="folio-include">
              <strong>{inc.title}:</strong> {inc.body}
            </div>
          ))}
        </section>
      )}
```

- [ ] **Step 2: Add board-skin styles**

Append to `web/src/styles.css` (match existing `.folio`/`.card` conventions — verify with `cat -n web/src/styles.css | grep -n "folio\|card"`):

```css
.folio-day { padding: .35rem 0; border-top: 1px dashed var(--board-line, rgba(255,255,255,.12)); }
.folio-day:first-of-type { border-top: none; }
.folio-day-title { font-weight: 600; }
.folio-day-act { margin-left: .75rem; }
.folio-day-dining, .folio-day-stay { font-size: .85em; opacity: .75; margin-left: .75rem; }
.folio-include { margin: .3rem 0; opacity: .85; }
```

- [ ] **Step 3: Typecheck + suite + build**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → green. `rm -rf dist-web && VITE_API_BASE="" npm run build:web` → clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/FolioPanel.tsx web/src/styles.css
git commit -m "feat(folio-panel): render day-by-day + dining + includes in board skin"
```

---

## Task C3: End-to-end local verification (no deploy)

**Files:** none (verification only).

- [ ] **Step 1: Run the worker + web locally**

Two shells from the worktree:
- `npm run dev:worker`
- `npm run dev:web`

- [ ] **Step 2: Drive a full enriched run in the claude skin**

Open `http://localhost:5173/?skin=claude` (or the port Vite prints). Click the Dublin preset. Watch: flight board → pick → hotel board → pick → excursions/free auto-add → dining → includes. Confirm the folio artifact shows day-by-day activities, dining "local picks", and the includes block.

> If excursions/dining don't appear, the local fixture has no enrichment data yet (expected before Task D1). To verify rendering before capture, temporarily hand-add a small `excursions`/`dining`/`itineraryDays` block to `worker/fixtures/dublin-oct.json` locally, confirm, then `git checkout worker/fixtures/dublin-oct.json` to discard — do NOT commit hand-faked supplier data.

- [ ] **Step 3: Confirm the default board skin is unchanged**

Open `http://localhost:5173/` (no params). Confirm auto-pick behavior and the amber folio render with the same enrichment sections (board styling). Zero `cl-*` elements in the board skin.

- [ ] **Step 4: Confirm record + auto paths exist**

- `/?skin=claude&record=1` → run a turn → in the console call `__exportRecording()` → confirm JSON prints/downloads.
- `/?mode=auto` → confirm the stub recording plays (the 3-frame stub).

No commit (verification task). If anything fails, fix in the owning task and re-commit there.

---

# Phase D — Golden capture (LAST, with Neil — do NOT run solo)

## Task D1: Capture real Dublin enrichment fixtures

**Files:**
- Modify: `worker/fixtures/dublin-oct.json` (regenerated)
- Test: `worker/mcp/replay.test.ts` (add count-bearing assertions)

- [ ] **Step 1: With Neil, run the capture for Dublin only**

```bash
VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs --only=dublin-oct
```

Confirm the run logs non-zero `excursions:` and `dining:` counts and that `worker/fixtures/dublin-oct.json` now carries `excursions`/`dining`/`itineraryDays`. (The script self-cleans the `demo-cap-*` prod trips unless `--keep`.)

- [ ] **Step 2: Add count-bearing fixture tests**

Now that `dublin-oct` has real enrichment, append to `worker/mcp/replay.test.ts` a test that asserts the Dublin fixture produces ≥1 excursion candidate and that `apply_gap_tour_picks` with a real productCode writes exactly one activity. (Use `FIXTURE_BY_ID["dublin-oct"]` to pull a real `productCode`.)

- [ ] **Step 3: Verify**

Run: `npx vitest run worker/mcp/replay.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add worker/fixtures/dublin-oct.json worker/mcp/replay.test.ts
git commit -m "feat(fixtures): real captured Dublin excursions + dining + day scaffold"
```

---

## Task D2: Capture the golden recording

**Files:**
- Modify: `web/src/recordings/dublin-oct.json` (real recording replaces the stub)

- [ ] **Step 1: With Neil, build + serve locally and capture**

```bash
rm -rf dist-web && VITE_API_BASE="" npm run build:web
```

Open `/?skin=claude&record=1`, run the full golden flow: Dublin preset → flight board → pick → hotel board → pick → excursions/free/dining/includes auto-add → rich folio → the 1–2 showcased edits **Neil chooses live**. Then call `__exportRecording()` and save the JSON.

- [ ] **Step 2: Install + trim the recording**

Replace `web/src/recordings/dublin-oct.json` with the captured JSON. Hand-trim any awkwardly long `delayMs` gaps if needed (keep pacing natural).

- [ ] **Step 3: Verify the replay**

Rebuild, open `/?mode=auto`, confirm it plays the full rich run pixel-identically to the live capture, $0, deterministic. `npx vitest run` → green (the schema/replay tests still hold).

- [ ] **Step 4: Commit**

```bash
git add web/src/recordings/dublin-oct.json
git commit -m "feat(demo): golden Dublin recording for ?mode=auto"
```

- [ ] **Step 5: Deploy (with Neil, only on his say-so)**

```bash
rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy
```

Then verify live on `voygent-demo.somotravel.workers.dev/?mode=auto` and `/?skin=claude`.

---

## Final self-review checklist (run before requesting review)

- [ ] `npx tsc --noEmit` clean; `npx vitest run` all green (87 baseline + new tests).
- [ ] Default `/` (board skin, live mode, no record): same shell + flight/hotel board/auto-pick behavior as before, **plus** the trip now continues into excursions/dining/includes after hotels and the board-skin folio renders the new day-by-day/dining/includes sections. (NOT byte-identical by design — `ENRICHMENT_WORKFLOW` is appended to all sessions; the *only* byte-identical guarantees are `SYSTEM_HINT`, `BOARDS_WORKFLOW_OVERRIDE`, and the pre-enrichment flight/hotel flow.)
- [ ] Fabrication guard holds: no model path (incl. a direct `patch_trip {itinerary}`) writes non-fixture excursion/dining/itinerary into the rendered folio — itinerary is always replay-controlled in `onFolio` and stripped from model `patch_trip` (covered by replay.test.ts + the onFolio/sanitize edits).
- [ ] `SYSTEM_HINT` and `BOARDS_WORKFLOW_OVERRIDE` are byte-identical; enrichment is a separate appended constant.
- [ ] No `cl-*` leakage into the board skin; no `--board/--ink/--amber` overrides in `skin-claude.css`.
- [ ] `kind:"excursion"` boards NOT added; `worker/agent/boards.ts` untouched.
- [ ] Files staged by name on every commit (no `git add -A`).
