# Reel System Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six reel-system improvements surfaced while building the DIY free-tier reels: derived duration labels, per-reel actor labels, priced folio components (cruise-fare modeling), a per-reel honesty chip, chapter-copy migration to screenplay files, and optional DIY-reel discoverability.

**Architecture:** All changes are additive to the existing reel player (`web/src/`): new optional fields on `ReelEntry` and `ReelFolioSession` with defaults that keep every existing reel bit-for-bit identical, plus one shared duration-estimator lib extracted from duplicated test code. No worker changes.

**Tech Stack:** TypeScript, React (vite), vitest. No new dependencies.

## Global Constraints

- Work in the worktree `/home/neil/dev/voygent-demo-diy-free-reels` on branch `diy-free-reels` (continuation of the DIY-reels lane; commits `feccbf5`, `35439e1` precede this plan). Never touch `/home/neil/dev/voygent-demo` (main clone — another session owns it) or `SESSION_LOG.md`.
- Zero visible change for the existing reels (`dublin-oct`, `plan`, `client`, `advisor`) except where a task explicitly says otherwise (Task 1 changes their duration labels; Task 5 is a copy-location refactor with identical rendered strings).
- Every new `ReelEntry` / session field is optional; absent means today's behavior.
- No em-dashes in any user-facing string. Plain sentences, no over-polished cadence.
- After every task: `npx tsc --noEmit` clean and `npm test` green (baseline: 86 files / 650 tests), then commit.
- Task 5 is **HOLD**: do not start it until the advisor-fix session's work has merged to `main` and this branch has rebased/merged it (it rewrites the registry entries and touches the three chapter screenplay files — high conflict surface).
- Task 6 is **OPTIONAL**: needs Neil's product sign-off before implementation (it changes what first-time visitors see on the intro card).

---

### Task 1: Shared duration estimator + derived `durationLabel`

The runtime is fully computable from `pacing.ts`, but `durationLabel` is hand-authored and the estimator logic is duplicated in both DIY screenplay tests. Extract one lib, derive the labels in the registry, and de-duplicate the tests.

**Files:**
- Create: `web/src/lib/reel-duration.ts`
- Create: `web/src/lib/reel-duration.test.ts`
- Modify: `web/src/recordings/registry.ts` (all six `durationLabel` values become computed)
- Modify: `web/src/recordings/ireland-diy.screenplay.test.ts` (runtime test imports the lib)
- Modify: `web/src/recordings/caribbean-cruise.screenplay.test.ts` (same)
- Modify: `web/src/recordings/ireland-diy.screenplay.ts` + `caribbean-cruise.screenplay.ts` (drop `durationLabel` from their `meta` exports so there is one source of truth)

**Interfaces:**
- Consumes: `computeDelay(frame, prev, {speed, reducedMotion})` and `interactionDwell(kind, {speed, reducedMotion})` from `web/src/lib/pacing.ts`; `resolveHighlightFrames(frames, highlights): Map<number, Highlight[]>` from `web/src/lib/highlights.ts`.
- Produces: `estimateReelMs(recording: Recording, highlights: Highlight[]): number` and `reelDurationLabel(recording: Recording, highlights: Highlight[]): string` — Task 5 and the registry rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/reel-duration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Recording } from "./recording";
import { estimateReelMs, reelDurationLabel } from "./reel-duration";
import { irelandDiy } from "../recordings/ireland-diy.screenplay";
import { REELS } from "../recordings/registry";

