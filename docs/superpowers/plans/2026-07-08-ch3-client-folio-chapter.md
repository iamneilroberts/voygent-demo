# Ch3 "Their trip, their window" (client-folio chapter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reel chapter 3 — the viewer watches the Millers' own folio window (proposal arrives → explore → customize with live pricing → advisor update lands → Final) rendered by a new production-faithful `ReelFolioView` surface.

**Architecture:** A new snapshot type `ReelFolioSession` (FolioData content + the live-pricing slice) flows through a new `folioview` interaction kind, exactly parallel to the existing `clientview` mechanism: the screenplay emits consecutive snapshots, `applyInteraction` stores the latest in `ReelViewState.folioView`, and App renders `ReelFolioView` full-screen while it's open — `mode="scripted"` during playback, `mode="interactive"` as the chapter end-state. "Scripted scrolling" is implemented as section cuts: each snapshot names a `focus` anchor and the component smooth-scrolls it into view (spec Decision 5's pre-approved fallback, upgraded by smooth scrolling).

**Tech Stack:** React 18 + TypeScript (vite), vitest (pure-function tests only — no DOM test infra), hand-rolled screenplay DSL (`web/src/lib/screenplay.ts`), CSS in `web/src/skin-claude.css` (`cl-*` prefix). Spec: `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md`.

## Global Constraints

