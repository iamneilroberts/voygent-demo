# Session Handoff: Reel P2 — P2.1 Spine + P2.2 Pick/Edit Render (both shipped)

**Date:** 2026-06-09 ~17:45
**Repo:** /home/neil/dev/voygent-demo
**Branch:** main (`origin/main` = `3978b01`)
**For:** a fresh session continuing the reel P2 effort (next up: **P2.3**)

## One-line state
The reel "P2" effort (advisor↔client interactions in the canned demo replay) has shipped its first two phases to prod: **P2.1 spine** (logic) + **P2.2 pick/edit render** (first visible). Next is **P2.3** (comment thread + send-to-client). The whole P2 design is one approved, Codex-reviewed spec; each phase is its own plan + its own worktree + subagent-driven TDD + merge + deploy.

## What shipped THIS session
1. **P2.1 — spine (logic-only, no rendering).** A reel-only `interaction` `Frame` kind, a pure `applyInteraction` reducer over `ReelViewState`, post-apply dwell, an extended highlight matcher, a typed **screenplay DSL + compiler** with lowering validation, and a proof reel at `?reel=collab`. Deployed (inert — nothing visible). Plan: `docs/superpowers/plans/2026-06-09-reel-p2-1-spine.md`.
2. **P2.2 — render pick + edit (first VISIBLE phase).** At `?reel=collab`: a board **pick** shows an actor-colored selected state + "✓ {Actor} chose this"; an edited folio **activity** shows a before→after marker + "{Actor} edited" tag. Actor colors: advisor = terracotta `#c96442`, client = slate-teal `#2f7d8c`. Deployed (bundle `index-Gp2D0t63.js`, CSS `index-BQNKt5e4.css`). Plan: `docs/superpowers/plans/2026-06-09-reel-p2-2-pick-edit-render.md`.

Both built subagent-driven (fresh subagent per task, two-stage review = spec-compliance then code-quality), with a final whole-branch review each. 359 tests green, tsc clean.

## Smoke status (IMPORTANT — visual still pending Neil)
- **Done (automated):** the live bundles carry all P2.2 code — JS has `"chose this"`, `cl-day-edited`, `cl-actor-`, `folio-day-` anchors; CSS has `#2f7d8c`, `cl-reel-pick-flash`, `cl-edit-marker`, `cl-sr-only`. Plus 359 tests + the final review's CSS-selector↔emitted-class match check.
- **NOT done:** a true pixel-level visual smoke. The chrome-devtools MCP **cannot attach in this sandbox** (it manages its own Chrome launch; manual `google-chrome --headless --remote-debugging-port` does not get picked up). So **Neil must eyeball** `https://demo.voygent.ai/?reel=collab` (passcode `DEMO_ACCESS_CODE` in repo `.env`): watch the flight-pick beat (slate-teal "✓ Client chose this") and the Day 3 edit beat ("Free morning in Temple Bar → Advisor edited"). Confirm colors/labels read at 2× replay speed.