describe("reel-duration", () => {
  it("estimates the ireland reel in its known 1x window", () => {
    const ms = estimateReelMs(irelandDiy.recording, irelandDiy.highlights);
    expect(ms).toBeGreaterThan(120_000);
    expect(ms).toBeLessThan(230_000);
  });

  it("honors an interaction's holdMs override instead of the kind floor", () => {
    // Synthetic one-frame recording: an un-spotlit folioview with holdMs 100 must
    // estimate shorter than the same frame using the 4200ms kind floor.
    const mk = (holdMs?: number): Recording => ({
      skin: "claude",
      trip: "t",
      frames: [{ delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "folioview", view: null }, ...(holdMs != null ? { holdMs } : {}) }],
    });
    expect(estimateReelMs(mk(100), [])).toBeLessThan(estimateReelMs(mk(), []));
  });

  it("formats labels as ~N min (ceil, floor 1)", () => {
    expect(reelDurationLabel(irelandDiy.recording, irelandDiy.highlights)).toMatch(/^~\d+ min$/);
  });

  it("every registered reel carries a sane computed label", () => {
    for (const r of REELS) {
      const m = r.durationLabel.match(/^~(\d+) min$/);
      expect(m, `${r.id} label "${r.durationLabel}"`).toBeTruthy();
      const n = Number(m![1]);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run web/src/lib/reel-duration.test.ts`
Expected: FAIL — `Cannot find module './reel-duration'`.

- [ ] **Step 3: Implement the lib**

Create `web/src/lib/reel-duration.ts`:

```ts
// Estimated 1x autoplay runtime for a reel, mirroring the player's pacing model:
// per-frame computeDelay + post-apply interaction dwell (skipped when a spotlight
// owns the hold, honoring frame.holdMs) + each callout's dwell. Read mode and
// manual Continue clicks make real runtime longer; this is the honest floor.
import type { Recording, Frame } from "./recording";
import type { Highlight } from "./highlights";
import { resolveHighlightFrames } from "./highlights";
import { computeDelay, interactionDwell } from "./pacing";

const CALLOUT_DEFAULT_DWELL = 4000; // matches the screenplay tests' assumption for un-dwelled callouts

export function estimateReelMs(recording: Recording, highlights: Highlight[]): number {
  const frames = recording.frames;
  const hlMap = resolveHighlightFrames(frames, highlights);
  let total = 0;
  let prev: Frame | null = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    total += computeDelay(f, prev, { speed: 1, reducedMotion: false });
    const hits = hlMap.get(i);
    if (f.kind === "interaction" && !(hits && hits.length)) {
      total += f.holdMs ?? interactionDwell(f.interaction.kind, { speed: 1, reducedMotion: false });
    }
    if (hits && hits.length) {
      for (const h of hits) total += h.dwellMs ?? CALLOUT_DEFAULT_DWELL;
    }
    prev = f;
  }
  return total;
}

// "~3 min" style label. Ceil, not round: Read-default playback and Continue
// clicks stretch real time, so the label should never promise less than 1x.
export function reelDurationLabel(recording: Recording, highlights: Highlight[]): string {
  const min = Math.max(1, Math.ceil(estimateReelMs(recording, highlights) / 60_000));
  return `~${min} min`;
}
```

Note: `Frame`'s interaction variant already carries `holdMs?: number` (see `web/src/lib/recording.ts`). If TypeScript narrows `f.holdMs` awkwardly on the union, guard with `f.kind === "interaction" ? f.holdMs : undefined`.

- [ ] **Step 4: Wire the registry to computed labels**

In `web/src/recordings/registry.ts`, add the import and replace every authored `durationLabel` string:

```ts
import { reelDurationLabel } from "../lib/reel-duration";
```

For each of the six entries replace, e.g. for `dublin-oct`:

```ts
durationLabel: reelDurationLabel(dublin as Recording, (dublinHl as HighlightTrack).highlights),
```

and for the screenplay-backed entries, e.g.:

```ts
durationLabel: reelDurationLabel(dublinCollab.recording, dublinCollab.highlights),
```

(same pattern for `client`, `advisor`, `ireland` via `irelandDiy`, `cruise` via `caribbeanCruise`). Remove `durationLabel` from the two `meta` exports in `ireland-diy.screenplay.ts` and `caribbean-cruise.screenplay.ts` and from the registry lines that read `irelandMeta.durationLabel` / `cruiseMeta.durationLabel`.

- [ ] **Step 5: De-duplicate the screenplay runtime tests**

In `ireland-diy.screenplay.test.ts` and `caribbean-cruise.screenplay.test.ts`, replace the inline estimator loop inside the `"estimates a 1x runtime"` test with:

```ts
import { estimateReelMs } from "../lib/reel-duration";
// ...
const total = estimateReelMs(irelandDiy.recording, irelandDiy.highlights);
expect(total).toBeGreaterThan(130_000);
expect(total).toBeLessThan(230_000);
```

Lower bound drops 140k → 130k in BOTH tests: the shared estimator honors `holdMs` overrides (shorter than kind floors), so estimates can come in a few seconds under the old inline numbers. Delete the now-unused `computeDelay`/`interactionDwell`/`resolveHighlightFrames` imports from each test if nothing else in the file uses them.

- [ ] **Step 6: Run the affected tests, then the full suite**

Run: `npx vitest run web/src/lib/reel-duration.test.ts web/src/recordings/ireland-diy.screenplay.test.ts web/src/recordings/caribbean-cruise.screenplay.test.ts web/src/recordings/registry.test.ts`
Expected: PASS. If a registry test asserted a literal label like `"~4 min"`, update it to match the computed value (print `REELS.map(r => [r.id, r.durationLabel])` once in a scratch test to see the new values, then delete the scratch).

Run: `npx tsc --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/reel-duration.ts web/src/lib/reel-duration.test.ts web/src/recordings/registry.ts web/src/recordings/ireland-diy.screenplay.* web/src/recordings/caribbean-cruise.screenplay.*
git commit -m "feat(reel): derive durationLabel from the pacing model (shared estimator, ceil minutes)"
```

---

### Task 2: Per-reel actor label overrides ("✓ You chose this")

`ACTOR_LABELS` is hardcoded, so a DIY reel's pick attribution reads "✓ Client chose this" where "✓ You chose this" is right. Add an optional override map on `ReelEntry`, threaded as a prop.

**Files:**
- Modify: `web/src/lib/reel-render.ts` (`actorLabel`/`actorInitial` gain an optional overrides param)
- Modify: `web/src/lib/reel-render.test.ts` (new cases)
- Modify: `web/src/recordings/registry.ts` (`ReelEntry.actorLabels?`, set on both DIY reels)
- Modify: `web/src/App.tsx` (pass `selectedReel.actorLabels` to `ClaudeChatView`)
- Modify: `web/src/ClaudeChatView.tsx` (accept + use + forward to `BoardView`; 3 call sites at lines ~62, ~64, ~202)
- Modify: `web/src/BoardView.tsx` (accept + use; 1 call site at line ~108)

**Interfaces:**
- Produces: `type ActorLabels = Partial<Record<Actor, string>>` exported from `web/src/lib/reel-render.ts`; `actorLabel(actor: Actor, overrides?: ActorLabels): string`; `actorInitial(actor: Actor, overrides?: ActorLabels): string`; `ReelEntry.actorLabels?: ActorLabels`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/lib/reel-render.test.ts`:

```ts
import { actorLabel, actorInitial } from "./reel-render";

it("actorLabel: overrides win, defaults hold", () => {
  expect(actorLabel("client")).toBe("Client");
  expect(actorLabel("client", { client: "You" })).toBe("You");
  expect(actorLabel("agent", { client: "You" })).toBe("Voygent");
});

it("actorInitial follows the overridden label", () => {
  expect(actorInitial("client", { client: "You" })).toBe("Y");
  expect(actorInitial("client")).toBe("C");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run web/src/lib/reel-render.test.ts`
Expected: FAIL — extra argument not accepted / wrong value.

- [ ] **Step 3: Implement in reel-render.ts**

Replace the `actorLabel`/`actorInitial` block in `web/src/lib/reel-render.ts`:

```ts
// Human-readable actor label for inline attribution ("Client chose this").
// The assistant actor is "Voygent", never "Agent" (confusing in a travel context,
// where an agent is a person). advisor/client capitalize normally. A reel can
// override per-actor labels (ReelEntry.actorLabels), e.g. client -> "You" in the
// DIY traveller-only reels.
export type ActorLabels = Partial<Record<Actor, string>>;
const ACTOR_LABELS: Record<Actor, string> = { agent: "Voygent", advisor: "Advisor", client: "Client" };
export function actorLabel(actor: Actor, overrides?: ActorLabels): string {
  return overrides?.[actor] ?? ACTOR_LABELS[actor] ?? (actor.charAt(0).toUpperCase() + actor.slice(1));
}
```

and

```ts
export function actorInitial(actor: Actor, overrides?: ActorLabels): string {
  return actorLabel(actor, overrides).charAt(0);
}
```

- [ ] **Step 4: Thread the prop**

1. `registry.ts`: add to `ReelEntry`:

```ts
import type { ActorLabels } from "../lib/reel-render";
// ...inside ReelEntry:
  // Per-actor label overrides for inline attribution during this reel
  // (e.g. { client: "You" } in the DIY reels). Absent -> Advisor/Client/Voygent.
  actorLabels?: ActorLabels;
```

and on BOTH DIY entries (`ireland`, `cruise`): `actorLabels: { client: "You" },`

2. `App.tsx`: on the `<ClaudeChatView ...>` element that already receives `showSend` (line ~536), add `actorLabels={selectedReel.actorLabels}`.

3. `ClaudeChatView.tsx`: add `actorLabels?: ActorLabels` to the props type (import the type from `./lib/reel-render`), destructure it, and:
   - line ~62: `actorInitial(c.actor)` → `actorInitial(c.actor, actorLabels)`
   - line ~64: `actorLabel(c.actor)` → `actorLabel(c.actor, actorLabels)`
   - line ~202: `actorLabel(edit.actor)` → `actorLabel(edit.actor, actorLabels)`
   - forward to every `<BoardView ...>` it renders: `actorLabels={actorLabels}`. (Run `grep -n "<BoardView" web/src` to catch every render site; any site outside a reel context just omits the prop.)

4. `BoardView.tsx`: add optional `actorLabels?: ActorLabels` prop; line ~108 `actorLabel(reelActor)` → `actorLabel(reelActor, actorLabels)`.

- [ ] **Step 5: Run tests and full suite**

Run: `npx vitest run web/src/lib/reel-render.test.ts && npx tsc --noEmit && npm test`
Expected: all green (existing reels pass no overrides, so nothing changes for them).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/reel-render.ts web/src/lib/reel-render.test.ts web/src/recordings/registry.ts web/src/App.tsx web/src/ClaudeChatView.tsx web/src/BoardView.tsx
git commit -m "feat(reel): per-reel actor label overrides; DIY reels say You, not Client"
```

---

### Task 3: Priced components in the folio cutaway (model a cruise fare properly)

The cruise reel had to smuggle its fare into "Optional extras" addon rows because `TripPricing` only knows flights/hotel/activities/addons. Add a `components` list: fixed, labeled, priced line items that sum into the total and render as their own section.

**Files:**
- Modify: `web/src/lib/recording.ts` (add `ReelComponent`, field on `ReelFolioSession`)
- Modify: `web/src/lib/reel-pricing.ts` (+ `web/src/lib/reel-pricing.test.ts`)
- Modify: `web/src/ReelFolioView.tsx` (render the section)
- Modify: `web/src/skin-claude.css` (row styles)
- Modify: `web/src/recordings/caribbean-cruise.screenplay.ts` + its test (migrate fare + fixed excursions from addons to components)

**Interfaces:**
- Produces: `interface ReelComponent { id: string; label: string; price: number }` in `web/src/lib/recording.ts`; `TripPricing.components?: ReelComponent[]`; `ReelFolioSession.components?: ReelComponent[]`; new static spotlight anchor `folio-components`.

- [ ] **Step 1: Write the failing pricing test**

Add to `web/src/lib/reel-pricing.test.ts`:

```ts
it("computeTripTotal sums fixed components", () => {
  const v = {
    flightsPrice: 0, activitiesPrice: 0, hotels: [], pickedHotelId: null, addons: [],
    components: [
      { id: "fare", label: "Cruise fare, 2 connecting cabins, 4 guests", price: 3180 },
      { id: "exc", label: "Chankanaab beach day, 4 guests", price: 117 },
    ],
  };
  expect(computeTripTotal(v)).toBe(3297);
});

it("components absent means unchanged totals", () => {
  const v = { flightsPrice: 100, activitiesPrice: 0, hotels: [], pickedHotelId: null, addons: [] };
  expect(computeTripTotal(v)).toBe(100);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run web/src/lib/reel-pricing.test.ts`
Expected: FAIL — components ignored (first test gets 0).

- [ ] **Step 3: Implement the type + math**

In `web/src/lib/recording.ts`, next to `ReelAddon`:

```ts
// A fixed, priced line item in the folio window (a cruise fare, a package, a
// transfer already committed). Unlike ReelAddon it has no on/off toggle; it is
// part of the trip and always counts toward the total.
export interface ReelComponent { id: string; label: string; price: number }
```

Add `components?: ReelComponent[];` to `ReelFolioSession`.

In `web/src/lib/reel-pricing.ts`:

```ts
import type { ReelHotelOption, ReelAddon, ReelComponent } from "./recording";

export interface TripPricing {
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
  components?: ReelComponent[];
}

export function computeTripTotal(v: TripPricing): number {
  const hotel = v.hotels.find((h) => h.id === v.pickedHotelId)?.price ?? 0;
  const addons = v.addons.filter((a) => a.on).reduce((n, a) => n + a.price, 0);
  const components = (v.components ?? []).reduce((n, c) => n + c.price, 0);
  return v.flightsPrice + hotel + v.activitiesPrice + addons + components;
}
```

- [ ] **Step 4: Render the section**

In `web/src/ReelFolioView.tsx`, directly BEFORE `<section className="cl-fv-days" data-reel-target="folio-days">` (line ~153), insert:

```tsx
{(view.components ?? []).length > 0 && (
  <section className="cl-fv-components" data-reel-target="folio-components">
    <h3 className="cl-fv-sec-h">In this trip</h3>
    {view.components!.map((c) => (
      <div key={c.id} className="cl-fv-component"><span>{c.label}</span><b>{usd(c.price)}</b></div>
    ))}
  </section>
)}
```

In `web/src/skin-claude.css`, next to the existing `.cl-fv-extras` styles, add:

```css
.cl-fv-components { margin: 10px 0 2px; }
.cl-fv-component { display: flex; justify-content: space-between; gap: 12px; padding: 6px 2px; border-bottom: 1px solid var(--cl-line); font-size: .875rem; }
.cl-fv-component b { font-variant-numeric: tabular-nums; }
```

(Match the neighboring rules' exact spacing conventions when you're in the file; the values above are the intent, the file's own idiom wins.)

- [ ] **Step 5: Migrate the cruise reel finale**

In `caribbean-cruise.screenplay.ts`, in the finale `ReelFolioSession` snapshots: move the cruise fare and the two picked excursions out of `addons` into `components` (the wifi addon that toggles between snapshots STAYS an addon — that's the total-pop beat):

```ts
components: [
  { id: "comp-fare", label: "Cruise fare, 2 connecting cabins, 4 guests", price: 3180 },
  { id: "comp-chankanaab", label: "Chankanaab beach and snorkel, 4 guests", price: 117 },
  { id: "comp-dunns", label: "Dunn's River Falls climb, 4 guests", price: 180 },
],
addons: [
  { id: "addon-wifi", label: "Ship wifi, one device", price: 89, on: false /* flips on in the last snapshot */ },
],
```

(Adapt ids/labels/day fields to what the file actually uses — read the existing snapshot objects first; totals must stay 3,755 with wifi on.) Update `caribbean-cruise.screenplay.test.ts`: the total-reconciliation assertion now hand-computes `189 + 3180 + 117 + 180 + 89`, and any assertion on addon counts/structure moves to components. Do NOT change the Ireland reel (its extras genuinely are optional addons).

- [ ] **Step 6: Run affected tests, then full suite**

Run: `npx vitest run web/src/lib/reel-pricing.test.ts web/src/recordings/caribbean-cruise.screenplay.test.ts web/src/reel-folio-view.test.tsx web/src/recordings/reel-targets.guard.test.ts && npx tsc --noEmit && npm test`
Expected: all green. (`folio-components` is a static literal so the guard's scanner picks it up automatically.)

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/recording.ts web/src/lib/reel-pricing.ts web/src/lib/reel-pricing.test.ts web/src/ReelFolioView.tsx web/src/skin-claude.css web/src/recordings/caribbean-cruise.screenplay.*
git commit -m "feat(reel): fixed priced components in the folio window; cruise fare is a line item, not an extra"
```

---

### Task 4: Per-reel honesty chip in the playback rail

Scripted reels are honest only on the intro and end cards; mid-reel there is no cue. Add a small optional chip in the reel control rail.

**Files:**
- Modify: `web/src/recordings/registry.ts` (`honestyChip?: string`, set on the two DIY reels)
- Modify: `web/src/App.tsx` (render it in the reel rail)
- Modify: `web/src/skin-claude.css` (`.cl-reel-honesty`)

**Interfaces:**
- Produces: `ReelEntry.honestyChip?: string` — rendered verbatim during playback when present.

- [ ] **Step 1: Add the field + copy**

In `registry.ts`, add to `ReelEntry`:

```ts
  // Small persistent chip in the playback rail, e.g. "Scripted walk-through ·
  // your own run pulls live results". Absent -> no chip (dublin-oct is a real
  // recording and needs none; the advisor chapters adopt it in a later pass).
  honestyChip?: string;
```

Set on BOTH DIY entries: `honestyChip: "Scripted walk-through · your own run pulls live results",`

Leave the three advisor chapters alone for now (churn vs the advisor-fix session); adopting it there is a one-line follow-up per entry after Task 5.

- [ ] **Step 2: Render it**

In `web/src/App.tsx`, inside the reel-controls container, immediately after the `{selectedReel.chapter != null && (...breadcrumb...)}` block closes (line ~616) and before that container's closing `</div>` (line ~617), add:

```tsx
{selectedReel.honestyChip && (
  <span className="cl-reel-honesty" role="note">{selectedReel.honestyChip}</span>
)}
```

In `web/src/skin-claude.css`, near the `.cl-reel-nav-label` / breadcrumb styles:

```css
.cl-reel-honesty { font-size: .6875rem; color: var(--cl-muted); white-space: nowrap; }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: green (no reel sets the field except the two DIY reels; no test asserts the rail's children). Then build once to be sure the JSX slot is valid: `VITE_API_BASE="" npm run build:web` — expect a clean build.

- [ ] **Step 4: Commit**

```bash
git add web/src/recordings/registry.ts web/src/App.tsx web/src/skin-claude.css
git commit -m "feat(reel): optional per-reel honesty chip in the playback rail (DIY reels)"
```

---

### Task 5: Move chapter copy into the screenplay files (HOLD until advisor-fix merges)

The DIY reels keep intro/endCard/recap copy in a `meta` export next to the content; the three chapters keep theirs in `registry.ts`. Converge on the screenplay-file pattern so copy and content can't drift apart.

**Pre-condition:** the advisor-fix session's branch has merged to `main` AND this branch has merged/rebased `main` cleanly (`git fetch origin && git merge origin/main`, resolve, full suite green). Do not start otherwise.

**Files:**
- Modify: `web/src/recordings/dublin-collab.screenplay.ts`, `dublin-client.screenplay.ts`, `dublin-run.screenplay.ts` (append a `meta` export each)
- Modify: `web/src/recordings/registry.ts` (entries consume the metas)

**Interfaces:**
- Consumes: the exact copy strings currently in `registry.ts` lines ~44-95 (title/blurb/recap/intro/endCard per chapter — copy them VERBATIM; this task moves strings, it does not edit them).
- Produces: `export const meta = { id, title, blurb, intro, endCard, recap } as const` from each chapter screenplay (same shape the DIY reels already export, minus `durationLabel` which Task 1 removed).

- [ ] **Step 1: Append a `meta` export to each chapter screenplay**

Example for `dublin-collab.screenplay.ts` (repeat pattern for the other two with their own registry strings):

```ts
// Registry copy for this chapter. Lives here so the walk-through's words and its
// content change in the same file; registry.ts only wires ids and ordering.
export const meta = {
  id: "plan",
  title: "1 · Plan the trip",
  blurb: "An advisor and Voygent build a week in Dublin: real searches, a hotel shortlist, the open day sold, and the advisor's commission in view.",
  intro: {
    eyebrow: "▶ Demo 1 of 3",
    note: "A scripted walk-through of the workflow. Your own run pulls real live flights and hotels.",
  },
  endCard: {
    eyebrow: "✓ Demo 1 · the plan is out",
    title: "The trip is with the travellers",
    blurb: "The travellers get a link to a live, detailed portfolio with the advisor's recommendations and transparent pricing. They can try out the alternatives, get more details by clicking an item, or ask a question that is instantly routed back to the advisor. That is demo 2. (This walk-through is scripted; a real run pulls live flights and hotels.)",
  },
  recap: ["six real fares, one pick", "a 3-hotel shortlist for the clients", "the week, day by day", "the open day becomes a $43 commission", "the advisor edits in place", "commission projected, itemized"],
} as const;
```

IMPORTANT: copy the strings from the CURRENT registry.ts at execution time (the advisor-fix merge may have edited them), not from this plan.

- [ ] **Step 2: Consume in registry.ts**

```ts
import { dublinCollab, meta as planMeta } from "./dublin-collab.screenplay";
```

and rewrite each chapter entry in the DIY-entry style:

```ts
{
  id: planMeta.id,
  chapter: 1,
  next: "client",
  title: planMeta.title,
  blurb: planMeta.blurb,
  durationLabel: reelDurationLabel(dublinCollab.recording, dublinCollab.highlights),
  recording: dublinCollab.recording,
  highlights: dublinCollab.highlights,
  recap: [...planMeta.recap],
  intro: { ...planMeta.intro },
  endCard: { ...planMeta.endCard },
},
```

- [ ] **Step 3: Prove the rendered strings did not change**

Run: `npm test`
Expected: green — in particular `registry.test.ts` and any copy-asserting tests pass untouched. If a test asserted registry literals, it should STILL pass because the strings are identical; a failure here means a transcription error in Step 1 — fix the meta, never the test.

- [ ] **Step 4: Commit**

```bash
git add web/src/recordings/dublin-*.screenplay.ts web/src/recordings/registry.ts
git commit -m "refactor(reel): chapter copy moves into the screenplay files (meta exports), registry wires only"
```

---

### Task 6 (OPTIONAL — needs Neil's sign-off): DIY reels discoverable on the intro card

Today `?reel=ireland` / `?reel=cruise` are URL-only. Minimal discoverability: a second small list under the chapter list on the intro card. This changes the first-visit surface — get Neil's yes before building.

**Files:**
- Modify: `web/src/recordings/registry.ts` (`audience?: "traveller"`, set on both DIY reels)
- Modify: `web/src/ReelIntro.tsx` (optional `more` list)
- Modify: `web/src/App.tsx` (pass the list)
- Modify: `web/src/skin-claude.css` (label style)

**Interfaces:**
- Produces: `ReelEntry.audience?: "traveller"`; `ReelIntro` prop `more?: { id: string; title: string; durationLabel: string }[]`.

- [ ] **Step 1: Registry field**

```ts
  // Which audience a non-chapter reel is authored for. "traveller" reels are
  // listed under "Planning it yourself?" on the intro card. Absent -> unlisted.
  audience?: "traveller";
```

Set `audience: "traveller",` on the `ireland` and `cruise` entries.

- [ ] **Step 2: ReelIntro renders the extra list**

Add `more` to the props type next to `chapters`:

```ts
more?: { id: string; title: string; durationLabel: string }[];
```

and render after the chapters list block (mirror its structure):

```tsx
{more && more.length > 0 && (
  <div className="cl-reel-chapters cl-reel-more" role="list" aria-label="Demos for travellers">
    <span className="cl-reel-more-label">Planning it yourself?</span>
    {more.map((m) => (
      <button key={m.id} role="listitem" type="button" className="cl-reel-chapter" onClick={() => onChapter?.(m.id)}>
        {m.title}<i>{m.durationLabel}</i>
      </button>
    ))}
  </div>
)}
```

CSS: `.cl-reel-more-label { display: block; font-size: .6875rem; color: var(--cl-muted); margin: 8px 0 4px; }`

- [ ] **Step 3: App passes it**

On the `<ReelIntro ...>` element (line ~548), add:

```tsx
more={REELS.filter((r) => r.audience === "traveller").map((r) => ({ id: r.id, title: r.title, durationLabel: r.durationLabel }))}
```

(`gotoReel` already handles arbitrary ids — the end-card chaining `ireland → cruise` proves it.)

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm test && VITE_API_BASE="" npm run build:web`
Expected: green + clean build. Then:

```bash
git add web/src/recordings/registry.ts web/src/ReelIntro.tsx web/src/App.tsx web/src/skin-claude.css
git commit -m "feat(reel): intro card lists the DIY traveller reels (audience field)"
```

---

## Out of scope (tracked, not planned here)

- **voygent-lite user-facing source attribution** — item #2 in the 2026-07-09 free-rollout queue lives in the other repo; when it ships, match the demo's "via X" chip wording.
- **Full audience-split funnel** (traveller vs advisor landing experiences) — product design, not a reel-system patch; Task 6 is the minimal reversible step.
- **Actor color tokens** — `--cl-actor-client` teal stays; only labels are overridable.

## Execution notes

- Tasks 1-4 are independent of the advisor-fix session (additive, low-conflict files) and can run now, in order, on `diy-free-reels`.
- Task 5 waits for the merge; Task 6 waits for Neil.
- Suggested worker setup per the repo's delegation rules: one sonnet subagent per task, fresh per task, with the task text verbatim; review diffs between tasks.
