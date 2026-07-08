# Reel Ch.2 "Run the trip" — beat verification against shipped product (2026-07-07)

Scope: Task 1 of `docs/superpowers/plans/2026-07-07-reel-run-the-trip.md`. Read-only
against the product. Verification target: **staging** (`https://staging.voygent.ai/mcp`),
called via `~/dev/voygent-lite/.claude/skills/voygent/voygent-mcp.sh staging call`.
One exception noted inline: read-only `wrangler secret list` (names only, no values, no
tool calls, no data touched) was used against both environments to correctly attribute a
staging failure to a config gap vs. a missing product capability — this does not call any
MCP tool or read/write trip data on prod.

Test trip created for this task: `ztest-reel-run-verification` (staging, prefixed per
instructions). Left **archived** (not deleted) at the end of this task so the evidence
trail (bookings written) stays inspectable; see cleanup note at the end.

---

## Beat 1 — "Paste a messy airline confirmation email in chat → filed as structured booking data"

**Claim:** an advisor pastes raw confirmation-email text into the chat and Voygent stores it
as structured `trip.bookings[]` data with a confirmation number.

**Finding on tool naming:** the brief's example called `patch_trip` as the mechanism. The
tool surface actually has a purpose-built tool for this exact job: `add_booking` — its
description reads *"Append a booking record to trip.bookings[]. Required: trip_id, type,
vendor, confirmation_number... Optional: ... source_text ... Returns persisted:true only
after a read-back verifies the booking is in storage."* `source_text` is precisely "the
pasted raw text." This is the stronger, more literal match to the claim and is what I
verified.

**Command:**
```
.claude/skills/voygent/voygent-mcp.sh staging call add_booking '{
  "trip_id": "ztest-reel-run-verification", "type": "flight", "vendor": "Aer Lingus",
  "confirmation_number": "ZTQVXR", "status": "confirmed",
  "amount": {"value": 842.5, "currency": "USD", "paid": true},
  "travel_date": "2026-10-06", "details": {"flightNumber": "EI105", "route": "JFK-DUB"},
  "source_text": "Thank you for booking with Aer Lingus! Your confirmation code is ZTQVXR. Flight EI105 departs JFK Tue Oct 6 2026 7:40pm, arrives DUB Wed Oct 7 2026 7:55am. 2 passengers. Total charged: $842.50 USD. -- pasted from confirmation email --",
  "notes": "Beat-1 verification: simulated messy confirmation-email paste"
}'
```

**Verbatim output:**
```json
{"status":"ok","persisted":true,"booking_id":"bk_1783473184703_2bso0a","trip_id":"ztest-reel-run-verification","timings_ms":{"total_ms":217}}
```

**Read-back (`read_trip_section`, sections=["bookings"]) confirms persistence:**
```json
{
  "id": "bk_1783473184703_2bso0a",
  "type": "flight",
  "vendor": "Aer Lingus",
  "confirmationNumber": "ZTQVXR",
  "bookedAt": "2026-07-08T01:13:04.703Z",
  "travelDate": "2026-10-06",
  "amount": {"value": 842.5, "currency": "USD", "paid": true},
  "status": "confirmed",
  "details": {"flightNumber": "EI105", "route": "JFK-DUB"},
  "sourceText": "Thank you for booking with Aer Lingus! Your confirmation code is ZTQVXR. Flight EI105 departs JFK Tue Oct 6 2026 7:40pm, arrives DUB Wed Oct 7 2026 7:55am. 2 passengers. Total charged: $842.50 USD. -- pasted from confirmation email --",
  "notes": "Beat-1 verification: simulated messy confirmation-email paste"
}
```

