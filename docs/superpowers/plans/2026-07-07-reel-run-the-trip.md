# Reel Chapter 2 "Run the trip" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second demo reel ("Run the trip": confirmation paste → gap fill → client's window → relay) and sharpen three chapter-1 callouts, deep-linkable as `?reel=run` / `?reel=collab` from the voygent.ai advisor landing.

**Architecture:** The reel system is data-driven: a screenplay file (`web/src/lib/screenplay.ts` DSL) produces `{recording, highlights}`, registered in `web/src/recordings/registry.ts` (`REELS[]`); `pickReel` already resolves `?reel=<id>` deep links, and the reel is already public (App.tsx:62 — auth only gates live mode). New work = one new screenplay + fixtures, a `bookings` extension to `FolioData`, a `tour` board kind, registry entry, and three spotlight rewordings in `dublin-collab.screenplay.ts`.

**Tech Stack:** React + TypeScript (Vite build), vitest, Cloudflare Worker deploy (`VITE_API_BASE="" npm run build:web && npx wrangler deploy`).

**Spec:** `~/dev/voygent-lite/docs/superpowers/specs/2026-07-07-advisor-landing-demo-arc-design.md`

## Global Constraints

- **Honesty framing:** chapter 2 is an AUTHORED fixture like `collab`; its `intro.note` and `endCard.blurb` must say so ("scripted walk-through of the workflow"), matching the collab precedent in `registry.ts:40-48`.
- **Copy voice:** plain sentences, **no em-dashes** (`feedback-demo-copy-voice-no-em-dash`), no protocol vocabulary in reel copy or callouts.
- **Fixture realism:** supplier boilerplate, tour names and prices must be plausible for Dublin in October; commission figures use the same 10-15% shape as existing fixtures.
- **Reel ids are wire contracts with the landing:** chapter 1 = `collab` (exists), chapter 2 = `run` (this plan). The voygent-lite landing links `demo.voygent.ai/?reel=collab` and `?reel=run`.
- **Verification before demo claims (spec §4):** every ch. 2 beat must be verified against the shipped product on STAGING before the reel deploys (Task 1). If a beat can't be verified, STOP and surface to Neil rather than shipping the claim.
- Work in an isolated worktree/branch (`git worktree add ../voygent-demo-reel-run -b reel-run`); stage files by name.

---

### Task 1: Verify chapter-2 beats against the real product (staging)

**Files:**
- Create: `docs/summaries/2026-07-07-reel-run-verification.md` (evidence notes)

**Interfaces:**
- Produces: a written GO/NO-GO per beat that Tasks 3-4 depend on.

- [ ] **Step 1: Verify each beat with real staging calls (from ~/dev/voygent-lite)**

```bash
cd ~/dev/voygent-lite
# Beat 2 (gap fill): tour search returns real commissionable Dublin tours
.claude/skills/voygent/voygent-mcp.sh staging call tour_search '{"destination":"Dublin","start_date":"2026-10-06","end_date":"2026-10-07"}'
# Beat 1 (confirmation paste): patch_trip accepts a structured booking update on a test trip
.claude/skills/voygent/voygent-mcp.sh staging call get_context '{}'   # find/seed a test trip first; use an existing staging test trip, never Kim's
```

For beat 1 the claim is "paste in chat and the model files it via patch_trip": verify `patch_trip` accepts a bookings/flights update with a confirmation number on a staging test trip. For beat 3 (client window: hotel toggle, live price recalc, extras, note) cite the shipped client-view features (traveler picks + live price already demoed in ch. 1 act 9). For beat 4 (relay) cite M7 folio-board→model hint (ADR-0030, shipped 2026-07-06).

- [ ] **Step 2: Write the verification note**

`docs/summaries/2026-07-07-reel-run-verification.md`: one line per beat: the claim, the staging call or shipped-feature citation, verbatim key output, GO/NO-GO. Any NO-GO stops the plan here.

- [ ] **Step 3: Commit**

