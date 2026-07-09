# Open-issue triage — 2026-06-11

Companion to `2026-06-11-sitrep.md`. Source: direct prod-KV read of the internal issue store
(33 open/in_progress in the 30-day index window; **14 important**, not 13 as the sitrep said) plus
5 open GitHub issues. Grouped by theme, ordered by how much they matter to M0–M3. Issue ids are
the internal `manage_issues` ids unless prefixed `gh#`.

## Likely CLOSEABLE — verify, then close (do these first; they're free wins)
| id | filed | why it looks done |
|---|---|---|
| `wild-wolf` | 06-07 | "demo phase-machine orchestration" — SHIPPED in voygent-demo 2026-06-07 (DEMO_PHASE_MACHINE live, journal-verified) |
| `hardy-feather` | 05-15 | "Build cpmaxx_cruise_search" — the tool exists in the prod catalog today |
| `tidal-viper` | 05-22 | "out-of-band advisor notification on client annotations" — annotation email notify + coalescing cron shipped 2026-06-03 (`6987af8..e383b0f`) |
| `swift-toad` | 05-19 | "rich MCP UI bundle for inline tool results" — board widget rebuilt on ext-apps App SDK 05-29/30; verify remaining scope before closing |
| gh#110 | — | tour_list 404 fallback — tool no longer exists; if the bug survives it's now in `list_render(domain=tour)`. Retest + retitle or close |
| gh#78 | — | manage_action_items rewire — tool folded into `manage_crm(action)`. Retitle or close |

## A. Advisor-facing correctness bugs (important — Kim's daily workflow)
The sitrep tagged this cluster `consciously-defer-until-2026-06-15`; within it, this is the order:
1. `plucky-oasis` (05-26, bug) — preview_publish returns verified:true but published HTML serves **stale content** after patch_trip. Trust-breaking: a "verified" publish that lies.
2. `sharp-plateau` (06-07, bug) — proxied tools **double-wrap results in a nested MCP envelope**. Plumbing-level; likely silently degrades every proxied tool result.
   - **VERDICT 2026-06-11 (lite session, Neil-confirmed): KEEP the double wrap; close as wont-fix-by-design.** Mechanics confirmed: voygent-desktop's `/internal/tools/{name}` registry stores the MCP tool callbacks themselves, so `result` is a full MCP envelope which Lite's `callAndFormat` (`src/mcp/tools/proxied/_shared.ts:176`) stringifies into a second envelope. Keeping it is the right call because (a) Lite's consumers already compensate — `unwrapMcpEnvelope` in `src/shared/flight-candidates.ts:1182` peels up to 3 levels by design, and the status allowlist accepts desktop's `success` vs in-Worker `ok`; (b) the proxied surface is shrinking (cpmaxx lite-first native, BA native, farebuzz dormant) so an envelope redesign buys little; (c) a naive unwrap is WORSE — it must OR inner/outer `isError` and pass content arrays through verbatim or it corrupts error semantics across every proxied tool. Two known costs accepted: inner `isError:true` from a desktop tool surfaces as MCP-success-with-error-text (AE telemetry records ok=true for failed proxied calls), and one level of JSON escaping inflates proxied payload tokens. If either cost ever matters, fix at the SOURCE (desktop returns raw payloads, not envelopes) in one coordinated change — never unwrap on the Lite side alone.
3. `fleet-thicket` (05-26, bug) — Day-11 (debarkation) `tips[]`/`suggestions[]` don't render.
4. `umber-plateau` (05-18, bug) — preview_publish requires profile.subdomain; update_advisor_profile schema doesn't expose it. NOTE: an advisor-profile subdomain Zod fix shipped 04-29 (`8c2d285`) — issue postdates it, so either it regressed or the fix was partial. Verify before working.
5. `amber-cinder` (06-01, nice) — day-item render: lead with description, keep link.

## B. OneSource/cruise parsing (important bugs, all mid-May — stale-ish, one program)
`tough-copper` (cruise_detail shape garbage: whitespace-bombed name, nights=0, leaked JS), `ivory-bison` (cruisetour_quote works in Node, `not_found` in Workers prod — POLAR POST never escapes), `tidal-falls` (HAL Vista/Pinnacle deck-zone parsing). Plus nice-to-haves `rosy-thorn` (sub-code price enrichment) and `cyan-pine` (promo badges). **Recommendation:** treat as one "OneSource hardening" work package; below-the-line until a customer commitment needs cruisetours.

## C. Build-loop / MCP contract polish
- `bright-boulder` (06-09, decision-needed) — promote(action=confirm_lodging) doesn't emit `_meta.checklist` like sibling actions. Deliberate call wanted, not a silent change.
- `wise-valley` (06-09, nice) — non-revenue cost estimates default OFF, opt-in.
- `snappy-cedar` (06-09, nice) — ContextSpy profiling of tool-call/context efficiency.

## D. Annotation UX backlog (05-22 cluster, post-email-notify remainder)
`opal-maple` (session-start aggregate read + addendum directive, important), `keen-mountain` (pending-annotation visibility + self-service edit/withdraw, important), `merry-crest` (bulk dismiss/resolve, nice), `wild-walrus` (notification fan-out without LLM costs, nice — partially covered by the email cron; rescope). **Recommendation:** one "annotation UX round 2" package after M1.

## E. Revenue / funnel (the only issues that touch M1–M3 directly)
- `daring-ember` (05-20, important) — **restore Stripe signup + checkout on voygent.ai** (Path C stopgap, Path B port). This is literally M3 "wire pro trial provisioning". Should be pulled onto the roadmap, not live in the issue store.
- `zesty-vine` (06-05, important) — Voygent Pro local-install zero-custody build (per ADR-0008). Agency-tier strategy.
- gh#190 — freemium tier (cost-absorbed sources + caps). Feeds M1 tier definitions.
- gh#179 — isolate demo supplier-API spend from prod keys. Revisit only if demo traffic grows (standing stance).

## F. Infra / dev-env (M0-adjacent)
- `velvet-keystone` (05-27, important) — git-sync home box ↔ cloud VM + formalize traffic toggle. Feeds M0's remaining actions (deploy scripts + CI gate).
- `twin-cairn` (05-22, nice) — staging_health preflight (which provider secrets configured).
- `vivid-glacier` (05-28, nice) — probe-sweep Lane B live test (home box).
- `twin-summit` (06-05, nice) — vendor MCP Apps spec into local knowledge.

## G. Adapter/search backlog (below-the-line by operating discipline rule 3)
`silent-scroll` (Rail Europe, partnership-gated, important but outreach ≠ critical path), `merry-onyx` (farebuzz XHR-replay capture — also the AA pattern), `zany-thistle` (Mondee/Centrav, creds-blocked), `warm-thicket` (hotel_list resort/AI sources), `solar-sonnet` (Klura eval), `eager-valley` (dangeresque revisit), gh#154 (damru eval). **None of these unblock a tier definition or customer commitment today.**

## Suggested triage actions (propose-only)
1. Close/retitle the 6 "likely closeable" rows after a quick verify each (~30 min total).
2. Pull `daring-ember` (Stripe) out of the issue store onto M3's next_actions — it's roadmap work hiding in KV.
3. Tag groups B, D, G with their package names in the issue store (update each issue's category or a note) so /voygent-issues ranks them as programs, not 20 singletons.
4. The `important` count that matters this week is small: `plucky-oasis` + `sharp-plateau` (trust/plumbing) are the two worth a slot before the 06-15 M1 target if any slack appears.
