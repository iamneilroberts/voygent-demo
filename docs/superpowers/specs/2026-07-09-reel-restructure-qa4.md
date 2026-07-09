# Reel restructure + QA round 4 (Neil, 2026-07-09)

Neil's 17-item feedback batch on the live demo (demo-design lane). Source of truth for
this session. Everything ships on the `demo-design` branch and deploys to demo.voygent.ai.

## W0 — Chrome permission popup (root-caused)

The live bundle (`index-ktJiasYk.js`) contains `const Et="http://localhost:8787"` — it was
built WITHOUT `VITE_API_BASE=""`, so `/presets` + `/stats` + session checks hit
`http://localhost:8787` from the public page. Chrome 138+ shows the Local Network Access
prompt ("wants to access other apps and services on this device") for public→local
requests. That's the popup. It also means live mode is broken on the current deploy.

Fix: `API_BASE` fallback becomes `import.meta.env.DEV ? "http://localhost:8787" : ""` so
a prod build can never bake localhost, and this deploy (built correctly) fixes the popup.

## W1 — Pacing + controls

- Default speed **1×**, default mode **Read** (holds every callout for Continue).
- Speed/Read choice **sticky** via localStorage (`voygent-reel-speed`: "1"|"2"|"read") —
  survives the chapter-hop reload (gotoReel), fixing "defaulted back to 2x for chapter 2".
- Pacing rebalance (pacing.ts): faster through no-output beats (TOOL_BEAT 700→450,
  TURN_BEAT 500→350), slower where there's content to absorb (MS_PER_CHAR 16→22,
  TEXT_MAX 2500→3600, BOARD_DWELL 2600→3600, FOLIO_DWELL 1800→2600).
- Reel tool chips: suppress the live elapsed counter + "Still working" line in reel mode
  (a Read-mode hold made a scripted chip read "Working… 163s").
- **Orientation callout** at the start of ch1: hero-variant spotlight on the controls
  cluster ("You control the pace…") explaining Read/1×/2×, scrubbing, chapters.
- **Controls + chapter nav together**: ReelBreadcrumb moves into the same fixed top-right
  cluster as the transport controls, labeled "3 short demos", so navigation lives in one
  spot and persists identically across chapters.

## W3 — Chapter restructure (the big one)

New arc (plain-language titles; ids keep back-compat aliases):

1. **`plan` — "1 · Plan the trip"** (advisor + Voygent, ends on advisor folio + commission)
   - Acts: intake → flights (traveller… advisor picks) → hotel shortlist → itinerary
     (day 3 open) → eng-panel peek WITH simulated-but-realistic telemetry (W4) →
     **gap-fill moved here from old ch2**: Voygent flags open day 3, tour board, advisor
     picks Cliffs of Moher day trip (+$43 comm) → advisor in-place edit (day 4: cliff
     path → village & harbour walk, step-free) + note → includes chooser → **projected
     commission itemized** on the advisor folio (potential rows; hotel = "their pick of 3")
     → send to client (handoff notice).
   - NO client-window beats (cutaway + traveller window move to ch2).
   - End card interstitial (Neil's copy): "The travellers get a link to a live detailed
     portfolio with the advisor's recommendations and transparent pricing. They can try
     the alternatives, get more details by clicking an item, or ask a question that is
     instantly routed back to the advisor." Primary CTA: "Next: what the client sees →".

2. **`client` — "2 · The client's view"** (all client, no advisor surfaces)
   - Opens on the inbox scene: email notification callout → they open it → folio window
     with an **advisor message banner** at the top ("From your advisor: pick your hotel
     and tell me what you think — no rush.").
   - Explore: days, day detail, good-to-know, tour drill-down (kept from old ch3).
   - **Make the interactivity explicit** (image 9): scripted hotel flips
     (Dean → Beckett Locke → Dean) and add-on toggles with the total animating; callout
     copy says exactly "click around — every choice reprices the trip instantly".
   - Ends: note typed ("food tour like the one in Lisbon") → Send feedback → sent
     confirmation → end card interstitial: "Next: back at the advisor's desk →".

3. **`advisor` — "3 · Book the trip"** (advisor POV only; no client windows)
   - Opens: notification in the chat — the Millers replied (their picks + their note).
   - Voygent incorporates: Dean locked, transfers added, Temple Bar food tour on the
     last evening. Spotlight "The note becomes the plan."
   - Narration: the advisor books the flight; the airline's **messy confirmation email
     is shown as an email window** (sloppy, monospace, DO-NOT-REPLY), then pasted into
     the chat → `add_booking` → folio shows CONFIRMED row with **minor corrections from
     the actual booking** (departure time moved 15 min; conf number filed).
   - **Booked commission itemized** (existing N12 machinery) — commission lives here
     (and as projection at end of ch1), never mid-ch2.
   - End card: **prominent CTA** — big primary "Build your own trip →", secondary
     replay/chapter links (image 17 fix: no more corner-box CTA on the folio surface).

All three chapters end on ReelEndCard interstitials (consistent transition + the nav
cluster stays put). Old ids `collab`/`run` alias to `plan`/`advisor` in pickReel.

## W4 — Eng panel telemetry + alignment

- ReelEngPanel gains a metrics block (simulated, realistic, labeled honestly):
  tokens in/out, cached %, cost, model, "saved by caching". Footnote: representative
  numbers; live metrics in the interactive demo.
- Fix the spotlight ring misalignment on the sliding panel: ReelCallout re-measures
  during the panel's entrance animation (rAF loop ~800ms after mount).

## W2 — Scroll / static-screen fixes

- Follow-scroll: a multi-select board with a reelView selection no longer counts as
  "pending" (it kept the board pinned while the folio landed below the fold — images 5/16).
- Missing-target callouts: lighter dim (screen stays readable) instead of the full-gray
  wall (image 14).
- Post-interaction dwell beats hold with content in view via the pinned follow-scroll
  (fix above) — no more long static screens where the action is off-screen.

## Tests

Screenplay grounding tests rewritten per chapter; registry/guard tests updated for the
new ids/titles/arc. Full `npm test` + `VITE_API_BASE="" npm run build:web` green before
deploy.
