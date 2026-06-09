# Reel P2.2 — Render Pick + Edit Interactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reel actually SHOW the first two advisor↔client interactions — a board "pick" (the chosen candidate gets an actor-colored selected state + "✓ {Actor} chose this") and a folio "edit" (the changed activity shows a before→after marker + "{Actor} edited" tag) — driven by the `ReelViewState` the P2.1 spine already maintains.

**Architecture:** P2.1 already feeds interaction frames into `reelView` (App holds it, setter-only). P2.2 binds the *value*, threads `reelView.selected` into `BoardView` and `reelView.edits` into the claude-skin `FolioArtifact` (in `ClaudeChatView.tsx`), and renders them. All non-trivial matching/styling logic goes into a pure, unit-tested helper module (`web/src/lib/reel-render.ts`) so the JSX stays thin (repo convention: test logic, not DOM). Actor colors: advisor = terracotta `#c96442`, client = slate-teal `#2f7d8c`, agent = `#6a4c93`.

**Tech Stack:** TypeScript, React, Vite, Vitest. Client-only, claude-skin native. No worker/MCP/`ServerEvent`/secret/D1 change.

**Source spec:** `docs/superpowers/specs/2026-06-09-reel-p2-screenplay-interactions-design.md`. Approved mockup: `demo.voygent.ai/mockups/reel-p2-interactions` (sections 1 "pick" + 2 "edit"). Builds on P2.1 (`docs/superpowers/plans/2026-06-09-reel-p2-1-spine.md`, shipped).

---

## Context (verified against the codebase, 2026-06-09)

- `reelView` is held in `App.tsx:110` as `const [, setReelView] = useState<ReelViewState>(emptyReelViewState)` — **setter-only**; P2.2 binds the value. `ReelViewState` (`web/src/lib/interaction.ts:10-15`) = `{ selected: Record<string,{candidateId,actor}>, edits: ReelEditMarker[], threads, handoff }`. `ReelEditMarker` (`interaction.ts:3`) = `{ path, was, now, tag, actor, reconciled }`. `Actor = "agent"|"advisor"|"client"` (`recording.ts:5`).
- `App.tsx` renders `<ClaudeChatView items folio onSend onPick advisor ... />` (~line 355-362). `ClaudeChatView` maps timeline items: `it.role === "board"` → `<BoardView board={it} busy advisor onPick />` (~line 203); folio → `<div className="cl-folio-inline"><FolioArtifact folio advisor /></div>` (~line 208). `FolioArtifact` is defined in `ClaudeChatView.tsx` (~lines 19-126); its day-by-day section is `<div className="cl-artifact-sec" data-reel-target="folio-days">` (~line 73) mapping `folio.days!.map((d,i) => <div className="cl-day">…<li> per activity …)`.
- `BoardView.tsx`: renders `cl-board`/`cl-option`; `const picked = board.resolvedId === c.id` (line 21); `cl-option-wrap` gets `picked`/`dimmed` classes; `cl-option-mark` shows "✓". Already has `data-reel-target={`board-${board.kind}`}` (line 17). `BoardItem` (`timeline.ts:7-15`) carries `boardId`.
- The reel's board comes from a `board` event (no `resolvedId`); the pick is a separate `interaction` frame that sets `reelView.selected[boardId]`. So in reel mode the "picked" candidate must be derived from `reelView.selected`, NOT `board.resolvedId`.
- `skin-claude.css`: `--cl-accent:#c96442` (line 19); `.cl-option-wrap.picked .cl-option { border-color: var(--cl-accent); background:#fdf6f2 }` (line 134); `.cl-option-wrap.dimmed { opacity:.45 }` (line 125); `.cl-option-mark` (line 146); reel overlay/spotlight `.cl-reel-spot` etc. (lines 318-355). No actor colors or edit-marker styles yet.
- Pacing dwell floors (pick/edit) and the highlight matcher targeting `interactionKind` already shipped in P2.1 — P2.2 does NOT touch pacing or the matcher; it only adds rendering + the DOM anchors a spotlight can point at.