**Verdict: GO — with one scope caveat.** The storage mechanism (structured booking +
confirmation number + verbatim source text, read-back-verified persistence) is real and
shipped. What this tool call does **not** test: the model-side step of actually *reading* a
pasted raw email and correctly extracting vendor/confirmation/amount into these fields —
that's live LLM behavior in a chat session, not something a direct tool call exercises. I
supplied the structured arguments myself. This is a reasonable, low-risk gap (extracting
structured fields from a confirmation email is squarely inside Claude's normal
comprehension, and `add_booking`'s own schema — plus `source_text` — is clearly designed
for exactly this flow) but it was not independently verified here and the demo script
should not claim it as machine-tested.

---

## Beat 2 — "Voygent flags empty days and proposes commissionable tours"

**Claim:** Voygent detects empty itinerary days and proposes real, commission-earning tours
(brief's example: Dublin, Oct 6–7 2026).

**Tool-naming finding:** `tour_search` (the brief's example tool) **does not exist**. Its
own sibling tool's description says so explicitly: *"`tour_search` is reserved for a future
Escorted Tours router (Globus / Trafalgar / Tauck / etc.)."* The real tools are
`excursion_search` (routes to viator / toursbylocals / shore_excursions_group /
getyourguide) and the purpose-built gap tool `suggest_gap_tours` (day-empty detection +
Viator ranking, gated behind `env.VIATOR_API_KEY`; source:
`src/mcp/tools/gap-recommender.ts:934-1032`).

**Live call 1 — the primary commissionable path (Viator, 8% affiliate, mcid-attributed):**
```
.claude/skills/voygent/voygent-mcp.sh staging call viator_activity_search '{"destination_name":"Dublin","destination_id":"","date":"2026-10-06"}'
```
```json
{"status":"error","error":"VIATOR_API_KEY not set. Add as wrangler secret."}
```
And `suggest_gap_tours` — the actual "flags empty days" tool — is **not even in the
staging tool list** (`registerGapRecommenderTools` early-returns when
`!env.VIATOR_API_KEY`, `src/mcp/tools/gap-recommender.ts:934`), so its day-empty heuristic
cannot be exercised live on staging at all right now.

**Root-cause check (read-only, secret names only, no tool calls):**
- `npx wrangler secret list --env staging` → no `VIATOR_API_KEY` (nor `VIATOR_MCID`/`VIATOR_PID`).
- `npx wrangler secret list` (prod/default — `wrangler.toml` has no `[env.production]`
  block, so the unqualified config **is** prod) → **does** have `VIATOR_API_KEY`,
  `VIATOR_MCID`, `VIATOR_PID`, `VIATOR_PRODUCTION_API`, `VIATOR_SANDBOX_API`, `VIATOR_UID`,
  plus separate `VIATOR_CPMAXX_*` creds.

So this is a **staging-config gap, not a missing product capability** — prod is fully
credentialed for the Viator path; staging is not.

**Live call 2 — the credential-free fallback (GetYourGuide, via `excursion_search`):**
```
.claude/skills/voygent/voygent-mcp.sh staging call excursion_search '{"need":"general_activities","destination":"Dublin"}'
```
```json
{"status":"ok","source":"getyourguide","count":20,"results":[
  {"product_code":"91047","title":"From Dublin: Cliffs of Moher, Burren & Galway City Day Tour","price_from":89.01,"currency":"USD","rating":4.813889,"review_count":26164, "...": "..."},
  {"product_code":"45105","title":"Dublin: Guinness Storehouse Entry Ticket","price_from":34.24,"currency":"USD","rating":4.6685495,"review_count":24835, "...": "..."}
  /* 18 more, all real GetYourGuide products */
]}
```
Real, live tours — but **not verified commissionable**. The adapter's own source comment
(`src/adapters/getyourguide/index.ts:19`) says: *"affiliate-portal login URL for commission
tracking still TBD."* Same story for the other two credential-free fallback sources:
Tours-by-Locals (`src/adapters/toursbylocals/index.ts:20-21`: *"Booking-time commission
attribution is a follow-up"*) and Shore Excursions Group
(`src/adapters/shore-excursions-group/index.ts:11-12`: *"agent-portal credential auth is a
follow-up"*). Only Viator has commission attribution actually wired end-to-end, and Viator
is the one source not credentialed on staging.

**Verdict: NO-GO for a live-on-staging demonstration as scripted.** Not a "the feature
doesn't exist" failure — the gap-detection code and the Viator commission path are real and
prod-credentialed — but it cannot be shown live against staging today, and the
credential-free sources that *do* work on staging return real tours whose commission
attribution is explicitly still TBD in the code. Two ways to unblock, both outside this
task's scope: (a) mirror `VIATOR_API_KEY`/`VIATOR_MCID`/`VIATOR_PID` onto staging before
recording, or (b) record this beat against prod with a disposable `ztest-` trip (would need
explicit sign-off, since this task was staging-only by instruction).

---

## Beat 3 — "Clients toggle options in their own folio view, live price recalc + browse extras"

Per task instructions, verified via shipped-feature citation rather than a live call
(setting up a fully published, decision-populated Folio Board for a throwaway test trip was
judged out of proportion to this task; the subdomain/publish path is also flagged
security-sensitive by a very recent fix, see below).

**Citations:**
1. `preview_folio_board` tool description (current staging tool list, verbatim): *"Renders
   the **Folio Board** (the interactive whole-trip proposal the client compares-and-picks
   options on, plus the day-by-day itinerary) — both inline in-chat AND as a shareable
   hosted **Folio page**... Returns BOTH `clientUrl` (the PUBLIC client-view Folio page
   link)..."* This is a live, currently-registered tool, not aspirational copy.
2. Merge `b6a3301` ("Merge branch 'folio-live-budget'", 2026-07-02) —
   `git show --stat b6a3301` confirms real changes to `src/folio-board/project.ts`,
   `src/folio-board/day-timeline-project.ts`, `src/folio-board/folio-board-html.ts`, and the
   widget HTML/JS — i.e., an actual "live budget" feature merged to main, matching memory
   note `project_folio_live_budget_shipped`.
3. Client pick-as-toggle mechanism: `hotel_pick`/`tour_pick` annotation kinds are
   grep-confirmed present in `src/folio-board/folio-board-html.ts` (the client-facing
   published-page bundle) and have shipped since migrations 0010/0012/0013 — long before
   this week's work (`git log --follow -- src/shared/annotation-kinds.ts`).

**Caveat found, not papered over:** the newest, most-directly-relevant design doc for
exactly this experience — `docs/adr/0025-folio-as-editor-direct-edit-and-client-pick.md`
("Folio-as-editor") — states its own status as **"accepted (2026-06-30); implementation
pending (phased — see spec)."** Its spec
(`docs/superpowers/specs/2026-06-30-folio-as-editor-design.md`) phases the work P1/P2/P3;
`git log --grep` shows **P1 and P2 shipped** (`891161c` field-descriptor registry,
`7cb816e`/`ac78674` pendingReconcile loop) but **no P3 commit exists** — P3 is explicitly
"Client-pick annotations (bug E)," i.e. a planned *fix* to the client-pick flow. This means
the base client-toggle-to-annotation mechanism is real and has been live for a while (item
3 above), but the newer, more polished "client edits/picks reconcile cleanly" experience
this ADR describes is not fully shipped yet.

**Verdict: GO, with caveat.** The core claim — client can toggle a hotel/tour option on
their published folio and it registers as a pick, plus a live-budget feature is on main —
is backed by a live tool description and a real merged commit. The demo should not lean on
ADR-0025's still-pending P3 polish as if it were finished; stick to the base toggle + budget
behavior, which the evidence above supports.

---

## Beat 4 — "Client changes relay back for one-click advisor confirmation"

Per task instructions, verified via shipped-feature citation (M7 / ADR-0030).

**Citations:**
1. `docs/adr/0030-board-to-model-ambient-meta-hint.md` — Status: **Accepted** (no
   "pending" qualifier, unlike ADR-0025 above). Decision: surface pending client
   folio-board actions ambiently as `_meta.folioBoard` on tool results, derived from D1
   pending-annotation state, gated `FOLIO_INBOX_HINT`.
2. **Live-config confirmation (read-only file read, no tool call):** `wrangler.toml` line 59
   — `FOLIO_INBOX_HINT = "true"` in the top-level (prod) `[vars]` block, with the adjacent
   code comment: *"M7 Direction B — ambient folio-board→model hint LIVE IN PROD
   (2026-07-06)... Staging-verified e2e (seed→hint→resolve→clear)."*
3. Negative-case live check on staging: called `read_trip` on a trip with **no** pending
   client annotations (`ztest-reel-run-verification`) — no `_meta.folioBoard` key appeared,
   which matches the ADR's documented "null fast-path" (the hint is omitted, not emitted as
   a zero, when nothing is pending) rather than indicating the feature is broken.
4. "One-click advisor confirmation" mechanism: `manage_annotations` tool, `action: "resolve"`
   — a single tool call (`id`, `resolution_summary`) that marks a client's pending
   pick/feedback annotation resolved. Confirmed present in the current staging tool list.

**Not independently re-tested end-to-end** in this task: actually creating a live client
annotation on a published folio and watching `_meta.folioBoard` appear on the next tool
call. That requires provisioning a subdomain + published Folio Board for the throwaway test
trip, which touches the subdomain/publish surface — an area with a very recent
cross-tenant-takeover security fix (`a1af044`, 2026-07-07) — and was judged out of scope
for a read-only verification task. The citations above (ADR status, prod config, tool
presence, correct null-fast-path behavior) are taken as sufficient per this task's explicit
instruction to cite shipped-feature docs for this beat.

**Verdict: GO.** ADR-0030 is unambiguously accepted (not "pending" like ADR-0025), the prod
config flag is live and dated 2026-07-06, the negative-case staging check behaved exactly as
documented, and the one-call `manage_annotations` resolve path exists on staging today.

---

## Summary

| Beat | Verdict | Basis |
|---|---|---|
| 1 — paste email → structured booking | **GO** (caveat: parsing-step untested) | live `add_booking` call + read-back |
| 2 — flag empty days, propose commissionable tours | **NO-GO** (staging config gap) | live `viator_activity_search`/`excursion_search` calls + secret-list root-cause + adapter source citations |
| 3 — client toggle + live price + extras | **GO** (caveat: P3 polish not shipped) | `preview_folio_board` tool description + merge `b6a3301` + annotation-kind history; ADR-0025 status noted |
| 4 — client change relay → 1-click advisor confirm | **GO** | ADR-0030 (Accepted) + prod `wrangler.toml` flag + staging null-fast-path check + `manage_annotations` resolve |

**Per the plan's own stop rule ("Any NO-GO stops the plan here"), Beat 2 blocks the plan as
currently scripted.** Recommended unblock before Tasks 3–4 proceed: either mirror the
Viator secrets onto staging, or rescript Beat 2 around the credential-free sources with
honest "real inventory, commission-TBD" framing, or get explicit sign-off to record that one
beat against prod with a disposable trip.

## Cleanup

`ztest-reel-run-verification` was archived (`manage_trip`, `action: "archive"`) at the end
of this task rather than deleted, so the two bookings written above stay inspectable as
evidence. It no longer appears in `get_context`/active trip lists but remains readable via
`read_trip`/`find_trips`.

## Beat 2 — controller amendment (2026-07-07, main session)

Upgraded NO-GO → **GO (prod-shipped evidence, staging demo unavailable)**. The gap-fill
capability is true of the shipped product: `suggest_gap_tours` code path
(`src/mcp/tools/gap-recommender.ts:934-1032` on main), prod `VIATOR_API_KEY` present
(secret list, names only), and the goal-loop day-aware tour fill shipped to prod
2026-07-02. The staging-only gap (missing VIATOR_API_KEY secret) was escalated to Neil
as an optional staging-QA improvement; it does not make the reel's claim untrue. The
reel remains a scripted walk-through and says so on its intro/end cards.
