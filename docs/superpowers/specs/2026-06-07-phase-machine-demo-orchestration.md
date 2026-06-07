# Feature Plan: Phase-Machine Demo Orchestration (workflow engine drives, LLM executes)

**Date:** 2026-06-07 · **Status:** PLANNED (not started) · **Repo:** voygent-demo · **Est:** ~1 day
**Origin:** Neil's direction during the demo-enrichment Phase D session — "a more rigid step-by-step process where the LLM is constrained to taking fewer actions on its own and always gets specific instructions for each step or phase from the prompt kv."

## Problem

The demo's trip-build is one open-ended agent loop: a single seed prompt (SYSTEM_HINT + ENRICHMENT_WORKFLOW) and up to 12 turns / 24 tool calls of model discretion. Observed failure modes (2026-06-06/07 prod+local smokes, haiku AND sonnet):

1. **Stops early** — completes flights+hotels, ends the turn instead of continuing to enrichment ("What would you like to do next?").
2. **Presents instead of acting** — calls `excursion_search`, then narrates candidates and waits, never calling `apply_gap_tour_picks`.
3. **Narrates from memory** — skips `tripadvisor_search` and names restaurants from training data (folio stayed clean — the fabrication guard held — but the *chat prose* fabricated).

Mitigations now live (commits `0d39755`…`f1e31ee` + secrets): hardened act-before-narrate prompt, `LLM_MODEL=claude-sonnet-4-6` (~$0.05 → ~$0.15/session), and the real root-cause fix for the worst runs (the prod MCP bearer's tier was missing `apply_gap_tour_picks`/`tripadvisor_search` from the catalog — flipped `VOYGENT_MCP_URL` to the per-user token URL, 12/12 tools now exposed). Post-fix: 2/2 clean single-turn prod runs.

**Why still build this:** prompt-level compliance is probabilistic; a public demo should be deterministic-by-construction. The phase machine also (a) lets us drop back to haiku (~3× cost cut) without losing reliability, (b) is itself a showcase of Voygent's orchestration moat — *the workflow engine drives; the model executes and narrates*, and (c) gives per-phase prompts hot-tunable in KV without redeploy.

## Design

### Core idea
Replace "one big seed + model discretion" with a **server-side phase state machine** in `SessionDO`. The worker decides *what happens next*; the model only ever faces one small, explicit instruction.

### Phase set (initial)
```
INTAKE            user's first message → save_trip + flight_search (+ board in boards mode)
FLIGHT_PICK       boards mode: wait for traveler pick → patch_trip + promote_flights
                  auto mode: model picks → patch_trip + promote_flights
HOTEL_SEARCH      hotel_search (+ board)
HOTEL_PICK        as FLIGHT_PICK, for lodging → promote_hotels_to_lodging
ENRICH_EXCURSIONS excursion_search → MUST be followed by APPLY_PICKS (no prose between)
APPLY_PICKS       apply_gap_tour_picks with 2-3 picks (≥1 free:true, ≥1 paid)
ENRICH_DINING     tripadvisor_search (search-doubles-as-apply; nothing else)
SUMMARY           one message: what was added, folio pointer; then idle
EDITS             free-form follow-ups (swap hotel, re-pick excursions) — re-enter the
                  relevant phase by classifying the observed tool call
```

### Mechanics
1. **State:** `phase` field on `SessionDO` (persisted in DO storage beside `messages`), plus a `phaseLog[]` for the inspector.
2. **Per-phase micro-prompts:** a `PHASE_PROMPTS: Record<Phase, string>` map. Source of truth in code; overridable from KV (`_prompts/demo-phases/<phase>` via the existing prompt-KV pattern) so wording is tunable without redeploy. Each is 1–3 sentences: *"Phase ENRICH_EXCURSIONS: call excursion_search { source:'viator', destination_name:<city>, date:<depart> } now. Do not write prose."*
3. **Injection:** each provider call prepends the CURRENT phase's instruction as the trailing user-message block (the existing seed stays for global rules: vocabulary, fabrication, tone). The model never sees future phases.
4. **Advance by observation, not trust:** after every tool result, a pure `advancePhase(phase, toolName, resultJson)` reducer decides the next phase (e.g. `promote_hotels_to_lodging ok → ENRICH_EXCURSIONS`; `apply_gap_tour_picks persisted:true → ENRICH_DINING`). Malformed/failed results keep the phase (bounded retries → `SUMMARY` with what exists).
5. **Auto-continuation:** if the model ends its turn while `phase < SUMMARY`, the loop injects a synthetic user message ("proceed") and continues — capped (e.g. 4 continuations/exchange) so a wedged model can't loop. This kills failure modes 1–2 *structurally*.
6. **Prose fence per phase:** action phases instruct "no prose"; only `SUMMARY`/`EDITS` produce traveler-facing text — which also bounds where fabrication-in-prose can occur, and `SUMMARY`'s prompt re-states the only-tool-returned-names rule.
7. **Boards interplay:** in boards mode `FLIGHT_PICK`/`HOTEL_PICK` end the turn (present-and-wait — same as today via `BOARDS_WORKFLOW_OVERRIDE`); the pick message re-enters the machine. Enrichment phases are non-interactive in both modes.
8. **Untouched:** `replay.ts` fixtures + fabrication guard, `onFolio` overlay, `patch_trip` sanitize, boards wiring, SSE contract, client. This is worker-loop orchestration only.

### Files (expected)
- `worker/agent/phases.ts` (NEW): `Phase` enum, `PHASE_PROMPTS`, `advancePhase()` reducer — pure, unit-testable.
- `worker/agent/phases.test.ts` (NEW): reducer table tests (every tool-result → phase transition; retry caps; EDITS classification).
- `worker/session-do.ts` (MODIFY): hold/persist `phase`, inject per-phase prompt, auto-continuation, KV override lookup.
- `worker/agent/loop.ts` (MODIFY, minimal): expose a hook to continue after model stop (or implement continuation in session-do around `runAgentLoop`).
- Optional: inspector event `{kind:"phase"}` so the amber skin can show the machine stepping (great demo theater).

### Acceptance criteria
- With `LLM_MODEL=claude-haiku-4-5`: **10/10** scripted Dublin runs produce a folio with days ≥ 3, ≥1 free + ≥1 paid activity, dining ≥ 4, includes = 3, with zero un-fixture names in prose (automated SSE assertion script — reuse `/tmp` smoke analyzer from the 2026-06-07 session, promoted into `scripts/smoke-enriched-run.mjs`).
- Cost per session back at haiku levels (~$0.05) with no reliability loss.
- Boards-mode (claude skin) flow unchanged from the traveler's perspective; default board skin unchanged.
- All existing 108+ tests green; guard tests untouched.

### Non-goals
- No changes to fixtures, capture, record/replay, or the golden recording.
- Not a general voygent-lite framework (demo-repo only; if it proves out, the pattern can graduate).

### Build triggers (why we'd pick this up)
- Live "build your own" sessions still wobble with sonnet, OR
- Cost: want haiku back for public traffic, OR
- Marketing: want the inspector to visibly show "workflow engine driving the model" as a feature.

## Open questions (resolve at build time)
- KV namespace for phase prompts: bind voygent's shared prompts KV vs a demo-local KV vs code-only first pass (recommend: code-only v1, KV override v2).
- Should `EDITS` re-enter enrichment phases via tool-observation alone, or need a tiny intent classifier prompt?
- Inspector phase events: v1 or polish?