## File Structure

| File | Responsibility |
|------|----------------|
| `web/src/lib/reel-render.ts` (create) | Pure helpers: `actorClass`, `actorLabel`, `pickedActor`, `editForActivity`. The only logic; unit-tested. |
| `web/src/lib/reel-render.test.ts` (create) | Unit tests for the helpers. |
| `web/src/App.tsx` (modify) | Bind `reelView` value; pass to `ClaudeChatView`. |
| `web/src/ClaudeChatView.tsx` (modify) | Thread `reelView.selected` → `BoardView`, `reelView.edits` → `FolioArtifact`; render edit markers on days; add per-day `data-reel-target`. |
| `web/src/BoardView.tsx` (modify) | Accept `selectedCandidate`; render the reel pick (actor-colored selected state + "✓ {Actor} chose this"). |
| `web/src/skin-claude.css` (modify) | Actor color custom props; pick actor-color styling; edit before→after marker; entrance flash (reduced-motion safe). |

---

## Task 1: Pure render helpers (actor styling + pick/edit matching)

**Files:** Create `web/src/lib/reel-render.ts`, `web/src/lib/reel-render.test.ts`.

- [ ] **Step 1: Write the failing test.** Create `web/src/lib/reel-render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { actorClass, actorLabel, pickedActor, editForActivity } from "./reel-render";
import type { ReelEditMarker } from "./interaction";

describe("actorClass / actorLabel", () => {
  it("maps actors to scoped classes and human labels", () => {
    expect(actorClass("advisor")).toBe("cl-actor-advisor");
    expect(actorClass("client")).toBe("cl-actor-client");
    expect(actorLabel("advisor")).toBe("Advisor");
    expect(actorLabel("client")).toBe("Client");
    expect(actorLabel("agent")).toBe("Agent");
  });
});

describe("pickedActor", () => {
  const selected = { "b-flight": { candidateId: "serp:70wngy", actor: "client" as const } };
  it("returns the actor when this candidate is the reel-selected one", () => {
    expect(pickedActor(selected, "b-flight", "serp:70wngy")).toBe("client");
  });
  it("returns null for a non-selected candidate or unknown board", () => {
    expect(pickedActor(selected, "b-flight", "serp:other")).toBeNull();
    expect(pickedActor(selected, "b-hotel", "serp:70wngy")).toBeNull();
    expect(pickedActor({}, "b-flight", "serp:70wngy")).toBeNull();
  });
});

describe("editForActivity", () => {
  const edits: ReelEditMarker[] = [
    { path: "days[1].activities[0]", was: "Free morning", now: "Cliffs of Moher", tag: "Advisor edited", actor: "advisor", reconciled: false },
  ];
  it("matches an edit to its exact day/activity indices", () => {
    expect(editForActivity(edits, 1, 0)?.now).toBe("Cliffs of Moher");
  });
  it("returns undefined when no edit targets that activity", () => {
    expect(editForActivity(edits, 1, 1)).toBeUndefined();
    expect(editForActivity(edits, 0, 0)).toBeUndefined();
    expect(editForActivity([], 1, 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run web/src/lib/reel-render.test.ts` → FAIL (`Cannot find module './reel-render'`).

- [ ] **Step 3: Write the implementation.** Create `web/src/lib/reel-render.ts`:

```ts
import type { Actor } from "./recording";
import type { ReelEditMarker } from "./interaction";

// Scoped CSS class for an actor's color treatment (defined in skin-claude.css).
export function actorClass(actor: Actor): string {
  return `cl-actor-${actor}`;
}

// Human-readable actor label for inline attribution ("Client chose this").
export function actorLabel(actor: Actor): string {
  return actor.charAt(0).toUpperCase() + actor.slice(1);
}

// The actor who reel-picked this candidate on this board, or null if it isn't the pick.
export function pickedActor(
  selected: Record<string, { candidateId: string; actor: Actor }>,
  boardId: string,
  candidateId: string,
): Actor | null {
  const s = selected[boardId];
  return s && s.candidateId === candidateId ? s.actor : null;
}

// The edit (if any) targeting a specific day's activity by index. Exact-path match
// against the screenplay's `days[i].activities[j]` lowering.
export function editForActivity(edits: ReelEditMarker[], dayIndex: number, activityIndex: number): ReelEditMarker | undefined {
  const want = `days[${dayIndex}].activities[${activityIndex}]`;
  return edits.find((e) => e.path === want);
}
```

