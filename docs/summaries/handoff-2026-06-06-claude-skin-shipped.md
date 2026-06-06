# Session Handoff: claude.ai-Lookalike Skin + Interactive Inline Boards — SHIPPED

**Date:** 2026-06-06
**Session Focus:** Second "skin" for the demo (`?skin=claude`): a claude.ai-lookalike left pane beside the unchanged amber-CRT Engineering Inspector, with truly interactive inline flight/hotel chooser boards (click a card → agent stages + promotes that exact candidate).
**Audience:** the `demo-enrichment` session (and any future UI session). Read this before touching `App.tsx`, `session-do.ts`, `shared/events.ts`, or the chat render path.

## Status

SHIPPED. Branch `claude-skin` FF-merged to `main` (`8ed367c` → `821f44e`), deployed to prod, worktree removed. Verified end-to-end on **production** with a scripted Puppeteer run: preset click → flight board → card click → exact candidate promoted → hotel board → card click → hotel promoted into the inline folio artifact. Zero console errors. 87 vitest tests green. Default board skin regression-checked: byte-identical behavior, zero `cl-*` elements, no board events on the wire.

- Live: https://voygent-demo.somotravel.workers.dev/?skin=claude (default `/` unchanged)
- Commits: `e1f2f11` (worker plumbing), `8ca11e7` (frontend), `821f44e` (polish)

## The two new axes — don't conflate them

1. **Skin** (client-side, visual): `data-skin` on `<html>` + React state. `board` (default) | `claude`. Resolution: `?skin=` param wins and persists → localStorage (`voygent-demo-skin`) → default. `web/src/lib/skin.ts`.
2. **Mode** (server-side, behavioral): `mode: "boards"` field on the `/chat` POST body, sent only by the claude skin. The DO **latches it from the first message of the session** (`session-do.ts` → `boardsMode`). Your auto-vs-interactive MODE axis is a sibling of this — extend the same POST field/latch pattern rather than inventing a parallel channel.

## What changed, file by file