```bash
git add docs/summaries/2026-07-07-reel-run-verification.md
git commit -m "docs: verify run-the-trip reel beats against staging product"
```

---

### Task 2: `bookings` on FolioData + FolioPanel render + `tour` board kind

**Files:**
- Modify: `shared/events.ts` (FolioData, ~line 25; board-kind union if declared here)
- Modify: `web/src/lib/screenplay.ts:35` (board kind union)
- Modify: `web/src/BoardView.tsx:46-47,135` (tour wording)
- Modify: `web/src/FolioPanel.tsx` (bookings section)
- Test: `web/src/recordings/registry.test.ts` (type-level compile) + new assertions in Task 3's screenplay test

**Interfaces:**
- Produces:
  ```ts
  export interface FolioBooking { label: string; conf: string; detail?: string; status?: "confirmed" | "pending"; }
  // FolioData gains: bookings?: FolioBooking[];
  // board() kind union gains "tour": (kind: "flight" | "hotel" | "includes" | "tour", ...)
  ```
- Consumes: existing FolioPanel section markup pattern (mirror how `includes` renders).

- [ ] **Step 1: Write the failing type/render test**

Append to a new `web/src/folio-bookings.test.tsx` (mirror the render-test style used by existing component tests; if none exists for FolioPanel, a pure type + render smoke test):

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";   // already a devDep if other component tests use it; else assert via ReactDOMServer.renderToStaticMarkup
import { FolioPanel } from "./FolioPanel";
import type { FolioData } from "../../shared/events";

describe("folio bookings section", () => {
  it("renders confirmed bookings with conf numbers", () => {
    const folio: FolioData = {
      title: "A week in Dublin", flights: [], hotels: [],
      bookings: [{ label: "Aer Lingus EI 106 · MOB→DUB", conf: "6XKPTR", status: "confirmed" }],
    };
    const html = render(<FolioPanel folio={folio} />).container.innerHTML;   // match FolioPanel's actual prop signature; adjust import of render if the repo uses renderToStaticMarkup
    expect(html).toContain("6XKPTR");
    expect(html).toContain("Aer Lingus EI 106");
  });
});
```

(Before writing, check FolioPanel's actual props with a quick read; keep the assertion, adapt the harness.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/folio-bookings.test.tsx`
Expected: FAIL (`bookings` not on FolioData / nothing rendered).

- [ ] **Step 3: Implement**

In `shared/events.ts`, after the FolioInclude interface:

```ts
export interface FolioBooking {
  label: string;             // "Aer Lingus EI 106 · MOB→DUB"
  conf: string;              // supplier confirmation number
  detail?: string;           // "Oct 4 · 8:55p JFK→DUB · 2 adults · $3,180"
  status?: "confirmed" | "pending";
}
```

and add `bookings?: FolioBooking[];` to `FolioData`. In `FolioPanel.tsx`, add a "Confirmed" section rendered when `folio.bookings?.length`, mirroring the includes-section markup (same heading/list classes), each row: label, detail line, and a mono-styled conf chip. In `screenplay.ts:35` and `BoardView.tsx`, extend the kind union with `"tour"`; BoardView wording: title branch `board.kind === "tour" ? "Choose a tour" : ...`, confirm label `"Add this tour →"`, `kindWord` `"tour"`.

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `npx vitest run web/src/folio-bookings.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/events.ts web/src/FolioPanel.tsx web/src/lib/screenplay.ts web/src/BoardView.tsx web/src/folio-bookings.test.tsx
git commit -m "feat(folio): bookings section + tour board kind for run-the-trip reel"
```

---

### Task 3: The `dublin-run` screenplay

**Files:**
- Create: `web/src/recordings/dublin-run.screenplay.ts`
- Test: `web/src/recordings/dublin-run.screenplay.test.ts` (mirror `dublin-collab.screenplay.test.ts` structure)