- [ ] **Step 4: Run it to verify it passes.** `npx vitest run web/src/lib/reel-render.test.ts` → PASS (3 describes).

- [ ] **Step 5: tsc + commit.** `npx tsc --noEmit` (exit 0).

```bash
git add web/src/lib/reel-render.ts web/src/lib/reel-render.test.ts
git commit -m "feat(reel): pure render helpers for pick/edit (actor class/label, pick + edit matchers)"
```

---

## Task 2: Bind `reelView` value + thread it into ClaudeChatView (no visual change)

**Files:** Modify `web/src/App.tsx`, `web/src/ClaudeChatView.tsx`.

This wires the data path so P2.2's render tasks have `reelView.selected`/`.edits` available. No visible change yet; verified by tsc + build.

- [ ] **Step 1: Bind the value in App.** In `web/src/App.tsx`, change the setter-only binding (~line 110, currently `const [, setReelView] = useState<ReelViewState>(emptyReelViewState);` with the P2.1 comment above it) to bind the value too:

```ts
  const [reelView, setReelView] = useState<ReelViewState>(emptyReelViewState);
```

(Remove the leading-comma destructure. Keep the P2.1 comment but it can drop the "setter-only" note — change it to: `// Reel interaction view-state (picks/edits/threads/handoff); consumed by ClaudeChatView render.`)

- [ ] **Step 2: Pass `reelView` to ClaudeChatView.** Find the `<ClaudeChatView ... />` JSX (~line 355-362) and add the prop:

```tsx
        reelView={reelView}
```

