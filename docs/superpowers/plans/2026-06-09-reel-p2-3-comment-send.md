# Plan: Reel P2.3 — comment thread + send-to-client notification

**Date:** 2026-06-09
**Branch:** `reel-p2-3-comment-send` (off `main` @ efe49c7)
**Spec:** `docs/superpowers/specs/2026-06-09-reel-p2-screenplay-interactions-design.md` (§3, §4, "Decisions locked")
**Mockup:** `web/public/mockups/reel-p2-interactions.html` sections 03 + 04
**Predecessors:** P2.1 spine (logic), P2.2 pick+edit render. Both shipped.

## What already exists (do NOT rebuild)

- `ReelViewState.threads: ReelThread[]` and `.handoff: ReelHandoff | null` — populated by the
  pure `applyInteraction` reducer (`web/src/lib/interaction.ts`). A single `sendsToClient({subject, reply})`
  sets `handoff = { sent: true, routedBack: reply != null, subject, reply }` in one beat.
- The collab proof reel (`web/src/recordings/dublin-collab.screenplay.ts`) already drives both:
  `advisor.sendsToClient(...)`, `client.comments("days[2]", ...)`, `advisor.comments("days[2]", ...)`.
  So P2.3 is **rendering only** — no screenplay/reducer/worker change.
- Dwell floors (`pacing.ts`): comment 4200ms, handoff 5200ms. **No pacing change.**
- Actor color tokens (`skin-claude.css`): `--cl-actor-{advisor,client}` + `-soft`/`-bright`. **Reuse.**
- `ReelCallout.tsx` is the model for an App-level reel overlay (scroll-to-center, fixed positioning).

## Scope

**In:** the comment-thread render (collapsible pin + thread, anchored to a folio day) and the
generic email-style send notification (two notifs + "routed back to the agent" chip, "simulated"
marker), both claude-skin native, client-only.

**Deferred (noted, not built):** the optional "viewing as client" ribbon (spec says "may flip the
frame" — not in Decisions-locked); new spotlight *content* targeting these surfaces (that's P2.4
calibration — but we DO add the `data-reel-target` hooks now so a future spotlight can anchor).

## Tasks (TDD: pure helpers first)

### T1 — pure render helpers (`web/src/lib/reel-render.ts` + test)
- `threadsForDay(threads, dayIndex)` → threads whose `anchor === "days[${dayIndex}]"` (mirrors
  `editForActivity`; the anchor format is the screenplay compiler's canonical lowering).
- `actorInitial(actor)` → "A"/"C"/… for the avatar (first char of `actorLabel`).
- Tests: matches by exact anchor; returns [] for a day with no thread; initials correct.

### T2 — comment thread component (in `ClaudeChatView.tsx`)
- `CommentThread({ thread, dayTitle })`: collapsed **pin** (`💬` + count badge + "on {dayTitle}")
  that expands to show each comment (actor avatar colored per actor, name, text). Pin is a
  `<button aria-expanded>`; click toggles. `data-reel-target={`comment-${thread.threadId}`}` on the pin.
- Auto-expand for the beat: local `expanded` state; a `useEffect` keyed on `thread.comments.length`
  sets expanded=true and (re)arms an abort-safe collapse timer (cleared on unmount and on each new
  comment, so it stays open across the client→advisor pair, then tucks away). Manual toggle cancels
  the auto-collapse. `prefers-reduced-motion` → no flash/pulse (instant), collapse still happens.
  Collapse delay is a cosmetic soft-default (~3500ms), tunable in P2.4 calibration.
- Wire into `FolioArtifact`: thread `threads` prop through; under each day `i`, render
  `threadsForDay(threads, i)` after the day body. ClaudeChatView passes `reelView.threads`
  (both the inline and split-pane `FolioArtifact` call sites).

### T3 — send-to-client notification (new `web/src/ReelHandoffNotice.tsx`)
- Renders when `handoff?.sent`. Notif 1 = "Email · to client [simulated]" + subject; when
  `routedBack`, Notif 2 = "Email · new reply from client [simulated]" + quoted reply, plus a
  routing chip "client's note → routed back to the agent" (client-colored). Neutral `✉` icon, no
  Gmail branding, "simulated" tag ON each notification (honesty). `data-reel-target="handoff-notice"`.
- Mount in `App.tsx` next to `ReelCallout`, gated `mode === "auto" && reelView.handoff?.sent`.
  Self-dismiss via an abort-safe timer (~handoff dwell) so it doesn't linger over later beats;
  cleared on unmount / reel reset (reelView cleared by `resetReelState`).

### T4 — CSS (`web/src/skin-claude.css`)
- `.cl-thread-pin` (+ count badge `.cl-thread-ct`), `.cl-thread`, `.cl-cmt` (+ `.cl-cmt-av`,
  `.cl-cmt-name`, `.cl-cmt-text`) using actor tokens; badge **pulse** on comment-land.
- `.cl-handoff-*` (notice stack, neutral icon, `.cl-handoff-sim` tag, `.cl-handoff-route` chip).
- `prefers-reduced-motion`: collapse flashes/pulses to instant; keep layout.
- Copy voice: no em-dashes, plain cadence.

### T5 — verify
- `npm run typecheck` clean; `npx vitest run` green (existing + new helper tests).
- `VITE_API_BASE="" npm run build:web` clean.
- Self-review: CSS selectors ↔ emitted classNames; live mode untouched (no handoff/threads →
  nothing renders); canonical folio ownership unchanged.

## Ship

Rebase onto latest `origin/main` (deepdive-voice session is shipping `worker/info/*` -v2 pages —
disjoint from these `web/src` files) → FF-merge → `build:web && wrangler deploy` → verify prod 200
+ `/blog`/`/info` still 200 (superset) → journal coord note → Neil smokes `?reel=collab`.

## Risks / notes

- The auto-expand/collapse + notice self-dismiss use cosmetic component-local timers (abort-safe via
  cleanup). This is the one place not driven by the post-apply dwell; kept self-contained and
  reduced-motion-safe. Timing is a soft-default to calibrate in P2.4.
- Still `?reel=collab`-only; not in rotation until P2.4.