**Interfaces:**
- Consumes: `screenplay()` DSL (`says/tool/board/folio/picks/view/sendsToClient/spotlight`), Task 2's `FolioBooking` + `"tour"` kind, and dublin-collab's `finalFolio` shape as the starting state (re-declare the needed fixture data locally; do NOT import from dublin-collab, screenplays stay self-contained).
- Produces: `export const dublinRun: { recording: Recording; highlights: Highlight[] }` for Task 4's registry entry.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { dublinRun } from "./dublin-run.screenplay";

describe("dublin-run screenplay", () => {
  it("produces frames and highlights", () => {
    expect(dublinRun.recording.frames.length).toBeGreaterThan(10);
    expect(dublinRun.highlights.length).toBeGreaterThanOrEqual(4);
  });
  it("files the pasted confirmation into folio bookings", () => {
    const folioFrames = dublinRun.recording.frames.filter((f: any) => f.event?.type === "folio");
    const withBookings = folioFrames.filter((f: any) => (f.event.folio.bookings ?? []).length > 0);
    expect(withBookings.length).toBeGreaterThan(0);
    expect(JSON.stringify(withBookings[0])).toContain("6XKPTR");
  });
  it("offers tours on a tour board and the advisor picks one", () => {
    expect(dublinRun.recording.frames.some((f: any) => f.event?.type === "board" && f.event.kind === "tour")).toBe(true);
  });
});
```

(Adjust frame/event property access to match `lib/recording.ts` types — mirror how `dublin-collab.screenplay.test.ts` reaches into frames.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/recordings/dublin-run.screenplay.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the screenplay**

`dublin-run.screenplay.ts` — full structure (fixture values are final copy, use as written):

```ts
import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioBooking } from "../../../shared/events";

// "Dublin · run the trip" (chapter 2). The trip from chapter 1 is sold; this reel is the
// week after: a confirmation email gets pasted and filed, Voygent flags two open days and
// sells a tour into them, the travellers make a change in their own window, and the
// advisor confirms it with one click. AUTHORED fixture; intro/end card say so.

// The folio as chapter 1 left it (re-declared locally; keep values matching dublin-collab's finalFolio).
const soldFolio: FolioData = { /* title "A week in Dublin", the Aer Lingus flight, The Dean hotel,
  the six days incl. Cliffs of Moher on day 3 + Temple Bar food tour on day 5, the four includes
  — copy the literal values from dublin-collab.screenplay.ts finalFolio */ } as FolioData;

// Beat 1 fixture: the messy confirmation email (pasted verbatim by the advisor).
const CONF_EMAIL = `FW: Your booking is confirmed - EI 106 04OCT
*** DO NOT REPLY TO THIS EMAIL ***
BOOKING REF: 6XKPTR   TICKET: 053-4471182286
PASSENGER/S: HENDERSON/MARK MR  HENDERSON/JULIE MRS
EI 106 J 04OCT JFKDUB HK2 2055 0835+1 /E
FARE USD 3180.00 TOTAL INC TAXES/FEES
Baggage allowance 1PC per passenger. Check-in opens 24hrs before departure.`;

const filedBooking: FolioBooking = {
  label: "Aer Lingus EI 106 · JFK→DUB",
  conf: "6XKPTR",
  detail: "Oct 4 · 8:55p → 8:35a +1 · Mark & Julie Henderson · $3,180 incl. taxes",
  status: "confirmed",
};
const withBooking: FolioData = { ...soldFolio, bookings: [filedBooking] };

// Beat 2 fixture: three commissionable tours for the open days (4 and 6).
const tours: BoardCandidate[] = [
  { id: "tour:kilmainham", title: "Kilmainham Gaol & Museum tour", price: "$58 pp", badge: "Sells out",
    meta: "Day 4 · 2h 30m · small group", summary: "Kilmainham Gaol $58", commission: 17, commissionPct: 15 },
  { id: "tour:wicklow", title: "Wicklow Mountains & Glendalough day trip", price: "$142 pp", badge: "Best fit",
    meta: "Day 6 · 8h · coach + walk", summary: "Wicklow day trip $142", commission: 43, commissionPct: 15 },
  { id: "tour:whiskey", title: "Dublin whiskey tasting walk", price: "$95 pp",
    meta: "Day 4 evening · 3h", summary: "Whiskey walk $95", commission: 24, commissionPct: 12 },
];
const withTour: FolioData = { ...withBooking, days: /* day 6 gains "Wicklow Mountains & Glendalough day trip" activity */ };

