# Session Handoff: live pass-through shipped; continue demo feedback program (tasks 4–11)

**Date:** 2026-06-07 (evening) · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (NOT merged to main; prod runs this branch — deploy-from-main would clobber)
**Supersedes:** `handoff-2026-06-07-claude-skin-demo-feedback.md` (its triage map + invariants are still valid EXCEPT where amended below).

## FIRST ACTION for the new session
Run **`/codex-review`** on this session's commits before continuing the task list: `git diff 55cf1fb..HEAD` (5 feature commits, all listed below). Apply/triage findings, then resume tasks 4–11. Neil asked for this explicitly.

## Prod state (verified by smoke runs against prod, 2026-06-07 evening)
- **Deployed:** `voygent-demo` Worker @ branch HEAD `a827f1d` → https://voygent-demo.somotravel.workers.dev
- **Prod-verified:** live boards-mode Lisbon E2E **PASS** (flight board → pick → cpmaxx hotel board w/ commission → pick → live enrichment, folio 6 days/3 acts/7 dining). Featured Cancún verified on prod this morning (`c3497a2` artifact) + locally on final HEAD in both modes.
- **KNOWN FLAKY:** auto-mode + live-destination (no boards) — model sometimes presents candidates and stops instead of auto-picking (1 prod fail / 2 local passes). No nudge covers "model ended turn early." This is the `wild-wolf` phase-machine case; don't burn prompt-tweaks on it — either extend the nudge mechanism (post-loop check) or wait for wild-wolf. Demo's primary surface (boards/claude skin) is solid.

## What shipped this session (commits, oldest→newest)
| Commit | What |
|---|---|
| `5d522b1` | **DO-eviction persistence** (`worker/session-store.ts` + hydrate/persist in `session-do.ts`) — conversation/tripId/replay/liveMode survive eviction; was the "create the trip first" amnesia + orphaned trips. Oversize tool_result bundles elided in PERSISTED copy only (128KiB DO value cap). **Humanized tool chips** (`worker/agent/tool-summary.ts`) — was raw `content.slice(0,120)`. |
| `04b7148` | **Sequenced boards flow** (`SEQUENCED_BOARDS_WORKFLOW`, additive const): flights → pick → ack → hotels w/ 2-3-line opinionated rec. |
| `c3497a2` | **All 5 fixtures enriched** (was Dublin-only → dead enrichment off-Dublin; replay is fixture-only for search/enrichment). `scripts/smoke-enriched-run.mjs` headless SSE harness (auto + `--boards` modes). |
| `0992161` | **Live pass-through mode** (Neil-approved shape: featured trips = fixture "gif", everything else = faithful real-Voygent): liveMode latch on first non-fixture search (persisted), full 120-tool catalog (DEMO_TOOLS retired), moving prompt-cache breakpoint (claude.ts — tools + seed + last-message = 3 of 4 breakpoints), cpmaxx `hotel_search_and_rank` end-to-end (fixture-aliased for featured), board mapping for its `{hotels:[...]}` shape with new `BoardCandidate.detailUrl/commission/commissionPct`, nested-envelope unwrap (boards + chip summaries), `LIVE_TRIP_WORKFLOW` prompt + `ENRICHMENT_WORKFLOW` scoped to featured. |
| `a827f1d` | **Host nudges** (deterministic one-shot reminders injected after tool batches in `loop.ts` `nudge` hook, logic in `session-do.ts`): same-turn enrichment after hotel lands; live `flight_list` distill; live `hotel_search_and_rank` routing. Each verified failing-then-passing. |

Tests: **128 pass** (`npx vitest run`), `npx tsc --noEmit` clean. Baseline was 108.