- **Prices are wire-truth from the ch1/ch2 fixture lineage** (`dublin-run.screenplay.ts`): flights **$3,180**; The Dean Dublin **$168/night × 7** ($1,176); activities **$284** (Wicklow ×2); add-ons Kilmainham Gaol **$58 pp → $116** for two, whiskey walk **$95 pp → $190** for two. Totals used in tests: base **4640**, +Kilmainham **4756**, +whiskey **4946**. No invented prices.
- **Honesty copy:** intro note must read `"This walk-through is scripted, like chapters 1 and 2. A real Voygent folio is a live page your clients open, change, and annotate."` Beat-4 spotlight copy must present the relay as *"a scripted rendering"* of the shipped folio→advisor flow — never as live.
- **Positioning spine (spec):** beats must land, in order: client feels in control → advisor doesn't have to upsell (pre-loaded priced options + live total do it) → trip comes back ready to book.
- **Required anchors** (literal `data-reel-target="..."` strings in `ReelFolioView.tsx`): `folio-hero`, `folio-days`, `folio-total`, `folio-note`, `folio-status`, `folio-includes`; per-day anchors use the template `folio-day-${n}` (covered by the guard test's `/^folio-day-\d+$/` dynamic pattern).
- **`ReelFolioView.tsx` must live directly in `web/src/`** (the guard test's `data-reel-target` scan is non-recursive over that dir).
- **The ch3 screenplay must emit NO `folio` ServerEvents** (`s.agent.folio` is forbidden) — the chapter is client-POV only, and a chat folio artifact would create duplicate `folio-days` anchors that mis-aim spotlights. A unit test enforces this.
- **Never render `commission` / `commissionPct` / `clientPrice` fields in `ReelFolioView`** — it is a client-facing surface; the fixture's `FolioHotel` carries commission data that must not leak (render name/area/nights/perNight only).
- **Registration:** `id: "client"`, `chapter: 3`, title `"Chapter 3 · Their trip, their window"`, `durationLabel: "~2 min"`; `run` gains `next: "client"`. `client` itself has NO `next` (chain ends silently until ch4).
- **Do not change ch1/ch2 behavior.** The only edits to existing reel files are: `export` keywords on three consts in `dublin-run.screenplay.ts`, `next: "client"` on the `run` registry entry, and additive type/union/switch cases.
- Styles go in `web/src/skin-claude.css` under the `cl-*` convention (new prefix `cl-fv-*`), using existing `--cl-*` custom properties.
- Every commit: `npx tsc --noEmit` and `npm run test` green. Stage files by name (never `git add -A`). Run all commands from the worktree root `/home/neil/dev/voygent-demo-demo-design`.

---

### Task 1: Visual contract — staging alaska-warm folio screenshot

**Files:**
- Create: `docs/reference/2026-07-08-alaska-warm-folio-staging.png`
- Modify: `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` (one line under "Build shape" item 1 recording the artifact path)

**Interfaces:**
- Produces: the reference PNG that Task 5/8 styling is checked against ("looks like production" = matches this artifact, not memory).

- [ ] **Step 1: Render a real staging folio.** From `/home/neil/dev/voygent-lite` (the skill lives there), list staging trips and preview one with days + hotel + flights (prefer an existing ZZTEST/demo trip; do NOT create prod data):

```bash
cd /home/neil/dev/voygent-lite && .claude/skills/voygent/voygent-mcp.sh staging call get_context '{}'
# pick a trip_id with a populated itinerary from the output, then:
cd /home/neil/dev/voygent-lite && .claude/skills/voygent/voygent-mcp.sh staging call preview_folio '{"trip_id":"<id>"}'
```

Expected: JSON containing a `previewUrl` (`https://…voygent.ai/drafts/...`).

- [ ] **Step 2: Screenshot it.** Open `previewUrl` in the browser (chrome-devtools MCP: `new_page` → `navigate_page` → `resize_page` to 1280×900 → `take_screenshot` fullPage). Save/copy the PNG to `/home/neil/dev/voygent-demo-demo-design/docs/reference/2026-07-08-alaska-warm-folio-staging.png`.

- [ ] **Step 3: Record the contract in the spec.** In the spec's "Build shape" item 1, append: `Contract artifact: docs/reference/2026-07-08-alaska-warm-folio-staging.png (captured 2026-07-08, staging).`

- [ ] **Step 4: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add docs/reference/2026-07-08-alaska-warm-folio-staging.png docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md && git commit -m "docs(reel): ch3 visual contract — staging alaska-warm folio screenshot"
```

---

### Task 2: `ReelFolioSession` type + pricing slice

**Files:**
- Modify: `web/src/lib/recording.ts` (imports at :1; after the `ReelClientSession` block ~:23)
- Modify: `web/src/lib/reel-pricing.ts` (whole file is 15 lines)
- Create: `web/src/lib/reel-pricing.test.ts`

**Interfaces:**
- Consumes: `FolioData` from `shared/events.ts`, `ReelHotelOption`/`ReelAddon` from `recording.ts`.
- Produces: `ReelFolioSession`, `ReelFolioNote`, `ReelAddon.day?: number` (all in `web/src/lib/recording.ts`); `TripPricing` + `computeTripTotal(v: TripPricing): number` (in `reel-pricing.ts`). Every later task uses these exact names.

- [ ] **Step 1: Write the failing test** — `web/src/lib/reel-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTripTotal, type TripPricing } from "./reel-pricing";

// The pricing slice is shared by ReelClientSession (ch1/ch2) and ReelFolioSession (ch3);
// these tests pin the slice shape so both stay assignable.
describe("computeTripTotal over the TripPricing slice", () => {
  const parts: TripPricing = {
    flightsPrice: 3180,
    activitiesPrice: 284,
    hotels: [{ id: "serp:h1", name: "The Dean Dublin", price: 168 * 7 }],
    pickedHotelId: "serp:h1",
    addons: [{ id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: true }],
  };
  it("sums flights + picked hotel + activities + toggled-on add-ons", () => {
    expect(computeTripTotal(parts)).toBe(4756);
  });
  it("drops toggled-off add-ons and an unpicked hotel", () => {
    expect(computeTripTotal({ ...parts, pickedHotelId: null, addons: [{ ...parts.addons[0], on: false }] })).toBe(3464);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/lib/reel-pricing.test.ts`
Expected: FAIL — `TripPricing` is not exported.

- [ ] **Step 3: Implement.** In `web/src/lib/recording.ts`:

(a) change the first import line to:

```ts
import type { ServerEvent, FolioData } from "../../../shared/events";
```

(b) add `day?: number` to `ReelAddon`:

```ts
export interface ReelAddon { id: string; label: string; price: number; on: boolean; day?: number }
```

(c) add, directly after the `ReelClientSession` interface:

```ts
export interface ReelFolioNote { anchor: string; author: "client" | "advisor"; text: string }

// The full client folio window (ch3): a simulated browser window showing the folio
// itself — production-faithful content (FolioData) plus the live-pricing fields the
// client plays with. Snapshot-based like ReelClientSession: each `folioview` beat
// replaces the snapshot; consecutive snapshots animate (total recalc, day swap,
// Draft→Final). `focus` names a data-reel-target anchor the surface scrolls into view
// (the spec's section-cut scroll driving). `expandedDay` is 1-based into folio.days.
export interface ReelFolioSession {
  open: boolean;
  url: string;
  folio: FolioData;
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
  notes: ReelFolioNote[];
  status: "draft" | "final";
  advisorUpdating: boolean;
  focus: string | null;
  expandedDay: number | null;
}
```

In `web/src/lib/reel-pricing.ts`, replace the whole file with:

```ts
import type { ReelHotelOption, ReelAddon } from "./recording";

// The pricing slice shared by ReelClientSession (ch1/ch2 client window) and
// ReelFolioSession (ch3 folio window). Both satisfy it structurally, so the one
// total function serves both surfaces.
export interface TripPricing {
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
}

// The client view's running trip total: flights + the chosen hotel (0 until picked) +
// activities + every toggled-on add-on. Pure so the live recalc is deterministic and
// testable; the component just formats the result.
export function computeTripTotal(v: TripPricing): number {
  const hotel = v.hotels.find((h) => h.id === v.pickedHotelId)?.price ?? 0;
  const addons = v.addons.filter((a) => a.on).reduce((n, a) => n + a.price, 0);
  return v.flightsPrice + hotel + v.activitiesPrice + addons;
}

// Whole-dollar money label, e.g. 4739 -> "$4,739".
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
```

- [ ] **Step 4: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/lib/reel-pricing.test.ts && npx tsc --noEmit && npm run test`
Expected: new tests PASS; typecheck clean; full suite green (existing `computeTripTotal` call sites take `ReelClientSession`, which satisfies `TripPricing` structurally).

- [ ] **Step 5: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/lib/recording.ts web/src/lib/reel-pricing.ts web/src/lib/reel-pricing.test.ts && git commit -m "feat(reel): ReelFolioSession type + TripPricing slice for the ch3 folio window"
```

---

### Task 3: `folioview` interaction plumbing (DSL verb → state)

**Files:**
- Modify: `web/src/lib/recording.ts` (`ReelInteraction` union, ~:36)
- Modify: `web/src/lib/interaction.ts` (state + reducer)
- Modify: `web/src/lib/highlights.ts` (`HighlightMatch.interactionKind` union, :11)
- Modify: `web/src/lib/screenplay.ts` (`makeHuman`, after the `view:` method ~:74; type import :2)
- Modify: `web/src/lib/interaction.test.ts` (new cases)

**Interfaces:**
- Consumes: `ReelFolioSession` from Task 2.
- Produces: `ReelInteraction` variant `{ kind: "folioview"; view: ReelFolioSession | null }`; `ReelViewState.folioView: ReelFolioSession | null`; screenplay verb `s.client.folioView(snapshot)` / `s.advisor.folioView(snapshot)`; highlight matcher `interactionKind: "folioview"`. Tasks 4/7 use these exact names.

- [ ] **Step 1: Write the failing test.** Append to `web/src/lib/interaction.test.ts` (inside the existing `describe`):

```ts
  it("opens, updates and closes the client folio window (folioview)", () => {
    const fv = {
      open: true, url: "voygent.app/t/dublin",
      folio: { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [] },
      flightsPrice: 3180, activitiesPrice: 284, hotels: [], pickedHotelId: null,
      addons: [], notes: [], status: "draft" as const, advisorUpdating: false,
      focus: null, expandedDay: null,
    };
    let s = applyInteraction(emptyReelViewState(), { kind: "folioview", view: fv }, "client");
    expect(s.folioView?.open).toBe(true);
    s = applyInteraction(s, { kind: "folioview", view: { ...fv, status: "final" } }, "client");
    expect(s.folioView?.status).toBe("final");
    s = applyInteraction(s, { kind: "folioview", view: null }, "client");
    expect(s.folioView).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/lib/interaction.test.ts`
Expected: FAIL (type error / unknown kind `folioview`, no `folioView` on state).

- [ ] **Step 3: Implement.**

`web/src/lib/recording.ts` — add to the `ReelInteraction` union (after the `clientview` line):

```ts
  | { kind: "folioview"; view: ReelFolioSession | null }
```

`web/src/lib/interaction.ts` — import the type, extend state + reducer; also update the stale header comment:

```ts
import type { Actor, ReelInteraction, ReelClientSession, ReelEngPanel, ReelFolioSession } from "./recording";
```

Replace the comment above `ReelViewState` with:

```ts
// Reel-only presentation state. The canonical chat folio is owned exclusively by the
// ServerEvent "folio" reducer (applyEvent); `folioView` below is a different thing —
// the ch3 client-window snapshot, which carries its own FolioData copy by design.
```

Add to `ReelViewState` (after `clientView`):

```ts
  folioView: ReelFolioSession | null;     // ch3: the client's full folio window
```

In `emptyReelViewState()` add `folioView: null,` after `clientView: null,`. In `applyInteraction` add (after the `clientview` case):

```ts
    case "folioview":
      return { ...state, folioView: i.view };
```

`web/src/lib/highlights.ts` — extend the `interactionKind` union at :11:

```ts
  interactionKind?: "pick" | "edit" | "comment" | "handoff" | "clientview" | "engpanel" | "folioview";
```

`web/src/lib/screenplay.ts` — add `ReelFolioSession` to the type import from `./recording`, and add to the object returned by `makeHuman`, directly after the `view:` method:

```ts
    // Ch3: open/update/close the simulated client FOLIO window (the full folio, not the
    // pricing widget). Snapshot-based like view(); pass null to close.
    folioView: (snapshot: ReelFolioSession | null) => {
      this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "folioview", view: snapshot }, beatId: this.beat() });
    },
```

- [ ] **Step 4: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/lib/interaction.test.ts && npx tsc --noEmit && npm run test`
Expected: PASS / clean / green.

- [ ] **Step 5: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/lib/recording.ts web/src/lib/interaction.ts web/src/lib/highlights.ts web/src/lib/screenplay.ts web/src/lib/interaction.test.ts && git commit -m "feat(reel): folioview interaction kind + folioView state + screenplay verb"
```

---

### Task 4: `dublin-client` screenplay + unit test

**Files:**
- Modify: `web/src/recordings/dublin-run.screenplay.ts` (add `export` to `days`, `soldFolio`, `tours` — three keywords, nothing else)
- Create: `web/src/recordings/dublin-client.screenplay.ts`
- Create: `web/src/recordings/dublin-client.screenplay.test.ts`

**Interfaces:**
- Consumes: `screenplay()` builder, `s.client.folioView` (Task 3), `ReelFolioSession` (Task 2), ch2 fixtures `days`/`soldFolio` (exported here).
- Produces: `export const dublinClient: { recording: Recording; highlights: Highlight[] }` — consumed by the registry (Task 6) and guard test (Task 5).

- [ ] **Step 1: Export the ch2 fixtures.** In `dublin-run.screenplay.ts` change `const days = [` → `export const days = [`, `const soldFolio: FolioData = {` → `export const soldFolio: FolioData = {`, `const tours: BoardCandidate[] = [` → `export const tours: BoardCandidate[] = [`. No other change.

- [ ] **Step 2: Write the failing test** — `web/src/recordings/dublin-client.screenplay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dublinClient } from "./dublin-client.screenplay";
import { computeTripTotal } from "../lib/reel-pricing";
import { resolveHighlightFrames } from "../lib/highlights";
import type { ReelFolioSession } from "../lib/recording";

const frames = dublinClient.recording.frames;
const views: ReelFolioSession[] = frames.flatMap((f) =>
  f.kind === "interaction" && f.interaction.kind === "folioview" && f.interaction.view ? [f.interaction.view] : []);

describe("dublin-client screenplay (ch3)", () => {
  it("produces frames, folio-window snapshots and highlights", () => {
    expect(frames.length).toBeGreaterThan(10);
    expect(views.length).toBeGreaterThanOrEqual(10);
    expect(dublinClient.highlights.length).toBeGreaterThanOrEqual(5);
  });

  it("stays in the client's window: emits no chat folio events", () => {
    expect(frames.filter((f) => f.kind === "event" && f.event.type === "folio")).toEqual([]);
  });

  it("animates the total as Julie toggles add-ons (4640 → 4756 → 4946 → 4756)", () => {
    const totals = views.map((v) => computeTripTotal(v));
    expect(totals[0]).toBe(4640);
    const idx = totals.indexOf(4756);
    expect(idx).toBeGreaterThan(0);
    expect(totals.slice(idx)).toContain(4946);
    expect(totals[totals.length - 1]).toBe(4756);
  });

  it("lands Julie's note on day 2 and the advisor's reply in the same thread", () => {
    const last = views[views.length - 1];
    expect(last.notes.map((n) => n.author)).toEqual(["client", "advisor"]);
    expect(last.notes.every((n) => n.anchor === "folio-day-2")).toBe(true);
  });

  it("swaps day 2 step-free and settles to Final with the window open (ends on the folio)", () => {
    const last = views[views.length - 1];
    expect(last.status).toBe("final");
    expect(last.open).toBe(true);
    const day2 = last.folio.days![1];
    const names = day2.activities.map((a) => a.name).join(" · ");
    expect(names).not.toContain("EPIC");
    expect(names).toContain("step-free");
  });

  it("keeps the honesty rule in the beat-4 spotlight (scripted rendering, not live)", () => {
    const relay = dublinClient.highlights.find((h) => h.target === "folio-day-2");
    expect(relay?.body).toContain("scripted rendering");
  });

  it("resolves every callout, in ascending frame order", () => {
    const hits = resolveHighlightFrames(frames, dublinClient.highlights);
    const total = [...hits.values()].reduce((n, hl) => n + hl.length, 0);
    expect(total).toBe(dublinClient.highlights.length);
    const keys = [...hits.keys()];
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/dublin-client.screenplay.test.ts`
Expected: FAIL — module `./dublin-client.screenplay` not found.

- [ ] **Step 4: Write the screenplay** — `web/src/recordings/dublin-client.screenplay.ts`:

```ts
import { screenplay } from "../lib/screenplay";
import type { FolioData } from "../../../shared/events";
import type { ReelFolioSession } from "../lib/recording";
import { days as dublinDays, soldFolio } from "./dublin-run.screenplay";

// "Their trip, their window" (chapter 3). Client POV: the viewer watches the Millers'
// own folio window for the whole chapter — the proposal arrives, they explore it, make
// it theirs, and the advisor's answer lands in the same window. Fresh pre-trip slice;
// does NOT replay ch2's whiskey-walk beat. All prices reuse the ch1/ch2 Dublin fixture
// lineage (soldFolio / tours). Honesty: scripted walk-through framing throughout, and
// beat 4 stays capability-true to the shipped folio→advisor flow (M7) — the demo shows
// a scripted rendering of that loop, never claims to be live.

// The proposal as it lands: soldFolio content, pre-trip (no bookings yet).
const proposalFolio: FolioData = { ...soldFolio };

// Day 2 after the advisor's step-free swap (beat 4): the EPIC museum goes out.
const swappedDays = dublinDays.map((d, i) => i === 1
  ? { ...d, activities: [d.activities[0], { name: "National Gallery of Ireland (step-free)" }] }
  : d);
const finalFolio: FolioData = { ...soldFolio, days: swappedDays };

const base: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/dublin",
  folio: proposalFolio,
  flightsPrice: 3180,
  activitiesPrice: 284, // the Wicklow day trip in the proposal: $142 pp × 2
  hotels: [{ id: "serp:h1", name: "The Dean Dublin", price: 168 * 7, meta: "$168/night · Camden St" }],
  pickedHotelId: "serp:h1",
  addons: [
    { id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: false, day: 4 },
    { id: "tour:whiskey", label: "Dublin whiskey tasting walk", price: 95 * 2, on: false, day: 4 },
  ],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: null,
  expandedDay: null,
};

const toggle = (s: ReelFolioSession, id: string, on: boolean): ReelFolioSession =>
  ({ ...s, addons: s.addons.map((a) => (a.id === id ? { ...a, on } : a)) });

// Beat 1 — arrives.
const fvArrive: ReelFolioSession = { ...base, focus: "folio-hero" };
// Beat 2 — explore: section cuts (smooth scroll between anchors).
const fvDays: ReelFolioSession = { ...base, focus: "folio-days" };
const fvDay5: ReelFolioSession = { ...base, focus: "folio-day-5", expandedDay: 5 };
const fvIncludes: ReelFolioSession = { ...base, focus: "folio-includes", expandedDay: 5 };
// Beat 3 — make it theirs.
const fvKilmainham = { ...toggle(fvIncludes, "tour:kilmainham", true), focus: "folio-total" };
const fvWhiskeyOn = toggle(fvKilmainham, "tour:whiskey", true);
const fvWhiskeyOff = toggle(fvWhiskeyOn, "tour:whiskey", false);
const julieNote = { anchor: "folio-day-2", author: "client" as const, text: "Mark's ankle — can we keep this day light on walking?" };
const fvNote: ReelFolioSession = { ...fvWhiskeyOff, notes: [julieNote], focus: "folio-note" };
// Beat 4 — the 2-way moment.
const advisorReply = { anchor: "folio-day-2", author: "advisor" as const, text: "Swapped the EPIC museum for the National Gallery. Step-free, and it keeps the afternoon slow." };
const fvUpdating: ReelFolioSession = { ...fvNote, advisorUpdating: true, focus: "folio-day-2" };
const fvSwapped: ReelFolioSession = { ...fvUpdating, advisorUpdating: false, folio: finalFolio, notes: [julieNote, advisorReply] };
const fvFinal: ReelFolioSession = { ...fvSwapped, status: "final", focus: "folio-status" };

export const dublinClient = screenplay({ trip: "Dublin · their window", skin: "claude" }, (s) => {
  // Beat 1: the proposal arrives. One advisor framing line, then their window.
  s.advisor.says("The Dublin plan is ready. Sending the Millers their folio — a link, not a PDF.");
  s.advisor.sendsToClient({ subject: "Your week in Dublin — have a look" });
  s.client.folioView(fvArrive);                                          // nth 0
  s.spotlight({ interactionKind: "folioview", nth: 0 }, {
    target: "folio-hero", eyebrow: "The proposal arrives",
    title: "A living page, not an attachment",
    body: "This is what lands in your client's inbox. The whole trip — flights, hotel, every day — on one page that stays current.",
  });

  // Beat 2: they explore.
  s.client.folioView(fvDays);                                            // nth 1
  s.client.folioView(fvDay5);                                            // nth 2
  s.spotlight({ interactionKind: "folioview", nth: 2 }, {
    target: "folio-day-5", eyebrow: "They explore",
    title: "Every day, already curated",
    body: "Six days the advisor shaped, with priced extras waiting on the day cards. One recommended plan packed with options to consider — not a week of back-and-forth emails.",
  });
  s.client.folioView(fvIncludes);                                        // nth 3

  // Beat 3: they make it theirs.
  s.client.folioView(fvKilmainham);                                      // nth 4
  s.spotlight({ interactionKind: "folioview", nth: 4 }, {
    target: "folio-total", eyebrow: "They make it theirs",
    title: "The folio makes the upsell",
    body: "Julie adds the Kilmainham tour and watches the total move. No quote to ask for, no upsell call to make — the advisor pre-loaded the options and the price answers instantly.",
  });
  s.client.folioView(fvWhiskeyOn);                                       // nth 5
  s.client.folioView(fvWhiskeyOff);                                      // nth 6
  s.client.folioView(fvNote);                                            // nth 7
  s.spotlight({ interactionKind: "folioview", nth: 7 }, {
    target: "folio-note", eyebrow: "Their question, in place",
    title: "Notes live on the trip, not in a thread",
    body: "Julie's question sits on day 2 itself. The advisor sees it in context — no reply-all chain to untangle.",
  });

  // Beat 4: the 2-way moment.
  s.client.folioView(fvUpdating);                                        // nth 8
  s.spotlight({ interactionKind: "folioview", nth: 8 }, {
    target: "folio-day-2", eyebrow: "The 2-way moment",
    title: "The advisor's answer lands in the same window",
    body: "Day 2 is reworked while the Millers watch. Voygent ships this loop — the folio tells the advisor what changed; this replay is a scripted rendering of it.",
  });
  s.client.folioView(fvSwapped);                                         // nth 9
  s.client.folioView(fvFinal);                                           // nth 10
  s.spotlight({ interactionKind: "folioview", nth: 10 }, {
    target: "folio-status", eyebrow: "Ready to book",
    title: "The trip comes back ready to book",
    body: "Step-free day 2, the tour they added, their note answered. The folio settles to Final — the advisor gets a booking, not a back-and-forth.",
  });
});
```

- [ ] **Step 5: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/dublin-client.screenplay.test.ts && npx tsc --noEmit && npm run test`
Expected: PASS / clean / green (ch2's own tests still green — the export-keyword edit is behavior-neutral).

- [ ] **Step 6: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/recordings/dublin-run.screenplay.ts web/src/recordings/dublin-client.screenplay.ts web/src/recordings/dublin-client.screenplay.test.ts && git commit -m "feat(reel): ch3 dublin-client screenplay — proposal, explore, self-serve add-ons, 2-way finish"
```

---

### Task 5: `ReelFolioView` component + styles + guard coverage

**Files:**
- Create: `web/src/ReelFolioView.tsx` (MUST be directly in `web/src/`)
- Modify: `web/src/skin-claude.css` (append a `cl-fv-*` block after the `.cl-explore-*` block, ~line 666+)
- Modify: `web/src/recordings/reel-targets.guard.test.ts` (add the `dublinClient` tuple)

**Interfaces:**
- Consumes: `ReelFolioSession` (Task 2), `computeTripTotal`/`usd` (Task 2), `NextChapterCta` from `./ReelEndCard`.
- Produces: `ReelFolioView({ view, mode, cta })` where `mode: "scripted" | "interactive"` and `cta?: { nextChapter?: NextChapterCta; onTryYourself: () => void; onReplay: () => void }` — consumed by App (Task 7).

- [ ] **Step 1: Extend the guard test first.** In `web/src/recordings/reel-targets.guard.test.ts`, add the import and tuple:

```ts
import { dublinClient } from "./dublin-client.screenplay";
```

and change the loop list to:

```ts
  for (const [name, screenplay] of [["dublinRun", dublinRun], ["dublinCollab", dublinCollab], ["dublinClient", dublinClient]] as const) {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/reel-targets.guard.test.ts`
Expected: FAIL for `dublinClient` — `folio-hero`, `folio-total`, `folio-note`, `folio-status` don't exist as static targets yet (`folio-day-5`/`folio-day-2` pass via the dynamic pattern; `folio-days`/`folio-includes` may pass via ClaudeChatView — the new component must still carry them).

- [ ] **Step 3: Write the component** — `web/src/ReelFolioView.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { ReelFolioSession } from "./lib/recording";
import type { NextChapterCta } from "./ReelEndCard";
import { computeTripTotal, usd } from "./lib/reel-pricing";

// Full-screen client folio window (ch3): the production-faithful folio the Millers see,
// rendered from a ReelFolioSession snapshot. Mode-aware (spec Decision 4): "scripted"
// renders snapshots verbatim with input disabled (the screenplay drives it);
// "interactive" seeds local state from the snapshot so the viewer can toggle add-ons
// and expand days (the chapter end-state). Visual contract:
// docs/reference/2026-07-08-alaska-warm-folio-staging.png — client-facing surface, so
// commission fields on the fixture are NEVER rendered here.
export function ReelFolioView({ view, mode, cta }: {
  view: ReelFolioSession;
  mode: "scripted" | "interactive";
  cta?: { nextChapter?: NextChapterCta; onTryYourself: () => void; onReplay: () => void };
}) {
  const interactive = mode === "interactive";
  const [localAddons, setLocalAddons] = useState(view.addons);
  const [localDay, setLocalDay] = useState<number | null>(view.expandedDay);
  const addons = interactive ? localAddons : view.addons;
  const expandedDay = interactive ? localDay : view.expandedDay;
  const total = computeTripTotal({ ...view, addons });
  const rootRef = useRef<HTMLDivElement>(null);

  // Scripted section cuts: bring the focused anchor into view (smooth unless reduced).
  useEffect(() => {
    if (!view.focus || !rootRef.current) return;
    const el = rootRef.current.querySelector<HTMLElement>(`[data-reel-target="${view.focus}"]`);
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [view.focus]);

  const days = view.folio.days ?? [];
  return (
    <div className="cl-fv-scrim" role="dialog" aria-modal="true" aria-label="The client's folio window">
      <div className="cl-fv-window">
        <div className="cl-fv-bar" aria-hidden="true"><span className="cl-fv-dots">● ● ●</span><span className="cl-fv-url">{view.url}</span></div>
        <div className="cl-fv-scroll" ref={rootRef}>
          <header className="cl-fv-hero" data-reel-target="folio-hero">
            <span className={`cl-fv-status ${view.status}`} data-reel-target="folio-status">{view.status === "final" ? "✓ Final" : "Draft"}</span>
            <h2 className="cl-fv-title">{view.folio.title}</h2>
            <p className="cl-fv-sub">Prepared for Mark &amp; Julie Miller · Oct 4–11</p>
          </header>

          {view.folio.flights.map((f) => (
            <div key={f.label} className="cl-fv-line"><span>✈ {f.label}{f.date ? ` · ${f.date}` : ""}</span><b>{f.price}</b></div>
          ))}
          {view.folio.hotels.map((h) => (
            <div key={h.name} className="cl-fv-line"><span>🏨 {h.name}{h.area ? ` · ${h.area}` : ""}{h.nights ? ` · ${h.nights} nights` : ""}</span><b>{h.perNight}/night</b></div>
          ))}

          <section className="cl-fv-days" data-reel-target="folio-days">
            {days.map((d, i) => {
              const n = i + 1;
              const openDay = expandedDay === n;
              const dayAddons = addons.filter((a) => a.day === n);
              const dayNotes = view.notes.filter((nt) => nt.anchor === `folio-day-${n}`);
              return (
                <article key={d.title} className={`cl-fv-day ${openDay ? "open" : ""}`} data-reel-target={`folio-day-${n}`}
                  onClick={interactive ? () => setLocalDay(openDay ? null : n) : undefined}>
                  <div className="cl-fv-day-h"><span className="cl-fv-day-date">{d.date}</span><span className="cl-fv-day-title">{d.title}</span></div>
                  {openDay && (
                    <div className="cl-fv-day-body">
                      {d.activities.map((a) => <div key={a.name} className="cl-fv-act">{a.name}</div>)}
                      {d.dining.map((x) => <div key={x.name} className="cl-fv-dine">🍽 {x.name}{x.cuisine ? ` · ${x.cuisine}` : ""}</div>)}
                    </div>
                  )}
                  {dayAddons.length > 0 && (
                    <div className="cl-fv-addons">
                      {dayAddons.map((a) => (
                        <button key={a.id} type="button" className={`cl-fv-addon ${a.on ? "on" : ""}`} disabled={!interactive} aria-pressed={a.on}
                          onClick={interactive ? (e) => { e.stopPropagation(); setLocalAddons((xs) => xs.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x))); } : undefined}>
                          <span className="cl-fv-check" aria-hidden="true">{a.on ? "☑" : "☐"}</span>
                          <span className="cl-fv-addon-label">{a.label}<i>recommended · add it if it fits</i></span>
                          <span className="cl-fv-addon-price">+{usd(a.price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {dayNotes.length > 0 && (
                    <div className="cl-fv-notes" data-reel-target="folio-note">
                      {dayNotes.map((nt, k) => (
                        <p key={k} className={`cl-fv-note ${nt.author}`}><b>{nt.author === "client" ? "Julie" : "Your advisor"}</b> {nt.text}</p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          {(view.folio.includes ?? []).length > 0 && (
            <section className="cl-fv-includes" data-reel-target="folio-includes">
              <h3 className="cl-fv-includes-h">Good to know</h3>
              {view.folio.includes!.map((inc) => (
                <details key={inc.key} open={view.focus === "folio-includes"}>
                  <summary>{inc.title}</summary><p>{inc.body}</p>
                </details>
              ))}
            </section>
          )}
        </div>

        {view.advisorUpdating && <div className="cl-fv-updating" role="status"><span className="cl-fv-pulse" aria-hidden="true" />Advisor is updating…</div>}
        <div className="cl-fv-total" data-reel-target="folio-total"><span>Trip total · two travellers</span><b key={total}>{usd(total)}</b></div>
        {cta && (
          <div className="cl-fv-cta">
            {cta.nextChapter && <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={cta.nextChapter.onClick}>{cta.nextChapter.label}</button>}
            <button type="button" className={`cl-reel-btn ${cta.nextChapter ? "cl-reel-btn-secondary" : "cl-reel-btn-primary"}`} onClick={cta.onTryYourself}>Build your own trip →</button>
            <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={cta.onReplay}>↺ Replay the chapter</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Starter styles.** Append to `web/src/skin-claude.css` (after the `.cl-explore-*` block; these are a working baseline — Task 8 iterates them against the visual contract):

```css
/* ===== Ch3: the client's full folio window (ReelFolioView, cl-fv-*) =====
   Visual contract: docs/reference/2026-07-08-alaska-warm-folio-staging.png */
:root[data-skin="claude"] .cl-fv-scrim { position: fixed; inset: 0; z-index: 63; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background: color-mix(in srgb, var(--cl-ink) 42%, transparent); }
:root[data-skin="claude"] .cl-fv-window { display: flex; flex-direction: column; width: 100%; max-width: 560px; max-height: min(88vh, 900px); background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 14px; overflow: hidden; box-shadow: 0 24px 64px rgb(0 0 0 / 0.28); }
:root[data-skin="claude"] .cl-fv-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--cl-line); font: 11px/1 var(--cl-mono); color: var(--cl-muted); }
:root[data-skin="claude"] .cl-fv-dots { letter-spacing: 2px; font-size: 7px; }
:root[data-skin="claude"] .cl-fv-url { padding: 3px 10px; border: 1px solid var(--cl-line); border-radius: 99px; }
:root[data-skin="claude"] .cl-fv-scroll { overflow-y: auto; padding: 18px 20px 8px; scroll-behavior: smooth; }
:root[data-skin="claude"] .cl-fv-hero { margin-bottom: 12px; }
:root[data-skin="claude"] .cl-fv-status { display: inline-block; padding: 2px 10px; border-radius: 99px; border: 1px solid var(--cl-line); font: 11px/1.6 var(--cl-sans); color: var(--cl-muted); }
:root[data-skin="claude"] .cl-fv-status.final { border-color: var(--cl-accent); color: var(--cl-accent); }
:root[data-skin="claude"] .cl-fv-title { margin: 6px 0 2px; font: 600 24px/1.15 var(--cl-serif); }
:root[data-skin="claude"] .cl-fv-sub { margin: 0; font: 13px/1.4 var(--cl-sans); color: var(--cl-muted); }
:root[data-skin="claude"] .cl-fv-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--cl-line); font: 13px/1.4 var(--cl-sans); }
:root[data-skin="claude"] .cl-fv-days { margin-top: 10px; }
:root[data-skin="claude"] .cl-fv-day { padding: 10px 12px; margin: 8px 0; border: 1px solid var(--cl-line); border-radius: 10px; }
:root[data-skin="claude"] .cl-fv-day.open { border-color: var(--cl-accent); }
:root[data-skin="claude"] .cl-fv-day-h { display: flex; gap: 10px; align-items: baseline; }
:root[data-skin="claude"] .cl-fv-day-date { font: 11px/1 var(--cl-mono); color: var(--cl-muted); white-space: nowrap; }
:root[data-skin="claude"] .cl-fv-day-title { font: 600 14px/1.3 var(--cl-sans); }
:root[data-skin="claude"] .cl-fv-day-body { margin-top: 8px; }
:root[data-skin="claude"] .cl-fv-act, :root[data-skin="claude"] .cl-fv-dine { padding: 3px 0; font: 13px/1.45 var(--cl-sans); color: var(--cl-ink); }
:root[data-skin="claude"] .cl-fv-addons { margin-top: 8px; display: grid; gap: 6px; }
:root[data-skin="claude"] .cl-fv-addon { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 1px dashed var(--cl-line); border-radius: 8px; background: none; text-align: left; font: 13px/1.3 var(--cl-sans); color: var(--cl-ink); cursor: pointer; }
:root[data-skin="claude"] .cl-fv-addon:disabled { cursor: default; }
:root[data-skin="claude"] .cl-fv-addon.on { border-style: solid; border-color: var(--cl-accent); }
:root[data-skin="claude"] .cl-fv-addon-label { flex: 1; display: flex; flex-direction: column; }
:root[data-skin="claude"] .cl-fv-addon-label i { font: 11px/1.4 var(--cl-sans); font-style: normal; color: var(--cl-muted); }
:root[data-skin="claude"] .cl-fv-addon-price { font: 600 13px/1 var(--cl-mono); white-space: nowrap; }
:root[data-skin="claude"] .cl-fv-notes { margin-top: 8px; padding: 8px 10px; border-left: 3px solid var(--cl-accent); background: color-mix(in srgb, var(--cl-accent) 6%, transparent); border-radius: 0 8px 8px 0; }
:root[data-skin="claude"] .cl-fv-note { margin: 4px 0; font: 13px/1.45 var(--cl-sans); }
:root[data-skin="claude"] .cl-fv-note b { font-weight: 600; margin-right: 6px; }
:root[data-skin="claude"] .cl-fv-includes { margin-top: 14px; }
:root[data-skin="claude"] .cl-fv-includes-h { margin: 0 0 6px; font: 600 13px/1 var(--cl-sans); color: var(--cl-muted); text-transform: uppercase; letter-spacing: 0.06em; }
:root[data-skin="claude"] .cl-fv-includes details { padding: 6px 0; border-bottom: 1px solid var(--cl-line); font: 13px/1.5 var(--cl-sans); }
:root[data-skin="claude"] .cl-fv-includes summary { cursor: pointer; font-weight: 600; }
:root[data-skin="claude"] .cl-fv-updating { display: flex; align-items: center; gap: 8px; padding: 8px 20px; border-top: 1px solid var(--cl-line); font: 12px/1 var(--cl-sans); color: var(--cl-muted); }
:root[data-skin="claude"] .cl-fv-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--cl-accent); animation: cl-fv-pulse 1.1s ease-in-out infinite; }
@keyframes cl-fv-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
:root[data-skin="claude"] .cl-fv-total { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 20px; border-top: 1px solid var(--cl-line); font: 13px/1 var(--cl-sans); }
:root[data-skin="claude"] .cl-fv-total b { font: 700 20px/1 var(--cl-serif); animation: cl-fv-bump 0.5s ease; }
@keyframes cl-fv-bump { 0% { transform: scale(1.12); } 100% { transform: scale(1); } }
:root[data-skin="claude"] .cl-fv-cta { display: grid; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid var(--cl-line); }
@media (max-width: 640px) { :root[data-skin="claude"] .cl-fv-scrim { padding: 0; } :root[data-skin="claude"] .cl-fv-window { max-width: none; max-height: none; height: 100%; border-radius: 0; } }
```

(If `--cl-serif` / `--cl-mono` / `--cl-accent` / `--cl-muted` / `--cl-ink` / `--cl-surface` / `--cl-line` names differ in `theme.css`, use the names the `.cl-explore-*` block uses — copy its exact var names.)

- [ ] **Step 5: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/reel-targets.guard.test.ts && npx tsc --noEmit && npm run test`
Expected: guard PASS (all six static anchors now literal in `ReelFolioView.tsx`); typecheck clean; suite green.

- [ ] **Step 6: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/ReelFolioView.tsx web/src/skin-claude.css web/src/recordings/reel-targets.guard.test.ts && git commit -m "feat(reel): ReelFolioView — mode-aware full-screen client folio surface (cl-fv-*)"
```

---

### Task 6: Registry entry + registry tests

**Files:**
- Modify: `web/src/recordings/registry.ts` (import; `run` entry; new `client` entry)
- Modify: `web/src/recordings/registry.test.ts`

**Interfaces:**
- Consumes: `dublinClient` (Task 4).
- Produces: registry entry `id: "client"` — `CHAPTERS`, the intro chapter list, and the A10 next-chapter chain pick it up with no App changes.

- [ ] **Step 1: Update the failing tests first.** In `registry.test.ts`:

Change:

```ts
it("CHAPTERS lists the story arc in order", () => {
  expect(CHAPTERS.map((c) => c.id)).toEqual(["collab", "run"]);
});
```

to:

```ts
it("CHAPTERS lists the story arc in order", () => {
  expect(CHAPTERS.map((c) => c.id)).toEqual(["collab", "run", "client"]);
});
```

Change:

```ts
it("run is chapter 2 with no next chapter yet", () => {
  const entry = pickReel(REELS, "run");
  expect(entry.chapter).toBe(2);
  expect(entry.next).toBeUndefined();
});
```

to:

```ts
it("run is chapter 2 and points to client as the next chapter", () => {
  const entry = pickReel(REELS, "run");
  expect(entry.chapter).toBe(2);
  expect(entry.next).toBe("client");
});
```

Add (in the `chapter arc` describe):

```ts
it("client is chapter 3, the end of the arc for now, with honest scripted framing", () => {
  const entry = pickReel(REELS, "client");
  expect(entry.chapter).toBe(3);
  expect(entry.next).toBeUndefined();
  expect(entry.title).toBe("Chapter 3 · Their trip, their window");
  expect(entry.intro?.note).toContain("scripted");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/registry.test.ts`
Expected: FAIL (3 tests — no `client` entry, `run.next` undefined, CHAPTERS has 2 ids).

- [ ] **Step 3: Implement.** In `registry.ts`: add the import

```ts
import { dublinClient } from "./dublin-client.screenplay";
```

add `next: "client",` to the `run` entry (directly under `chapter: 2,`), and append after the `run` entry:

```ts
  {
    id: "client",
    chapter: 3,
    title: "Chapter 3 · Their trip, their window",
    blurb: "The proposal lands with the Millers. Watch them explore it, make it theirs, and send it back ready to book.",
    durationLabel: "~2 min",
    recording: dublinClient.recording,
    highlights: dublinClient.highlights,
    recap: ["📬 a living page, not a PDF", "💷 priced add-ons, toggled live", "💬 their note, on the day itself", "✓ back to the advisor ready to book"],
    intro: { eyebrow: "▶ Chapter 3", note: "This walk-through is scripted, like chapters 1 and 2. A real Voygent folio is a live page your clients open, change, and annotate." },
  },
```

(No `endCard` — the chapter ends on the folio surface itself; the end-card branch is unreachable while `folioView.open` is true.)

- [ ] **Step 4: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx vitest run web/src/recordings/registry.test.ts && npx tsc --noEmit && npm run test`
Expected: PASS / clean / green.

- [ ] **Step 5: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/recordings/registry.ts web/src/recordings/registry.test.ts && git commit -m "feat(reel): register ch3 'client' chapter; run now chains to it"
```

---

### Task 7: App wiring — render the folio window while playing and at the end

**Files:**
- Modify: `web/src/App.tsx` (import block; the `reelPhase === "playing"` client-view render ~:532; the `reelPhase === "ended"` branch ~:560-573)

**Interfaces:**
- Consumes: `ReelFolioView` (Task 5), `reelView.folioView` (Task 3), existing `nextChapter` / `tryYourself` / `startReel`.
- Produces: ch3 plays full-screen in scripted mode; at `ended`, the folio stays up in interactive mode with the standard CTA row.

- [ ] **Step 1: Import.** Add to App.tsx imports:

```tsx
import { ReelFolioView } from "./ReelFolioView";
```

- [ ] **Step 2: Playing-phase render.** Directly after the existing `ReelClientView` block

```tsx
{skin === "claude" && mode === "auto" && reelPhase === "playing" && reelView.clientView?.open && (
  <ReelClientView view={reelView.clientView} />
)}
```

add:

```tsx
{skin === "claude" && mode === "auto" && reelPhase === "playing" && reelView.folioView?.open && (
  <ReelFolioView view={reelView.folioView} mode="scripted" />
)}
```

- [ ] **Step 3: Ended-phase render.** Change the end branch from the current two-way conditional to a three-way, folio first (ch1/ch2 behavior unchanged — they never set `folioView`):

```tsx
{skin === "claude" && mode === "auto" && reelPhase === "ended" && (
  reelView.folioView?.open
    // Ch3 ends on the folio itself: same surface, now interactive, standard CTA row.
    ? <ReelFolioView view={reelView.folioView} mode="interactive"
        cta={{ nextChapter, onTryYourself: tryYourself, onReplay: startReel }} />
    : reelView.clientView
    // Reels with a priced client-view (collab) end on an interactive folio the
    // viewer can experiment with; others keep the static end card.
    ? <ReelExplore view={reelView.clientView} onLiveDemo={tryYourself} onReplay={startReel} nextChapter={nextChapter} />
    : <ReelEndCard
        onTryYourself={tryYourself} onReplay={startReel}
        recap={selectedReel.recap}
        eyebrow={selectedReel.endCard?.eyebrow}
        title={selectedReel.endCard?.title}
        blurb={selectedReel.endCard?.blurb}
        nextChapter={nextChapter}
      />
)}
```

- [ ] **Step 4: Verify**

Run: `cd /home/neil/dev/voygent-demo-demo-design && npx tsc --noEmit && npm run test`
Expected: clean / green.

- [ ] **Step 5: Commit**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/App.tsx && git commit -m "feat(reel): route ch3 folio window through playback and the ended phase"
```

---

### Task 8: Browser pass + visual polish against the contract

**Files:**
- Modify: `web/src/skin-claude.css` (iterate `cl-fv-*` rules only)
- Possibly modify: `web/src/ReelFolioView.tsx` (markup tweaks surfaced by the pass)

- [ ] **Step 1: Run the dev server** (background): `cd /home/neil/dev/voygent-demo-demo-design && npm run dev:web` → note the local URL (default `http://localhost:5173`).

- [ ] **Step 2: Watch ch3 end-to-end** via chrome-devtools MCP at `http://localhost:5173/?reel=client&mode=auto`. Verify each beat: framing line → window opens on hero → section cuts scroll days → day 5 expands → includes open → Kilmainham toggles on and the total animates 4640→4756 → whiskey on/off (4946→4756) → note appears on day 2 → "Advisor is updating…" pulse → day 2 swaps step-free → status flips to Final → playback ends with the folio still up, CTA row visible ("Build your own trip →", "↺ Replay the chapter" — no next-chapter button, ch4 doesn't exist). Confirm every spotlight lands on the right element inside the window.

- [ ] **Step 3: Compare against the visual contract.** Screenshot the open folio window; put it side-by-side with `docs/reference/2026-07-08-alaska-warm-folio-staging.png`. Iterate the `cl-fv-*` block (type scale, serif usage, spacing, warmth of surfaces, status chip) until the window reads as the same product family. This is a judgment call — flag the comparison screenshots to Neil if uncertain.

- [ ] **Step 4: Regression-check the other reels.** `?reel=collab&mode=auto` seek to end → ReelExplore with "Watch Chapter 2 · Run the trip →"; `?reel=run&mode=auto` seek to end → its end surface now shows "Watch Chapter 3 · Their trip, their window →"; no-param visit → ch1 intro card now lists all three chapters. Also spot-check a phone viewport (390×844) — the `cl-fv-window` should go full-bleed.

- [ ] **Step 5: Commit the polish**

```bash
cd /home/neil/dev/voygent-demo-demo-design && git add web/src/skin-claude.css web/src/ReelFolioView.tsx && git commit -m "polish(reel): ReelFolioView styling against the alaska-warm visual contract"
```

---

### Task 9: Review gate → merge → deploy → live smoke

- [ ] **Step 1: Full local gate:** `cd /home/neil/dev/voygent-demo-demo-design && npx tsc --noEmit && npm run test && npm run build:web` — all green. (The pre-existing `worker/info/pages.test.ts:72` em-dash failure on main is a separate lane; if it fires here, note it, don't fix it in this diff.)

- [ ] **Step 2: Workflow code-review (lane convention — before every merge).** Run the `/code-review` skill at high effort on the demo-design diff vs main. Fix Criticals/Importants; re-run tests.

- [ ] **Step 3: Merge + deploy** (uses voygent-lite's `.env` `CLOUDFLARE_API_TOKEN` — the demo repo has none):

```bash
cd /home/neil/dev/voygent-demo && git status
```

(WIP check first — if the main clone carries another session's uncommitted edits, pause and surface.)

```bash
cd /home/neil/dev/voygent-demo && git merge --ff-only demo-design && npm run build:web && set -a && . /home/neil/dev/voygent-lite/.env && set +a && npx wrangler deploy
cd /home/neil/dev/voygent-demo && git push
```

- [ ] **Step 4: Live smoke** on `https://demo.voygent.ai/`: no-param → ch1 intro with three chapters listed; `?reel=client&mode=auto` plays ch3 and ends on the interactive folio; ch2 end surface offers Chapter 3. Confirm the new bundle hash is being served.

- [ ] **Step 5: Docs + journal.** Update `docs/summaries/CHECKLIST.md` (ch3 → `[x]`, C11 now unblocked), heartbeat the journal (`~/.claude/coordination/voygent-demo/journal.md`), and write the session handoff if stopping.

---

## Self-review notes (done at planning time)

- **Spec coverage:** beats 1–4 → Task 4; ReelFolioView + anchors + modes (Decisions 3/4) → Task 5; registration/chain → Task 6; end-on-folio + CTA row → Task 7; visual contract (Build shape 1) → Tasks 1/8; section-cut scroll (Decision 5) → `focus` snapshots + scroll effect; honesty rules → registry intro note + beat-4 spotlight copy + screenplay test; positioning spine → spotlight copy in Task 4. C11/C9/ReelExplore retirement: explicitly out (spec).
- **Known judgment points for the executor:** `--cl-*` CSS var names must be copied from the real `.cl-explore-*` block; `nth` indices in Task 4 are 0-based over `folioview` frames only (comments mark each); if `resolveHighlightFrames` matching surprises, mirror how ch2's `{ interactionKind: "clientview", nth: 1 }` resolves.
- **Deliberately not done:** no automated component/DOM tests (repo has no DOM test infra); no Playwright suite (none exists — browser pass is manual via chrome-devtools, same as A10).