// Beat 3 fixture: the travellers' window snapshots (mirror the ReelClientSession shape used in
// dublin-collab's cvHotels/client-view section: extras list with the whiskey walk toggled on,
// total recalc, and a note "Can we do the whiskey walk the same night we land back from Wicklow?").

export const dublinRun = screenplay({ trip: "Dublin · run", skin: "claude" }, (s) => {
  // Beat 1: the paste
  s.advisor.says(CONF_EMAIL);
  s.agent.says("That's the Hendersons' flight confirmation. Filing it.");
  s.agent.tool("patch_trip", { summary: "bookings + EI 106 · conf 6XKPTR" });
  s.agent.folio(withBooking);
  s.spotlight({ eventType: "folio", nth: 1 }, { target: "folio-bookings", eyebrow: "Paste it, it's filed",
    title: "The confirmation reads itself", body: "The advisor pastes the airline email exactly as it arrived. The confirmation number, times and total land in the right places in the proposal. Nothing retyped." });

  // Beat 2: the gap
  s.agent.says("Two days are still open, day 4 and day 6. Here are three tours that fit the pace and the season.");
  s.agent.board("tour", "b-tours", tours);
  s.advisor.picks("b-tours", "tour:wicklow", "Wicklow day trip on day 6.", withTour);
  s.agent.says("Added. Day 6 is the Wicklow Mountains and Glendalough trip, $142 a person, $43 commission per traveller.");
  s.spotlight({ interactionKind: "pick", nth: 1 }, { target: "board-tour", eyebrow: "Empty days are money",
    title: "Voygent notices first", body: "Open days in a sold trip are unsold inventory. Voygent flags them and pulls real, commissionable tours that fit. The advisor clicks one and it is in the plan." });

  // Beat 3: the travellers' window (s.client.view snapshots: browse extras, toggle whiskey walk,
  //   price recalcs, leave the note; mirror the dublin-collab act-9 pattern)
  // Beat 4: the relay
  s.agent.says("The Hendersons added the whiskey tasting walk and asked to do it the evening they return from Wicklow. Day 6 works. Confirm?");
  s.advisor.says("Confirm it.");
  s.agent.tool("patch_trip", { summary: "day 6 evening + whiskey walk" });
  s.agent.folio(/* final folio: day 6 evening gains the whiskey walk */);
  s.spotlight({ interactionKind: "clientview", nth: 1 }, { target: "client-view", eyebrow: "You didn't sell that tour",
    title: "The folio did", body: "The travellers browsed the extras on their own, added one, and left a note. It came back as a one-click confirmation, not a phone call." });
});
```

Fill the elided fixture values (soldFolio literals, day mutations, client-session snapshots) by copying the corresponding literal structures from `dublin-collab.screenplay.ts` (same file, lines 103-152) and applying the described changes. Every value above that is spelled out (email text, conf number, tour names/prices/commissions, spotlight copy) is final.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run web/src/recordings/dublin-run.screenplay.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/recordings/dublin-run.screenplay.ts web/src/recordings/dublin-run.screenplay.test.ts
git commit -m "feat(reel): dublin-run chapter 2 screenplay (paste, gap fill, client window, relay)"
```

---

### Task 4: Registry entry + chapter framing + ch1 spotlight sharpening

**Files:**
- Modify: `web/src/recordings/registry.ts` (REELS array)
- Modify: `web/src/recordings/dublin-collab.screenplay.ts` (3 spotlight bodies: lines ~204, ~211, ~219)
- Test: `web/src/recordings/registry.test.ts`