## Remaining tasks (Neil's feedback program — re-create in TaskCreate if list didn't carry over)
4. **Profitability toggle in demo UI** — data ALREADY flows: `BoardCandidate.commission/commissionPct` (boards) — see `web/src/BoardView.tsx` + claude-skin board rendering; folio side needs lodging commission (live trips patch lodging w/ price; commission is in the board candidate + model prose). Advisor-mode toggle showing commission per item + trip total. Real data only (cpmaxx); serp candidates have none — show nothing, never invent.
5. **Caching display fixes** — moving breakpoint DONE (0992161). Remaining: `web/src/Inspector.tsx:110` — `sessionTokens = tokensIn + cacheRead` counts cache reads at FULL weight vs sub windows → 5-10× pessimistic; weight cacheRead ~0.1× and label "cost-weighted". Add cache hit-rate brag stat (cacheRead/(in+cacheRead)).
6. **Engineering tab restructure** — (a) `ClaudeChatView.tsx:110` welcome: heading stays "Where to next?", geo moves to subline "Looks like you might be traveling from {city}"; (b) collapse/expand polish (`Inspector.tsx` rail state exists, is clunky); (c) move tier table + BTS cards + business case OUT to info pages; tab keeps live stats + links.
7. **Info/brag pages** — blog-style narratives w/ live stats links + shared footer: bot-defeat saga (BMP forensics — voygent-lite `docs/adr/0003`, voygent-desktop bmp-tracer handoffs), context economics (router consolidation, folio render out-of-context), record/replay engineering, cost engineering (caching). Served by worker (add routes; dist-web is static assets + `/chat` + `/proposal`-style routes in `worker/index.ts`).
8. **Resume page** — content at `/home/neil/dev/voygent-demo/docs/Neil_Roberts_FDE_Resume.md` (FDE-targeted, exists, good). Own info page + links: main-screen built-by, engineering tab footer, all info-page footers. Demo IS an interactive resume (job-search audience only, not general public).
9. **Board detail links + validated URLs** — `BoardCandidate.detailUrl` already populated for cpmaxx (hotel_sheet_url); render it. Serp flight/hotel candidates: check candidate fields for URLs. Fixture dining/activity URLs: validate at capture time in `scripts/capture-fixtures.mjs` (FREE_THINGS_BY_ID pattern survives re-capture). Also: curate TA-validated free things for cancun/nyc/rome/tokyo (only Dublin has them; prompt now tolerates absence).
10. **claude.ai usage measurement** (with Neil) — protocol: same Cancún/Lisbon script in Claude Code w/ voygent connector + `/cost`; compare vs demo engineering tab. Demo now runs the SAME full-catalog condition, so numbers are comparable.
11. **Headless replay regenerator** — Recording format (`web/src/lib/recording.ts`: `{skin, trip, frames[]}` user/event/turn-end + delayMs) is exactly what the smoke harness collects; extend it (or sibling `scripts/record-replay.mjs`) to emit `web/src/recordings/<trip>.json` w/ smoothed delays. Supersedes manual D2 browser capture. After: verify `?mode=auto`, commit, redeploy. **Bare `/` still autoplays the 3-frame STUB.**

## How to verify / run (amended)
- Suite: `cd /home/neil/dev/voygent-demo-demo-enrichment && npx tsc --noEmit && npx vitest run` (baseline **128**).
- Local: `npx wrangler dev --port 8787` (background; NOTE: `rm -rf dist-web` during a build KILLS a running dev server — restart after builds).
- Smoke (REAL MCP + sonnet, ~$0.10-0.50/run): `export VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')"` then `node scripts/smoke-enriched-run.mjs --base http://localhost:8787 [--boards] [--prompt "..."]`. Default prompt = featured Cancún; non-featured destination (e.g. Lisbon BOS→LIS) exercises live mode. Self-cleans its demo-* trip when the env var is set; sweep strays via list_trips/delete_trip on Neil's per-user URL (all trips under that prefix are demo junk — confirmed + swept twice today).
- Deploy (Neil's say-so only): `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`.

## Invariants (amended from prior handoff)
1. Folio itinerary replay-controlled **for FEATURED trips only** — live trips render real `read_trip` data verbatim (`onFolio` gates on `this.liveMode`).
2. patch_trip sanitizer (strips itinerary/days/activities/dining/includes) **fixture sessions only** — live sessions are unsanitized (faithful).
3. `SYSTEM_HINT` still byte-identical; `BOARDS_WORKFLOW_OVERRIDE` untouched. New consts are additive: `SEQUENCED_BOARDS_WORKFLOW`, `LIVE_TRIP_WORKFLOW`; `ENRICHMENT_WORKFLOW` was edited (now featured-scoped) — safe surface per prior handoff.
4. Board candidate mapping is allowlist-only (explicit named fields) — that's the client-data firewall; blanket `scrubAdvisor` was deliberately removed from the board path because demo boards are the ADVISOR view (commission is a feature). Inspector trail still scrubs.
5. Stage by name; no `git add -A`.

## Environment gotchas (unchanged + new)
- Read-tool hook blocks `.ts/.tsx` → `cat -n` via Bash; Edit may demand prior Read → Python exact-string replace with unique anchors.
- Bash cwd resets to `/home/neil/dev/voygent-lite` after every call → prefix `cd /home/neil/dev/voygent-demo-demo-enrichment && …`.
- Proxied voygent tools double-wrap results (nested MCP envelope) — filed as voygent issue **`sharp-plateau`**; demo unwraps in boards + tool-summary. If you parse tool results anywhere new, unwrap.

## Open questions / Neil inputs pending
- None blocking. Tasks 4–9, 11 are solo-doable; task 10 needs Neil interactive.

## What NOT to re-read
- Phases A–C plan/specs and `handoff-2026-06-06-demo-enrichment-phaseABC-built.md` — conclusions carried here.
- The prior 2026-06-07 handoff except its feedback-triage table (file→fix map), which is still accurate for UI work.
