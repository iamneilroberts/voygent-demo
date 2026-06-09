# Session Handoff: codex-review fixes + tasks 4–11 shipped & deployed

**Date:** 2026-06-07 (late) · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (NOT merged to main; prod runs this branch — deploy-from-main clobbers)
**Supersedes:** `handoff-2026-06-07-live-passthrough-shipped.md` (its tasks 4–11 are now DONE; invariants + smoke recipes there still valid).

## ⚠️ FIRST: the public demo is currently out of Anthropic API credits
Both post-deploy smokes failed with `Anthropic HTTP 400: "Your credit balance is too low to access the Anthropic API."` This is **not a code regression** — the demo's `ANTHROPIC_API_KEY` account ran dry (this session's recording capture + smoke runs drained it). **Every `/chat` will 400 until Neil tops up credits** at the Anthropic console. The static surface (site, info pages, presets) is fine; only the agent loop is down. After topping up: `node scripts/smoke-enriched-run.mjs --base https://voygent-demo.somotravel.workers.dev --boards` (set `VOYGENT_CAPTURE_MCP_URL` first) should PASS — the pre-credit-wall smoke on the prior version did.

## Prod state
- **Deployed:** `voygent-demo` Worker version `1bb20715-8a2c-4537-a477-a42b4f4bdf0c` @ branch HEAD `2a91dcc` → https://voygent-demo.somotravel.workers.dev
- **Verified (HTTP layer, post-deploy):** `/` 200 · `/presets` 200 · `/info/{bot-defeat,cost-engineering,resume}` 200 · `/info/nope` → 302 to `/`.
- **NOT live-verified:** the agent loop on this exact version (both smokes hit the credit wall). The agent-touching changes are minimal + unit-tested; board emission path (`worker/agent/boards.ts`) is unchanged from the codex-fix version, which smoke-PASSED.
- **Rollback:** `npx wrangler rollback <id>` to `a59c5095` (codex-fix version, commit `7630e67`) — but no reason to; the deploy is sound.

## What shipped this session (oldest→newest), all on `demo-enrichment`
| Commit | What |
|---|---|
| `9334353` | **codex-review fixes** (range 55cf1fb..a827f1d). `shrinkForStorage` crashed on nudge `{type:"text"}` blocks → session persistence silently died on heavy turns; now tool_result-only + BYTE cap (100KB). `norm()` NFD-folds diacritics ("Cancún"→CANCUN; was wrongly latching featured trips live). Nudge one-shot flags → persisted `this.nudges`/SessRecord. Tools sorted by name (cache-key stability). |
| `7630e67` | **destructive-tool denylist** — public catalog withholds 14 tools (delete_*, publish_*, share_folio, update_advisor_profile, manage_clients/pipeline, record_payment, report/update_issue). ~110 of ~120 exposed. |
| `9bda3b2` | **Task 4: advisor profitability view** — traveler/advisor toggle (`?advisor=1`/localStorage; board-header + Inspector-head mounts via `AdvisorSwitch`). Commission chip on board cards + per-hotel + trip-total in folio (both skins). `FolioHotel.commission/commissionPct`; folio-sync passthrough (both `commission_pct`/`commissionPct` spellings); LIVE prompt copies commission verbatim, OMITs when absent. Real cpmaxx data only — serp shows nothing, never invented. `web/src/lib/advisor.ts`. |
| `eaa619f` | **Task 5: cost-weighted tokens + cache hit-rate** — `web/src/lib/usage.ts` (reads 0.1×, writes 1.25×); Inspector scoreboard shows hit-rate + cost-weighted figure; tier line labeled "(cost-wtd)". Fixes 5-10× pessimism. |
| `b42cb17` | **Tasks 6/7/8** — (6a) welcome heading "Where to next?" + geo subline; (6c) moved tier table + BTS cards + business case OUT of Inspector → deep-dive links. (7) worker-served `/info/*` pages (`worker/info/{layout,pages,resume}.ts`): bot-defeat, context-economics, record-replay, cost-engineering, production-system. (8) `/info/resume` (FDE résumé, synced from `docs/Neil_Roberts_FDE_Resume.md`). |
| `103c5f3` | **Task 9: safe board detail links** — `web/src/lib/url.ts` `safeHttpUrl` (http(s)-only guard, codex finding); render cpmaxx `hotel_sheet_url` as a "details ↗" anchor outside the pick button (rel=noopener); activity/dining links now URL-guarded. |
| `2a91dcc` | **Task 11: headless replay regenerator** — `scripts/record-replay.mjs` drives `/chat` SSE in boards mode, synthesizes gif-cadence delays, emits `web/src/recordings/<trip>.json`. Regenerated `dublin-oct.json`: 3-frame STUB → 80 frames (full trip). Bare `/` autoplay now plays a real run. |

Tests: **145 pass** (`npx vitest run`, was 128); `npx tsc --noEmit` clean.

## Remaining
- **Task 10 (needs Neil interactive):** claude.ai usage measurement — run the same Cancún/Lisbon script in Claude Code w/ the voygent connector + `/cost`, compare vs the demo Engineering tab (now full-catalog, so comparable).
- **Deferred from task 9 (data task):** curate TripAdvisor-validated free things for cancun/nyc/rome/tokyo (only dublin has them) + validate fixture URLs at capture time in `scripts/capture-fixtures.mjs`.
- **Task 6b (minor, skipped):** Inspector collapse/expand polish — the rail state works; left as-is.
- **Top up Anthropic credits** (see warning above) before the demo is usable.

## How to verify / run — unchanged from prior handoff
- Suite: `cd ~/dev/voygent-demo-demo-enrichment && npx tsc --noEmit && npx vitest run` (145).
- Deploy: `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`.
- Regenerate a recording: `node scripts/record-replay.mjs --trip dublin-oct --base <prod> --prompt "..."` (set `VOYGENT_CAPTURE_MCP_URL` to auto-clean; costs LLM+MCP).
- Info pages: `curl <base>/info/cost-engineering` (200; unknown slug → 302 `/`).