- [ ] **Step 3: Accept + thread in ClaudeChatView.** In `web/src/ClaudeChatView.tsx`:
  - Add `ReelViewState` to imports: `import type { ReelViewState } from "./lib/interaction";`
  - Add `reelView: ReelViewState;` to the component's props type/interface.
  - Destructure `reelView` from props.
  - Where it renders the board (`<BoardView board={it} busy advisor onPick />`, ~line 203), add the selected prop:
    ```tsx
    selectedCandidate={reelView.selected[it.boardId]}
    ```
    (`BoardView`'s new optional prop is added in Task 3; tsc will flag it as unknown until then — that's expected. To keep THIS task's build green, complete Task 3 immediately after and run tsc once at the end of Task 3. Stage this task, do not run tsc-clean gate until Task 3. See note below.)
  - Where it renders the folio (`<FolioArtifact folio={folio} advisor={advisor} />`, ~line 208), add:
    ```tsx
    edits={reelView.edits}
    ```
    (`FolioArtifact`'s new `edits` prop is added in Task 4 — same staging note.)

> **Staging note:** Tasks 2, 3, 4 form one tsc-coherent unit (Task 2 passes props that Tasks 3/4 consume). Implement Task 2 → Task 3 → Task 4, then run the tsc-clean + full-suite gate at the END of Task 4 and commit Tasks 2-4 together. Each task's "verify" step that says "deferred to Task 4" means: write the code, don't gate yet.

- [ ] **Step 4: Stage (do not commit yet — paired with Tasks 3-4).**

```bash
git add web/src/App.tsx web/src/ClaudeChatView.tsx
```

---

## Task 3: BoardView renders the reel pick (actor-colored selected state)

**Files:** Modify `web/src/BoardView.tsx`.

- [ ] **Step 1: Add the prop + derive the picked state.** In `web/src/BoardView.tsx`:
  - Add imports: `import type { Actor } from "./lib/recording";` and `import { actorClass, actorLabel, pickedActor } from "./lib/reel-render";`
  - Extend the props with `selectedCandidate?: { candidateId: string; actor: Actor }`:
    ```tsx
    export function BoardView(
      { board, busy, advisor, onPick, selectedCandidate }:
      { board: BoardItem; busy: boolean; advisor: boolean; onPick: (board: BoardItem, c: BoardCandidate) => void; selectedCandidate?: { candidateId: string; actor: Actor } },
    ) {
    ```
  - The board is "locked" if it's resolved (live) OR there's a reel selection:
    ```tsx
      const reelSelectedId = selectedCandidate?.candidateId;
      const locked = board.resolved || !!board.resolvedId || !!reelSelectedId;
    ```

- [ ] **Step 2: Render the picked candidate with actor color + label.** In the `board.candidates.map((c) => { ... })`:
  - Derive picked + actor:
    ```tsx
      const reelActor = pickedActor(selectedCandidate ? { [board.boardId]: selectedCandidate } : {}, board.boardId, c.id);
      const picked = board.resolvedId === c.id || reelActor != null;
    ```
  - Add the actor class to the wrapper when reel-picked:
    ```tsx
      <div key={c.id} className={`cl-option-wrap ${picked ? "picked" : ""} ${picked && reelActor ? actorClass(reelActor) : ""} ${locked && !picked ? "dimmed" : ""}`}>
    ```
  - Replace the mark span so a reel pick reads "✓ {Actor} chose this" (live clicks keep the bare "✓"):
    ```tsx
      <span className="cl-option-mark" aria-hidden={reelActor ? undefined : "true"}>
        {picked ? (reelActor ? `✓ ${actorLabel(reelActor)} chose this` : "✓") : ""}
      </span>
    ```
  - Disable the button under reel lock too (already covered by `locked`).

- [ ] **Step 2b (DOM anchor for spotlight):** the board already has `data-reel-target={`board-${board.kind}`}` (line 17) — leave it; a `pick` spotlight anchors there. No change needed.

- [ ] **Step 3: Verify (tsc gate for Tasks 2-4) + full suite.**

Run: `npx tsc --noEmit`
Expected: exit 0 (now that BoardView accepts `selectedCandidate` and Task 4 adds `edits`, the props passed in Task 2 resolve). If `FolioArtifact` `edits` is still unknown, that's Task 4 — do Task 4 before this gate.

Run: `npx vitest run` → full suite green (no logic regression; rendering not DOM-tested here — the helper tests from Task 1 cover the logic).

- [ ] **Step 4: Stage (commit with Tasks 2 + 4).**

```bash
git add web/src/BoardView.tsx
```

---

## Task 4: FolioArtifact renders the edit before→after marker

**Files:** Modify `web/src/ClaudeChatView.tsx` (the `FolioArtifact` component within it).

- [ ] **Step 1: Add the `edits` prop.** In `web/src/ClaudeChatView.tsx`, find `function FolioArtifact({ folio, advisor }: { folio: FolioData; advisor: boolean })` (~line 19) and add `edits`:

```tsx
import { editForActivity, actorClass, actorLabel } from "./lib/reel-render";
import type { ReelEditMarker } from "./lib/interaction";
// ...
function FolioArtifact({ folio, advisor, edits }: { folio: FolioData; advisor: boolean; edits: ReelEditMarker[] }) {
```

- [ ] **Step 2: Render the marker on the edited activity.** In the day-by-day map (~lines 75-93), inside the `d.activities.map((a, j) => …)`, look up an edit for this `(i, j)` and render a before→after annotation + actor tag when present. The activity already shows `a.name` (which equals the edit's `now` once the folio event lands). Add the marker so the struck `was` + tag appear:

```tsx
              {d.activities.map((a, j) => {
                const au = safeHttpUrl(a.url);
                const edit = editForActivity(edits, i, j);
                return (
                  <li key={j} className={edit ? `cl-day-edited ${actorClass(edit.actor)}${edit.reconciled ? " reconciled" : ""}` : undefined}>
                    {edit && (
                      <span className="cl-edit-marker">
                        <span className="cl-edit-was">{edit.was}</span>
                        <span className="cl-edit-arrow" aria-hidden="true"> → </span>
                        <span className="cl-edit-tag">{actorLabel(edit.actor)} edited</span>
                      </span>
                    )}
                    {au ? <a href={au} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}
                    {a.description ? <span className="cl-day-desc"> — {a.description}</span> : null}
                  </li>
                );
              })}
```

(Use the existing `<li>` element from the current code — keep its existing children; only add the `className` and the `{edit && …}` marker. Match the existing JSX structure in the file; the snippet above shows the shape, adapt to the real element names/classes already present at ~line 86.)

- [ ] **Step 2b: Per-day spotlight anchor.** On the day container (`<div className="cl-day">`, ~line 76), add `data-reel-target={`folio-day-${i}`}` so an `edit` spotlight can anchor to the right day:

```tsx
                <div key={i} className="cl-day" data-reel-target={`folio-day-${i}`}>
```

- [ ] **Step 3: tsc-clean gate for Tasks 2-4 + full suite.**

Run: `npx tsc --noEmit` → exit 0 (all threaded props now resolve).
Run: `npx vitest run` → full suite green.
Run: `VITE_API_BASE="" npm run build:web` → builds (no runtime import error).

- [ ] **Step 4: Commit Tasks 2 + 3 + 4 together.**

```bash
git add web/src/App.tsx web/src/ClaudeChatView.tsx web/src/BoardView.tsx
git commit -m "feat(reel): render pick (actor-colored selected state) + edit (before→after marker) from reelView"
```

---

## Task 5: Claude-skin styling — actor colors, pick/edit treatment, entrance flash

**Files:** Modify `web/src/skin-claude.css`.

- [ ] **Step 1: Add actor color custom props.** In the `:root[data-skin="claude"]` block (near `--cl-accent:#c96442` at line 19), add:

```css
  --cl-actor-advisor: #c96442;   /* terracotta */
  --cl-actor-client:  #2f7d8c;   /* slate-teal */
  --cl-actor-agent:   #6a4c93;   /* muted violet */
  --cl-actor-advisor-soft: #fbeee8;
  --cl-actor-client-soft:  #e4eff1;
```

- [ ] **Step 2: Pick — actor-colored selected state + entrance flash.** Add (near the existing `.cl-option-wrap.picked` at line 134):

```css
/* Reel pick: actor color overrides the default accent on the picked option. */
.cl-option-wrap.picked.cl-actor-client .cl-option { border-color: var(--cl-actor-client); background: var(--cl-actor-client-soft); }
.cl-option-wrap.picked.cl-actor-advisor .cl-option { border-color: var(--cl-actor-advisor); background: var(--cl-actor-advisor-soft); }
.cl-option-wrap.picked.cl-actor-client .cl-option-mark { color: var(--cl-actor-client); white-space: nowrap; font: 600 11px/1 var(--cl-mono); }
.cl-option-wrap.picked.cl-actor-advisor .cl-option-mark { color: var(--cl-actor-advisor); white-space: nowrap; font: 600 11px/1 var(--cl-mono); }
.cl-option-wrap.picked.cl-actor-client, .cl-option-wrap.picked.cl-actor-advisor { animation: cl-reel-pick-flash .9s ease-out 1; }
@keyframes cl-reel-pick-flash {
  0% { box-shadow: 0 0 0 3px var(--cl-actor-client); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.cl-option-wrap.picked.cl-actor-advisor { animation-name: cl-reel-pick-flash-adv; }
@keyframes cl-reel-pick-flash-adv { 0% { box-shadow: 0 0 0 3px var(--cl-actor-advisor); } 100% { box-shadow: 0 0 0 0 transparent; } }
```

- [ ] **Step 3: Edit — before→after marker.** Add:

```css
/* Reel edit: struck "was" + actor tag above/beside the edited activity. */
.cl-day-edited .cl-edit-marker { display: inline-flex; align-items: center; gap: 6px; font: 500 12px/1.3 var(--cl-mono); margin-right: 6px; }
.cl-day-edited .cl-edit-was { color: var(--cl-muted); text-decoration: line-through; text-decoration-color: #00000040; }
.cl-day-edited .cl-edit-tag { font: 600 9.5px/1 var(--cl-mono); letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
.cl-day-edited.cl-actor-advisor .cl-edit-tag { color: var(--cl-actor-advisor); background: var(--cl-actor-advisor-soft); }
.cl-day-edited.cl-actor-client  .cl-edit-tag { color: var(--cl-actor-client);  background: var(--cl-actor-client-soft); }
.cl-day-edited:not(.reconciled) .cl-edit-marker { animation: cl-reel-edit-flash 1.1s ease-out 1; }
@keyframes cl-reel-edit-flash { 0% { background: #f4c9b6; } 100% { background: transparent; } }
/* Once the folio event reconciles the edit, quiet the marker (keep the tag, drop the flash). */
.cl-day-edited.reconciled .cl-edit-was { opacity: .7; }
```

- [ ] **Step 4: Reduced-motion safety.** Add (or extend an existing reduced-motion block):

```css
@media (prefers-reduced-motion: reduce) {
  .cl-option-wrap.picked, .cl-day-edited .cl-edit-marker { animation: none !important; }
}
```

- [ ] **Step 5: Verify build (CSS isn't unit-tested).**

Run: `npx tsc --noEmit` (exit 0) and `VITE_API_BASE="" npm run build:web` (the CSS is bundled — a syntax error fails the build).
Run: `npx vitest run` → full suite still green.

- [ ] **Step 6: Commit.**

```bash
git add web/src/skin-claude.css
git commit -m "feat(reel): claude-skin styling for actor-colored pick + edit before→after marker"
```

---

## Self-Review (completed during planning)

- **Spec coverage (P2.2 = pick + edit rendering):** pick rendering (Tasks 3 + 5), edit rendering (Tasks 4 + 5), actor attribution colors (Task 5), wired to the existing P2.1 dwell + matcher (no change needed — the spotlight anchors `board-${kind}` already exist for pick; `folio-day-${i}` added in Task 4 for edit). Comment + send-to-client are **P2.3** (out of scope here).
- **Logic-vs-DOM testing:** all non-trivial logic (actor class/label, pick match, edit-path match) is in `reel-render.ts` and unit-tested (Task 1). The JSX is thin and verified by tsc + `npm run build:web`; visual correctness is Neil's browser smoke after deploy (no headless Chrome in this env). This matches the repo's P1 convention.
- **Folio ownership preserved:** the edit marker is read-only over `reelView.edits` + the canonical `folio`; nothing here mutates folio. The `reconciled` flag (set by the P2.1 folio-event path) drives the quiet-vs-flash styling.
- **Backward compatibility:** `BoardView.selectedCandidate` and `FolioArtifact.edits` are additive props; live mode passes `selected={...[boardId]}` (undefined when no pick) and `edits={[]}` effectively (empty in live mode), so live rendering is unchanged. The default `/` board-skin (FolioPanel.tsx) is untouched.
- **Type consistency:** `selectedCandidate?: { candidateId: string; actor: Actor }` matches `ReelViewState.selected[boardId]`'s value type; `editForActivity(edits, i, j)` keys off the screenplay's `days[i].activities[j]` lowering (verified against `dublin-collab.screenplay.ts` which edits `days[1].activities[0]`).
- **No placeholders:** every step has concrete code + exact commands.

## Out of scope (P2.2 — comes in P2.3 / P2.4)

- Comment thread rendering (collapsible pin) and send-to-client email notification + "routed back" chip + "viewing as client" ribbon → **P2.3**.
- Authoring final calibrated reel content + end-card recap chips + dwell calibration + putting `collab` into rotation → **P2.4**.
- Day-title edits or non-activity edit paths (the proof reel only edits an activity; `editForActivity` covers the shipped case — a `days[i].title` matcher can be added in P2.4 if content needs it).