### Worker (all additive — default path byte-identical when `mode` absent)
| File | Change |
|---|---|
| `shared/events.ts` | NEW `BoardCandidate` + `{ type:"board"; kind:"flight"\|"hotel"; boardId; tripId; candidates }` ServerEvent variant. |
| `worker/agent/boards.ts` (new) | `createBoardBuilder()` → stateful closure mapping `flight_search/flight_list/hotel_search/hotel_list` result JSON to a board event. Scrubs advisor keys (defense-in-depth), dedupes consecutive identical id-sets (so search→list doesn't double-render), returns null on empty/clear/non-board/malformed. Candidate ids are the real fixture ids → clicked picks always pass the `promote_*` fabrication guard in `replay.ts` (untouched). |
| `worker/agent/loop.ts` | Optional `buildBoard?: (toolName, resultText) => ServerEvent \| null` on `AgentLoopArgs`; called after the tool `done` emit, only on `ok` results. No callback → stream unchanged (test-guarded). |
| `worker/session-do.ts` | Reads `{ message, mode }`; latches `boardsMode` on first turn; appends NEW constant `BOARDS_WORKFLOW_OVERRIDE` (present-and-wait: "do NOT stage/promote until the traveler picks; cards render beside your message") to the seed message ONLY in boards mode. **`SYSTEM_HINT` itself untouched** — your enrichment prompt additions won't collide if you keep them as separate constants too. Session-scoped `boardBuilder` field. |

### Frontend
| File | Change |
|---|---|
| `web/src/timeline.ts` (new) | `TimelineItem = ChatMessage \| BoardItem \| ToolChipItem` (discriminated by `role`: `user/assistant/board/toolchip`). |
| `web/src/App.tsx` | **`messages: ChatMessage[]` is now `items: TimelineItem[]`** — the biggest merge surface for you. The SSE reducer in `send()`: text deltas append to the last item if it's an assistant message, else start a NEW assistant block (so prose after an inline board/chip becomes a fresh block); `tool` start/done push/update toolchip items (claude skin only); `board` pushes a BoardItem; `folio` also closes out still-open boards of the promoted kind (fallback when the user typed instead of clicking). `onPick` marks the board resolved and sends `"I'll take the {kind} option {id} ({summary})."` as a normal user turn. Board skin gets `items.filter(isChatMessage)` — ChatView itself untouched. `mode:"boards"` passed to `streamChat` only when skin===claude. |
| `web/src/ClaudeChatView.tsx` (new) | The claude.ai pane: Voygent wordmark header, persistent "Simulated claude.ai environment" ribbon, centered 48rem column, user bubbles / serif assistant prose (shared `Prose`), inline `ClaudeToolChip` + `BoardView` + `FolioArtifact` (inline folio card — renders nothing until something is promoted). **If you add folio DATA fields, extend `FolioArtifact` here AND `FolioPanel.tsx` (board skin).** |
| `web/src/ClaudeToolChip.tsx` (new) | Collapsible "Using Voygent — `<tool>`" pill, spinner→✓ from the tool event's start/done phases; expanded body shows the 120-char `summary`. |
| `web/src/BoardView.tsx` (new) | Clickable option cards; picked card highlighted, siblings dimmed, locked after pick/promote or while `busy`. |
| `web/src/skin-claude.css` (new) | ALL rules scoped `:root[data-skin="claude"]`, classes `cl-*`, tokens `--cl-*` defined on `.product` only. **Never override `--board/--ink/--amber` at `:root` here** — the Inspector reads those and must stay CRT. Also widens the live grid for the chat (`1.15fr 1fr`) in claude skin only. |
| `web/src/SkinSwitch.tsx` (new) | Fixed bottom-right "skin: board \| claude.ai" pill; hardcoded dark styling (deliberately not theme tokens) so it reads as demo-harness chrome in both skins. |
| `web/src/Inspector.tsx` | Optional `headExtra` slot; claude skin relocates `ThemeSwitch` there (its home header isn't rendered in claude skin). Everything else untouched. |
| `web/src/sse-client.ts` | Optional `mode?: "boards"` param → POST body (omitted otherwise). |
| `web/src/lib/skin.ts` (+test), `web/src/main.tsx`, `web/src/styles.css` | Skin resolution; css import; `.skin-switch`/`.ins-extra` styles. |

## Behavior notes you'll care about

- **Board event ordering:** boards are emitted during the tool loop (right after each list-tool `done`), so they land BEFORE the model's presentation prose. With haiku, the model tends to run `flight_search` + `hotel_search` in one turn → both boards render together, then the prose. Looks fine; don't "fix" without looking at it live.
- **Selection = a normal user turn.** No pause/resume, no special endpoint. The message format is `I'll take the {flight|hotel} option {id} ({summary}).` — the id is the load-bearing token.
- **Mode latch:** flipping the SkinSwitch mid-session changes visuals only; agent behavior (auto-pick vs wait) is fixed at the session's first message. New session (reload) re-latches.
- **Typed replies still work:** board stays open; when the agent promotes, the `folio` event closes it (dimmed, unclickable).
- **`kind:"excursion"` boards: DEFERRED** by agreement in the worktree journal — coordinate before adding a third kind.

## Deploy recipe (gotcha that bit this session)

`rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy` — without `VITE_API_BASE=""` the bundle bakes the `localhost:8787` fallback and prod silently loses `/presets` + `/chat`. (Recipe was already in older handoffs; it is the law.)

## Verification commands

- `npx vitest run` → 15 files / 87 tests (new: `worker/agent/boards.test.ts`, `web/src/lib/skin.test.ts`, 3 board cases in `loop.test.ts`).
- `npx tsc --noEmit` clean.
- Live E2E: open `/?skin=claude`, click a preset, click a flight card, watch promote + artifact; default `/` must show zero `cl-*` elements and auto-pick as before.

## What NOT to re-read

- `worker/mcp/replay.ts` — untouched by this session; the fabrication guard analysis is in this doc and `boards.test.ts`.
- The removed worktree `../voygent-demo-claude-skin` — gone; everything is in `main`.

## Open items (small, non-blocking)

- [ ] `claude-skin` branch still exists (merged) — delete with `git branch -d claude-skin` when convenient.
- [ ] Future `?skin=chatgpt`: extend `SKIN_IDS`, add a scoped CSS file + chat view fork; the axis was built for it.
- [ ] Hotel boards are single-pick in the UI; the prompt allows "one or more" via typed replies. Fine for demo; revisit if multi-select matters.
