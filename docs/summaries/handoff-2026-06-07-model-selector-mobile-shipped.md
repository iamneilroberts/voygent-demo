# Session Handoff: model selector + mobile UX shipped

**Date:** 2026-06-07 (late) · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (prod runs this branch; deploy-from-main clobbers)
**Supersedes:** `handoff-2026-06-08-tasks4-11-shipped.md` for current state.

## What shipped (spec → Codex design review → build → deploy)
**Spec:** `docs/superpowers/specs/2026-06-07-model-selector-design.md` (brainstormed, Codex-reviewed `focus=design`, all 8 findings folded in).

| Commit | What |
|---|---|
| `b14690d` | **Worker** per-phase model routing. `shared/models.ts` (ModelId/ModelRouting, `coerceModel` = Opus allowlist gate, `buildRouting`, `resolveRoutingModel`). `LLMProvider.stream(opts.model)`; loop `nextModel()` per turn + stamps model on turn event + `onUsage(usage,model)`. Outcome-based `hotelsPromoted` milestone (only on a successful hotel lock). Measured `actualCostUsd` (per-turn model) → ledger/log; `costByModel` kept as counterfactual. routing+milestone persisted in `SessRecord` (+ re-derive on hydrate). `/presets` advertises `enabledModels` (gated by `DEMO_OPUS_ENABLED`) + `smartMap`. |
| `fcb4e52` | **Web model selector.** `lib/model.ts`; `ModelSwitch` (Haiku/Sonnet/[Opus]/Smart, enabled-only). Inspector "Model routing" region: editable per-phase dropdowns, active phase highlit; cost shows MEASURED actual (split by model) vs counterfactual + cache-lane caveat. `streamChat` extraBody carries `{model}`/`{routing}`. |
| `2551236` | **Web mobile UX.** Phone IA (≤760px, claude skin): chat full-screen; folio + engineering as slide-up overlays via a pill bar above the composer. Inline folio hidden→Folio sheet. Auto-scroll fixed (pinned-to-bottom; no yank on folio updates). Fixed skin-switch/watch-demo hidden on mobile (demo toggle in pill bar). Engineering overlay (`data-mview`), pill gated on content. `lib/mobile-view.ts`. |

## Prod state
- **Deployed:** `voygent-demo` Worker version **(latest — see `wrangler deployments list`)** @ branch HEAD `2551236` → https://voygent-demo.somotravel.workers.dev
- Anthropic credits restored by Neil this session; live runs work again.
- **Verified:** tsc clean; **161 vitest pass**; live mobile (390px, Playwright) shows the full engineering overlay — model switch, editable per-phase routing map, cost/hit-rate, 106/120 tools (denylist), Opus absent (DEMO_OPUS_ENABLED off); folio sheet; no off-screen panel; scroll fixed. Prod boards smoke run post-deploy (see session).

## Design decisions (locked)
- "Per tool" is impossible (tools run server-side) → routing is **per provider turn / phase**. Two phases: `discovery` (Sonnet) until hotels lock, then `enrichment` (Haiku). Map is data-driven (more phases = config).
- Selector default = **Smart**. Opus gated behind `DEMO_OPUS_ENABLED` (server allowlist is the real gate; UI gating cosmetic). Mobile = overlays (Neil chose tabs/links over a CSS-only fix).
- Honesty: Inspector shows MEASURED actual spend + cache caveat (model switches break the cache lane, so smart routing isn't guaranteed cheaper — numbers tell the truth).

## Known limitation / follow-ups (not blocking)
- **Autoplay engineering panel is empty** (desktop + mobile): the recording omits inspector events by design, so `mode=auto` shows the idle rail. The Engineering pill is gated on content so mobile autoplay hides it. To make autoplay show the engineering flexes, regenerate the recording WITH inspector events (extend `scripts/record-replay.mjs`). Pre-existing; now more visible.
- **Model selector pre-first-message:** ModelSwitch lives in the Inspector head (live only), so it's not visible before the first message (same as Advisor/Theme). Smart default covers the first run; changeable mid-session. Enhance later if desired.
- Task 10 (claude.ai usage measurement, needs Neil) still open.

## Verify / run
- `cd ~/dev/voygent-demo-demo-enrichment && npx tsc --noEmit && npx vitest run` (161).
- Deploy: `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`.
- Mobile check (no API): `node /tmp/...` Playwright at 390px against `?mode=auto`; live: `?mode=live` + send a prompt.
- Boards smoke: `node scripts/smoke-enriched-run.mjs --base <prod> --boards` (set `VOYGENT_CAPTURE_MCP_URL`).


## Operational note (added end of session)
- **Daily budget cap raised to $25** (`BUDGET_DAILY_USD` secret; was default $5). Today the $5 cap was exhausted by automated testing → `/chat` 503'd ("hit its daily limit"). Cap is read per-request from the secret; resets at 00:00 UTC.
- **Test bypass shipped** (`de2e3c2`): a request with header `x-demo-test: <DEMO_TEST_TOKEN secret>` skips the daily cap AND skips adding to the public ledger. So smoke/record scripts no longer drain the public budget. The scripts auto-send it from `process.env.DEMO_TEST_TOKEN`. Token is in `~/dev/voygent-demo-demo-enrichment/.env` (now gitignored): `export DEMO_TEST_TOKEN=$(grep '^DEMO_TEST_TOKEN=' .env | cut -d= -f2-)` before running smoke/record.
- **A 503 on `/chat` = budget cap or `DEMO_DISABLED`**, NOT a layout bug. Diagnose: `curl -X POST <prod>/chat -d '{"message":"hi"}'` and read the body.
- Mobile layout is correct as deployed (verified live at 390px); the stale-looking phone screenshots were long-open tabs serving a pre-deploy bundle (HTML is `max-age=0, must-revalidate` — a reload pulls current).