**Interfaces:**
- Consumes: `dublinRun` from Task 3.
- Produces: reel id `run` resolvable via `?reel=run` (wire contract with the landing).

- [ ] **Step 1: Write the failing registry test**

Append to `registry.test.ts`:

```ts
it("resolves ?reel=run to the run-the-trip chapter", () => {
  const hit = pickReel(REELS, "run", 0);
  expect(hit.id).toBe("run");
  expect(hit.title).toContain("Run the trip");
});
```

- [ ] **Step 2: Run to verify it fails**  — `npx vitest run web/src/recordings/registry.test.ts` → FAIL.

- [ ] **Step 3: Add the registry entry**

```ts
{
  id: "run",
  title: "Chapter 2 · Run the trip",
  blurb: "The trip is sold. Watch a confirmation file itself, two empty days become a tour sale, and the travellers shape their own week.",
  durationLabel: "~2 min",
  recording: dublinRun.recording,
  highlights: dublinRun.highlights,
  recap: ["📋 pasted confirmation, filed", "🗓 two open days → a $142 tour", "💷 client adds an extra, price updates", "✓ one-click confirm"],
  intro: { eyebrow: "▶ Chapter 2", note: "This walk-through is scripted, like chapter 1. A real Voygent run files real confirmations and sells real tours." },
  endCard: { eyebrow: "✓ The week after", title: "Hours of admin. Zero typing.",
    blurb: "A pasted email became a filed confirmation. Two empty days became a commissionable tour. The travellers added an extra themselves. The advisor clicked twice. The collaboration here is a scripted walk-through of the workflow." },
},
```

Also retitle the collab entry `title` to `Chapter 1 · A trip, built together` so the intro cards read as chapters.

- [ ] **Step 4: Sharpen the three ch1 spotlights (edit bodies in place, keep targets/matchers)**

- Line ~204 (eng-panel): body → `"Behind the chat, Voygent is calling real search tools in order. Six real fares came back from a live search. Every price on the board has a source, not a guess."`
- Line ~211 (edit): body → `"The advisor just retyped the line, the way you'd fix a document. No prompt, no paragraph. The change is marked as hers and the rest of the week stays put."`
- Line ~219 (includes): body → `"Weather, getting around, tipping, handy apps. The advisor typed none of it. She just chose which of the ready-written extras are worth sending."`

- [ ] **Step 5: Run all recordings tests + typecheck**

Run: `npx vitest run web/src/recordings/ && npx tsc --noEmit`
Expected: PASS (collab screenplay tests still green after body edits — they assert structure, not copy; if a copy assertion fails, update it to the new body text).

- [ ] **Step 6: Commit**

```bash
git add web/src/recordings/registry.ts web/src/recordings/registry.test.ts web/src/recordings/dublin-collab.screenplay.ts
git commit -m "feat(reel): register chapter 2 (?reel=run) + chapter framing + sharpened ch1 callouts"
```

---

### Task 5: Build, deploy, smoke

- [ ] **Step 1: Full suite** — `npm run test && npx tsc --noEmit` → PASS.

- [ ] **Step 2: Local visual pass** — run the web dev server, open `/?reel=run`, watch the full chapter: paste beat shows the email as an advisor message, folio grows a Confirmed section, tour board renders with commission, client window toggles, end card reads right. Check `/?reel=collab` still plays and shows the three sharpened callouts.

- [ ] **Step 3: Deploy** — `VITE_API_BASE="" npm run build:web && npx wrangler deploy` (asset-only unless shared/events changed the worker too; it doesn't, it's web-side types). Smoke: open `https://demo.voygent.ai/?reel=run` and `?reel=collab` in a browser (Neil confirms visually; no headless Chrome in this env).

- [ ] **Step 4: Close the loop** — tell the voygent-lite landing lane that `?reel=run` is live (its `#run` CTA + hero CTA contract), and update the worktree journal.