## Mental model of the reel interaction system (so P2.3 builds on it, not rediscovers it)
- **Authoring:** reels are written in a typed **screenplay DSL** (`web/src/lib/screenplay.ts`) — `s.advisor.says/picks/edits/comments/sendsToClient`, `s.client.*`, `s.agent.tool/board/folio`, `s.spotlight(...)`. `screenplay(meta, build)` returns `{ recording, highlights }` and **validates at import** (a bad board/candidate/path throws). The proof reel: `web/src/recordings/dublin-collab.screenplay.ts`, registered at `?reel=collab` in `web/src/recordings/registry.ts` (NOT in rotation — that's P2.4).
- **Runtime:** the compiler lowers interactions to a reel-only `Frame` kind `{kind:"interaction", actor, interaction, beatId}` inline in `recording.frames`. `replayChat` (`web/src/lib/recording.ts`) plays them: calls `handlers.applyInteraction(i, actor)`, then **holds a post-apply dwell** (`interactionDwell` in `web/src/lib/pacing.ts` — pick 3500/edit 3200/comment 4200/handoff 5200ms, ÷speed) UNLESS a spotlight on the same frame provides the hold. Abort-safe.
- **State:** `App.tsx` holds `reelView` (now bound, was setter-only) and feeds it via `applyInteraction` (the pure reducer in `web/src/lib/interaction.ts`). `ReelViewState = { selected: Record<boardId,{candidateId,actor}>, edits: ReelEditMarker[], threads: ReelThread[], handoff: ReelHandoff|null }`. **Folio ownership rule:** canonical folio is owned ONLY by the `ServerEvent "folio"` path (`applyEvent`); interaction state is overlay-only. Edit overlays are reconciled (`reconcileEdits`) when the compiler's folio event lands.
- **Render:** `App.tsx` → `ClaudeChatView.tsx` → `BoardView.tsx` (pick) + `FolioArtifact` (edit, defined inside ClaudeChatView). Pure render logic is in `web/src/lib/reel-render.ts` (`actorClass`, `actorLabel`, `pickedActor`, `editForActivity`) — **unit-tested**; JSX stays thin (repo convention: test logic, not DOM). Styles in `web/src/skin-claude.css` (actor color tokens `--cl-actor-*`, `--flash-color`/`--edit-flash` keyframes, reduced-motion, `cl-sr-only`).
- **Highlights/spotlight:** `web/src/lib/highlights.ts` matcher targets interaction frames by `interactionKind` or compiler `beatId` (backward-compat with `eventType`); `resolveHighlightFrames` returns `Map<number, Highlight[]>`. `ReelCallout.tsx` anchors a card to a `data-reel-target`/`data-stat` element. Existing anchors: `board-${kind}`, `folio-days`, `folio-day-${i}` (added P2.2), `folio-includes`, `tool-${name}`, `stat:${key}`.

## NEXT: P2.3 — comment thread + send-to-client (its own plan needed)
From the spec (`docs/superpowers/specs/2026-06-09-reel-p2-screenplay-interactions-design.md`, rendering §3 + §4) and the approved mockup (`https://demo.voygent.ai/mockups/reel-p2-interactions`, sections 3 + 4):
1. **Comment thread (collapsible).** Render `reelView.threads` as a collapsed pin with a count badge that pulses when a comment lands; **auto-expands for the dwell, then collapses** so the folio stays clean. Avatars colored per actor; client question → advisor reply. The thread anchors to a folio section (the screenplay `comments(anchor, text, threadId)` uses `anchor = days[i]`). Likely needs a new `data-reel-target` for the comment pin so a spotlight can anchor it. Add a `reel-render` helper `threadsForDay(threads, dayIndex)` (pure, tested) mirroring `editForActivity`.
2. **Send-to-client + reply routed back = GENERIC email notification (NO Gmail branding).** Decision locked (Codex honesty flag + Neil): a neutral mail-icon notification with a visible **"simulated"** marker. Two beats: trip sent (client notified) → client replied → an explicit **"client's note → routed back to the agent"** chip, then the agent acts. Optionally a brief **"viewing as client" ribbon** flipping the frame. Driven by `reelView.handoff` ({sent, routedBack, subject, reply}). This is a NEW surface (a notification overlay) — design where it mounts (probably an App-level overlay like `ReelCallout`, not inside the folio).
- The proof reel `dublin-collab.screenplay.ts` ALREADY exercises both (it calls `client.comments`/`advisor.comments` on `days[2]` and `advisor.sendsToClient({subject, reply})`) — so P2.3 just needs the rendering; the data is already flowing into `reelView.threads`/`reelView.handoff`.
- Mockup reference for the look: sections 3 (collapsible comment thread) + 4 (email notification, already updated to generic + "simulated" in the mockup).

Then **P2.4**: author final calibrated content, end-card recap chips, dwell calibration, and **put `collab` into rotation** (it's `?reel=collab`-only today). **P4** (separate): full multi-act Dublin screenplay.

## Established workflow (reuse it)
- **Mockup hosting** (NOT the superpowers localhost server): drop static HTML in `web/public/mockups/<name>.html` → `VITE_API_BASE="" npm run build:web && npx wrangler deploy` → view at `demo.voygent.ai/mockups/<name>`. Documented in project `CLAUDE.md` (claude-skin token block there too). The P2 interaction mockup is `reel-p2-interactions.html`.
- **Per phase:** `/branch <slug>` worktree off latest `main` → write the phase plan (writing-plans format) → optional Codex review of the spec/plan → subagent-driven TDD (each task spec+quality reviewed) → final whole-branch review → `/branch`-update + coord → rebase onto latest `main` → FF-merge → `VITE_API_BASE="" npm run build:web && npx wrangler deploy` → verify prod 200 + bundle → journal Active→Done + coord SHIPPED → push → remove worktree (retain branch ref).
- **Worktrees need `npm ci`** (they don't inherit `node_modules`).
- **Vitest root quirk:** run test paths relative to the worktree ROOT (`npx vitest run web/src/...`), not from `web/`.
- **Copy voice:** no em-dashes, plain cadence (memory `feedback-demo-copy-voice-no-em-dash`).

## Cross-session / git hygiene
- Another session is active: worktree `../voygent-demo-deepdive-voice` (branch `deepdive-voice-rewrite`) — Neil's `/info` content rewrite. Leave it alone. Its commits land on `main` independently; **rebase onto latest `origin/main` before merging** any P2.3 branch (P2.1 and P2.2 both had to rebase onto an /info commit — clean, no overlap, since reel work is all in `web/src/lib|recordings`, `web/src/App.tsx`, `web/src/ClaudeChatView.tsx`, `web/src/BoardView.tsx`, `web/src/skin-claude.css`).
- **Merged branch refs to delete** (worktrees already removed): `git branch -d reel-p2-spine reel-p2-2-render` (+ older `reel-p1 reel-polish` from prior sessions).
- The coordination journal `docs/worktree-journal.md` `## Coordination` section has the full P2.1/P2.2 SHIPPED notes.

## Key files (the reel interaction system)
| File | Role |
|------|------|
| `web/src/lib/screenplay.ts` | Authoring DSL + compiler (+ validation) |
| `web/src/lib/interaction.ts` | `ReelViewState` + pure `applyInteraction`/`reconcileEdits` |
| `web/src/lib/reel-render.ts` | Pure render helpers (pick/edit; ADD comment/handoff helpers in P2.3) |
| `web/src/lib/recording.ts` | `Frame` union + `replayChat` (interaction playback + post-apply dwell) |
| `web/src/lib/pacing.ts` | `interactionDwell` floors + pre-beat |
| `web/src/lib/highlights.ts` | Matcher (interactionKind/beatId) + `Map<number,Highlight[]>` |
| `web/src/recordings/dublin-collab.screenplay.ts` | Proof reel (`?reel=collab`); already drives all 4 interactions |
| `web/src/App.tsx` | Holds `reelView`; binds `applyInteraction`; reset/reconcile |
| `web/src/ClaudeChatView.tsx` | Claude-skin timeline; `FolioArtifact` (edit render lives here; comment/handoff render likely here or an overlay) |
| `web/src/BoardView.tsx` | Board pick render |
| `web/src/skin-claude.css` | Actor colors, flash, edit marker, reduced-motion, sr-only |
| `web/src/ReelCallout.tsx` | Spotlight overlay (model for a send-notification overlay) |

## What NOT to re-read
- The P2.1/P2.2 plans (`docs/superpowers/plans/2026-06-09-reel-p2-1-spine.md`, `...-p2-2-pick-edit-render.md`) — shipped; this handoff summarizes them.
- The P1 spine internals — stable; the mental-model section above is enough to build P2.3.
- Re-read ONLY: the spec's rendering §3/§4 + decisions for P2.3 specifics, and the mockup sections 3/4 for the look.

## First moves for the next session
1. Confirm `origin/main` is still `3978b01` (or a later /info commit) and that P2.2 is what's deployed.
2. Ask Neil for his P2.2 visual-smoke verdict (any color/timing/copy tweaks to fold into P2.3 styling).
3. `/branch reel-p2-3-comment-send` off latest `main`; `npm ci` in the worktree.
4. Write the P2.3 plan (comment thread render + generic-email send overlay), against the spec §3/§4 + mockup §3/§4. Consider a quick Codex review of the plan.
5. Subagent-driven TDD → review → rebase → merge → deploy → Neil smokes.
