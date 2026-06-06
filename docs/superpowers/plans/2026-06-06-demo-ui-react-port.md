# Departure-Board × CLI — React Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the live demo React app (`web/src/`) to the approved amber-CRT "Departure-Board × CLI" design, replacing the AI-default cyan-on-slate look — a visual port, not a logic rewrite.

**Architecture:** Two-file CSS split — `theme.css` (design system ported from the mockups' `_system.css`: tokens, `.flap`/`.term.crt`/`.pipe` primitives, 5 palettes, reduced-motion) + rewritten `styles.css` (app layout consuming those tokens). Layout becomes the interviewer two-column blend: product-left (chat + folio stacked) / engineering-right (Inspector inline, quiet rail until first tool, then expands). Three set-pieces wire to live data (split-flap, orchestration packet, CRT scanline). Each set-piece's testable logic lives in a pure helper under `web/src/lib/`, tested in the existing node vitest; React rendering is verified by typecheck + manual smoke.

**Tech Stack:** React 18 (function components, hooks), plain global CSS, Vite, vitest (node env), TypeScript strict, Cloudflare Workers static assets for hosting.

**Spec:** `docs/superpowers/specs/2026-06-06-demo-ui-react-port-design.md`

**Testing note (deviation from spec's "component tests"):** The repo has no DOM-test infra and tests only logic. This plan honors the spec's intent by testing the *logic* of each set-piece (char-splitting, theme normalization, idle→live derivation) as pure functions, and leaving the thin DOM/JSX rendering to typecheck + manual smoke. No new test dependencies are added.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `web/src/theme.css` | Create | Design system: tokens, `.flap`/`.term.crt`/`.pipe`/`.fold`/`.spark`/`.theme-switch` primitives, 5 palette variants, reduced-motion. Ported near-verbatim from `web/public/mockups/_system.css`. |
| `web/src/styles.css` | Rewrite | App layout + component classes consuming theme tokens. Old cyan-on-slate `:root` deleted. |
| `web/src/main.tsx` | Modify | Import `theme.css` before `styles.css`. |
| `web/src/lib/split-flap.ts` | Create | `splitFlapCells(text)` — one display cell per character. |
| `web/src/lib/split-flap.test.ts` | Create | Tests for `splitFlapCells`. |
| `web/src/lib/theme.ts` | Create | `THEME_IDS`, `ThemeId`, `DEFAULT_THEME`, `THEME_STORAGE_KEY`, `normalizeTheme()`, `applyTheme()`. |
| `web/src/lib/theme.test.ts` | Create | Tests for `normalizeTheme`. |
| `web/src/lib/inspector-state.ts` | Create | `engState(toolCount, collapsed)` → `"idle"|"live"|"collapsed"`. |
| `web/src/lib/inspector-state.test.ts` | Create | Tests for `engState`. |
| `web/src/SplitFlap.tsx` | Create | Renders `.flap` cells, replays `.flip` on mount/text-change. |
| `web/src/ThemeSwitch.tsx` | Create | 5-palette switcher; writes `data-theme` + `localStorage`. |
| `web/src/App.tsx` | Modify | Two-column layout, inline Inspector, `data-eng` state, footer, mount `ThemeSwitch`. |
| `web/src/Inspector.tsx` | Modify | Inline (not fixed drawer); `collapsed`/`onToggleCollapse` props; `.pipe` packet; `.term.crt`. |
| `web/src/FolioPanel.tsx` | Modify | Boarding-pass cards; `SplitFlap` on title + flight route codes. |
| `web/src/ChatView.tsx` | Unchanged | Its existing classNames (`.chat`/`.bubble`/`.preset`/`.chip`/`.chat form`) are restyled entirely via the `styles.css` rewrite — no JSX edit needed. |
| `vitest.config.ts` | Modify | Add `web/src/**/*.test.ts` to `include`. |

---

## Task 1: Port the design system to `theme.css`

**Files:**
- Create: `web/src/theme.css`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Copy the mockup system verbatim**

Run from repo root:
```bash
cp web/public/mockups/_system.css web/src/theme.css
```

- [ ] **Step 2: Trim the cut-switcher block (mockups-only)**

In `web/src/theme.css`, delete the `.cut-switch` block (the section headed `shared: cut switcher`, the rules `.cut-switch`, `.cut-switch a`, `.cut-switch a:hover`, `.cut-switch a[aria-current]`). It's for the throwaway mockup index only; the live app has no cut switcher. Leave everything else (tokens, `.flap`, `.term`, `.pipe`, `.spark`, `.odo`, `.fold`, theme variants, `.theme-switch`, reduced-motion) intact.

- [ ] **Step 3: Import it before `styles.css`**

Edit `web/src/main.tsx`. Change the first line so `theme.css` is imported first (tokens load before app layout):
```tsx
import "./theme.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Verify typecheck + build still pass**

Run: `npm run typecheck && VITE_API_BASE="" npm run build:web`
Expected: typecheck clean; build succeeds (the old `styles.css` `:root` still wins for now, so the app looks unchanged — that's correct; the visual flip happens in Task 8).

- [ ] **Step 5: Commit**

```bash
git add web/src/theme.css web/src/main.tsx
git commit -m "feat(demo): port amber-CRT design system to web/src/theme.css"
```

---

## Task 2: `splitFlapCells` helper (TDD) + vitest web include

**Files:**
- Modify: `vitest.config.ts`
- Create: `web/src/lib/split-flap.ts`
- Test: `web/src/lib/split-flap.test.ts`

- [ ] **Step 1: Extend vitest to discover web/src logic tests**

Edit `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["worker/**/*.test.ts", "shared/**/*.test.ts", "web/src/**/*.test.ts"] } });
```

- [ ] **Step 2: Write the failing test**

Create `web/src/lib/split-flap.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { splitFlapCells } from "./split-flap";

describe("splitFlapCells", () => {
  it("returns one cell per character", () => {
    expect(splitFlapCells("CDG")).toEqual(["C", "D", "G"]);
  });
  it("preserves spaces as their own cells", () => {
    expect(splitFlapCells("A B")).toEqual(["A", " ", "B"]);
  });
  it("treats a multi-byte arrow as a single cell", () => {
    expect(splitFlapCells("JFK→CUN")).toHaveLength(7);
  });
  it("returns an empty array for an empty string", () => {
    expect(splitFlapCells("")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run web/src/lib/split-flap.test.ts`
Expected: FAIL — `Failed to resolve import "./split-flap"`.

- [ ] **Step 4: Write the minimal implementation**

Create `web/src/lib/split-flap.ts`:
```ts
// Split a string into split-flap display cells — one cell per visible character.
// `Array.from` iterates by Unicode code point, so a glyph like "→" is one cell.
// Spaces are kept as their own cell so route codes ("JFK → CUN") retain their gaps
// on the board.
export function splitFlapCells(text: string): string[] {
  return Array.from(text);
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run web/src/lib/split-flap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts web/src/lib/split-flap.ts web/src/lib/split-flap.test.ts
git commit -m "feat(demo): splitFlapCells helper + vitest web/src include"
```

---

## Task 3: `normalizeTheme` helper (TDD)

**Files:**
- Create: `web/src/lib/theme.ts`
- Test: `web/src/lib/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/theme.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeTheme, DEFAULT_THEME, THEME_IDS } from "./theme";

describe("normalizeTheme", () => {
  it("passes through a known theme id", () => {
    expect(normalizeTheme("phosphor")).toBe("phosphor");
  });
  it("falls back to the default for an unknown value", () => {
    expect(normalizeTheme("bogus")).toBe(DEFAULT_THEME);
  });
  it("falls back to the default for null/empty", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
  });
  it("default theme is amber and is a valid id", () => {
    expect(DEFAULT_THEME).toBe("amber");
    expect(THEME_IDS).toContain(DEFAULT_THEME);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run web/src/lib/theme.test.ts`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/theme.ts`:
```ts
// The five palettes defined in theme.css (data-theme variants). Amber is the
// confirmed default; the others remain available via the in-app switcher.
export const THEME_IDS = ["amber", "phosphor", "sodium", "dusk", "paper"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "amber";
export const THEME_STORAGE_KEY = "voygent-demo-theme";

// Coerce any stored/unknown string to a valid ThemeId, defaulting to amber.
export function normalizeTheme(raw: string | null | undefined): ThemeId {
  return (THEME_IDS as readonly string[]).includes(raw ?? "") ? (raw as ThemeId) : DEFAULT_THEME;
}

// Apply a theme to the document and persist it. Thin DOM/storage wrapper (not
// unit-tested — the logic under test is normalizeTheme). Guards storage so a
// blocked localStorage (private mode) never throws.
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

// Read the persisted theme (or default) without throwing if storage is blocked.
export function loadTheme(): ThemeId {
  try { return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)); } catch { return DEFAULT_THEME; }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run web/src/lib/theme.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/theme.ts web/src/lib/theme.test.ts
git commit -m "feat(demo): theme helper — normalizeTheme + applyTheme/loadTheme"
```

---

## Task 4: `engState` helper (TDD)

**Files:**
- Create: `web/src/lib/inspector-state.ts`
- Test: `web/src/lib/inspector-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/inspector-state.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { engState } from "./inspector-state";

describe("engState", () => {
  it("is idle (quiet rail) before any tool fires", () => {
    expect(engState(0, false)).toBe("idle");
  });
  it("is live once at least one tool has fired", () => {
    expect(engState(1, false)).toBe("live");
  });
  it("is collapsed when manually collapsed, regardless of activity", () => {
    expect(engState(5, true)).toBe("collapsed");
    expect(engState(0, true)).toBe("collapsed");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run web/src/lib/inspector-state.test.ts`
Expected: FAIL — cannot resolve `./inspector-state`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/inspector-state.ts`:
```ts
// Visibility state of the engineering (Inspector) column. CSS keys the stage
// grid off this: "live" expands to the 0.78fr/1fr two-column layout; "idle" and
// "collapsed" both render the dimmed narrow rail. "idle" = quiet until the first
// trip; "collapsed" = the viewer manually re-quieted it after activity began.
export type EngState = "idle" | "live" | "collapsed";

export function engState(toolCount: number, collapsed: boolean): EngState {
  if (collapsed) return "collapsed";
  return toolCount > 0 ? "live" : "idle";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run web/src/lib/inspector-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-state.ts web/src/lib/inspector-state.test.ts
git commit -m "feat(demo): engState helper for Inspector idle/live/collapsed"
```

---

## Task 5: `SplitFlap` component

**Files:**
- Create: `web/src/SplitFlap.tsx`

- [ ] **Step 1: Write the component**

Create `web/src/SplitFlap.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { splitFlapCells } from "./lib/split-flap";

// A row of airport split-flap cells that clack in with a staggered flip whenever
// the text changes. Uses the `.flap` / `.flap.flip` primitives from theme.css;
// reduced-motion users get the end state (handled in theme.css). `as` lets the
// caller pick the wrapping element (default span) for semantic fit.
export function SplitFlap(
  { text, as: Tag = "span", className = "" }:
  { text: string; as?: "span" | "div"; className?: string },
) {
  const cells = splitFlapCells(text);
  // Re-trigger the flip animation on every text change by toggling the `flip`
  // class off then on across a frame (so the CSS animation restarts).
  const [flip, setFlip] = useState(true);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    setFlip(false);
    const id = requestAnimationFrame(() => setFlip(true));
    return () => cancelAnimationFrame(id);
  }, [text]);

  return (
    <Tag className={`flap ${flip ? "flip" : ""} ${className}`.trim()} aria-label={text}>
      {cells.map((c, i) => (
        <b key={i} aria-hidden="true">{c === " " ? " " : c}</b>
      ))}
    </Tag>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: clean (no unused locals, strict OK).

- [ ] **Step 3: Commit**

```bash
git add web/src/SplitFlap.tsx
git commit -m "feat(demo): SplitFlap component (replays clack on text change)"
```

---

## Task 6: `ThemeSwitch` component

**Files:**
- Create: `web/src/ThemeSwitch.tsx`

- [ ] **Step 1: Write the component**

Create `web/src/ThemeSwitch.tsx`. The swatch `--a`/`--b` colors mirror each palette's board + accent from `theme.css`:
```tsx
import { useEffect, useState } from "react";
import { THEME_IDS, type ThemeId, applyTheme, loadTheme } from "./lib/theme";

// Discreet 5-palette switcher. Amber is the default; the pick persists to
// localStorage and is restored on mount. Uses the `.theme-switch` primitive from
// theme.css. Each swatch shows the palette's board colour split with its accent.
const SWATCH: Record<ThemeId, { a: string; b: string }> = {
  amber:    { a: "#0c0a07", b: "#f5a623" },
  phosphor: { a: "#050a06", b: "#3fb950" },
  sodium:   { a: "#0c0a07", b: "#ff8c42" },
  dusk:     { a: "#15101b", b: "#ff9e64" },
  paper:    { a: "#f4f0e6", b: "#c2611c" },
};

export function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeId>("amber");

  // Restore persisted theme on mount.
  useEffect(() => { const t = loadTheme(); setTheme(t); applyTheme(t); }, []);

  function pick(id: ThemeId) { setTheme(id); applyTheme(id); }

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      <span className="lab">theme</span>
      {THEME_IDS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => pick(id)}
          title={id}
        >
          <span className="sw" style={{ ["--a" as string]: SWATCH[id].a, ["--b" as string]: SWATCH[id].b }} />
          {id}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/ThemeSwitch.tsx
git commit -m "feat(demo): ThemeSwitch — 5-palette switcher, localStorage-persisted"
```

---

## Task 7: Restructure `App.tsx` + `Inspector.tsx`

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/Inspector.tsx`

- [ ] **Step 1: Rewrite `App.tsx` to the two-column blend**

Replace the entire contents of `web/src/App.tsx` with:
```tsx
import { useEffect, useRef, useState } from "react";
import { streamChat } from "./sse-client";
import { ChatView, type ChatMessage, type Preset } from "./ChatView";
import { FolioPanel } from "./FolioPanel";
import type { FolioData } from "../../shared/events";
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead } from "./Inspector";
import { ThemeSwitch } from "./ThemeSwitch";
import { engState } from "./lib/inspector-state";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [geoCity, setGeoCity] = useState<string | null>(null);
  const sessionId = useRef(crypto.randomUUID()).current;
  const [collapsed, setCollapsed] = useState(false);
  const [insTools, setInsTools] = useState<InsTool[]>([]);
  const [insTurns, setInsTurns] = useState<InsTurn[]>([]);
  const [insSummaries, setInsSummaries] = useState<InsSummary[]>([]);
  const [insSavings, setInsSavings] = useState<InsSavings[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/presets`)
      .then((r) => r.json() as Promise<{ presets?: Preset[]; geo?: { city?: string | null } }>)
      .then((d) => { setPresets(d.presets ?? []); setGeoCity(d.geo?.city ?? null); })
      .catch(() => { /* welcome falls back to a generic greeting + text box */ });
  }, []);

  function showError(msg: string) {
    setMessages((m) => {
      const c = [...m];
      if (c.length && c[c.length - 1].role === "assistant" && c[c.length - 1].text === "") {
        c[c.length - 1] = { role: "assistant", text: `⚠ ${msg}` };
      } else {
        c.push({ role: "assistant", text: `⚠ ${msg}` });
      }
      return c;
    });
  }

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true); setTools([]);
    try {
      await streamChat(API_BASE, sessionId, text, (e) => {
        if (e.type === "text") setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + e.delta }; return c; });
        else if (e.type === "tool" && e.phase === "start") setTools((t) => [...t, e.tool]);
        else if (e.type === "folio") setFolio(e.folio);
        else if (e.type === "error") showError(e.message);
        else if (e.type === "inspector") {
          if (e.kind === "tool") setInsTools((t) => [...t, e]);
          else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
          else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
          else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
          else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
        }
      });
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const eng = engState(insTools.length, collapsed);

  return (
    <div className="app">
      <header>
        <span className="brand"><strong>Voygent</strong> <span className="sub">AI travel-planning agent</span></span>
        <span className="by">built by Neil Roberts</span>
        <ThemeSwitch />
      </header>
      <main className="stage" data-eng={eng}>
        <section className="product">
          <ChatView messages={messages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
          <FolioPanel folio={folio} />
        </section>
        <section className="engineering" data-eng={eng}>
          <Inspector
            collapsed={eng !== "live"}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            tools={insTools} turns={insTurns} summaries={insSummaries}
            savings={insSavings} overhead={insOverhead}
          />
        </section>
      </main>
      <footer className="meta">This interface was itself built by a coding agent.</footer>
    </div>
  );
}
```

- [ ] **Step 2: Update the `Inspector` signature (props)**

In `web/src/Inspector.tsx`, replace the component signature + the `if (!open) return null;` guard. Find:
```tsx
export function Inspector(
  { open, onClose, tools, turns, summaries, savings, overhead }:
  { open: boolean; onClose: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[]; savings: InsSavings[]; overhead: InsOverhead[] },
) {
  const [showCost, setShowCost] = useState(false);
  if (!open) return null;
```
Replace with:
```tsx
export function Inspector(
  { collapsed, onToggleCollapse, tools, turns, summaries, savings, overhead }:
  { collapsed: boolean; onToggleCollapse: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[]; savings: InsSavings[]; overhead: InsOverhead[] },
) {
  const [showCost, setShowCost] = useState(false);
```
(The column visibility is now driven by CSS via `data-eng`; the Inspector always renders its content.)

- [ ] **Step 3: Update the Inspector header (collapse toggle + CRT classes)**

In `web/src/Inspector.tsx`, find the opening `<aside>` and header:
```tsx
    <aside className="inspector" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong>Engineering Inspector</strong>
        <button className="ins-close" onClick={onClose} aria-label="Close inspector">×</button>
      </div>
```
Replace with:
```tsx
    <aside className="inspector term crt" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong><span className="prompt">▌</span> Engineering Inspector</strong>
        <button className="ins-collapse" onClick={onToggleCollapse} aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}>
          {collapsed ? "▸" : "▾"}
        </button>
      </div>
```

- [ ] **Step 4: Re-skin the stage graph as a live `.pipe` with traveling packet**

In `web/src/Inspector.tsx`, find the `ins-graph` block:
```tsx
        <div className="ins-graph">
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`ins-node ${stageActive(s) ? "on" : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="ins-arrow">→</span> : null}
            </span>
          ))}
        </div>
```
Replace with:
```tsx
        <div className="pipe">
          {STAGES.some(stageActive) && <span className="packet" aria-hidden="true" />}
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`node ${stageActive(s) ? "active" : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="arr">→</span> : null}
            </span>
          ))}
        </div>
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: clean. (If `tsc` flags an unused import in `Inspector.tsx`, none should remain — `useState` is still used by `showCost`/`ToolRow`/`Card`.)

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/Inspector.tsx
git commit -m "feat(demo): two-column blend layout + inline CRT Inspector with live pipe"
```

---

## Task 8: Re-skin `FolioPanel.tsx` (split-flap title + route codes)

**Files:**
- Modify: `web/src/FolioPanel.tsx`

- [ ] **Step 1: Wire `SplitFlap` into the folio**

Replace the entire contents of `web/src/FolioPanel.tsx` with:
```tsx
import type { FolioData, FolioFlight, FolioHotel } from "../../shared/events";
import { SplitFlap } from "./SplitFlap";

function stopsLabel(stops?: number): string | null {
  if (stops == null) return null;
  return stops === 0 ? "nonstop" : stops === 1 ? "1 stop" : `${stops} stops`;
}

function FlightCard({ f }: { f: FolioFlight }) {
  const meta = [f.carrier, f.date, stopsLabel(f.stops), f.cabin].filter(Boolean).join(" · ");
  const code = f.route ?? f.label;
  return (
    <div className="card fade-in">
      <div className="card-main">
        <div className="card-title"><SplitFlap text={code} /></div>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
      {f.price && <div className="card-price">{f.price}</div>}
    </div>
  );
}

function HotelCard({ h }: { h: FolioHotel }) {
  const meta = [
    h.area,
    typeof h.stars === "number" ? `${h.stars}★` : null,
    typeof h.nights === "number" ? `${h.nights} nights` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="card fade-in">
      <div className="card-main">
        <div className="card-title">{h.name}</div>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
      <div className="card-price">
        {h.price ?? ""}
        {h.perNight && <span className="card-sub">{h.perNight}/night</span>}
      </div>
    </div>
  );
}

export function FolioPanel({ folio }: { folio: FolioData | null }) {
  if (!folio) return <aside className="folio empty">Your trip-folio will build here as the agent works…</aside>;
  return (
    <aside className="folio">
      <h2 className="folio-title"><SplitFlap text={folio.title} as="span" /></h2>
      <section>
        <h3>Flights</h3>
        {folio.flights.length === 0 ? <p>—</p> : folio.flights.map((f, i) => <FlightCard key={i} f={f} />)}
      </section>
      <section>
        <h3>Hotels</h3>
        {folio.hotels.length === 0 ? <p>—</p> : folio.hotels.map((h, i) => <HotelCard key={i} h={h} />)}
      </section>
    </aside>
  );
}
```
(Flight route codes use the split-flap board; hotel names stay in prose — split-flap is for codes/titles, not long names.)

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/FolioPanel.tsx
git commit -m "feat(demo): split-flap folio title + flight route codes"
```

---

## Task 9: Rewrite `styles.css` to the amber-CRT system

**Files:**
- Rewrite: `web/src/styles.css`

This is the visual flip. The new `styles.css` defines NO `:root` (tokens come from `theme.css`) and styles every app/component class against those tokens. ChatView keeps its existing classNames, so they're styled here too.

- [ ] **Step 1: Replace the entire contents of `web/src/styles.css` with:**

```css
/* App layout + components for the demo. Tokens/primitives live in theme.css.
   Look: warm amber-CRT "Departure-Board × CLI". No :root here. */

html, body, #root { height: 100%; margin: 0; }
#root { display: block; }

.app { display: flex; flex-direction: column; height: 100vh; background: var(--board); color: var(--ink); }

/* ---- header ---- */
.app > header {
  display: flex; align-items: baseline; gap: var(--s4);
  padding: var(--s3) var(--s6); border-bottom: 1px solid var(--line);
  background: var(--board-2); font-size: var(--t-13); color: var(--muted);
}
.app > header .brand strong { color: var(--ink); font-size: var(--t-18); letter-spacing: -.01em; }
.app > header .brand .sub { color: var(--muted); margin-left: 6px; }
.app > header .by { margin-left: auto; color: var(--muted-2); font: 500 var(--t-12)/1 var(--mono); }

/* ---- stage: product | engineering ---- */
.stage { flex: 1; display: grid; gap: 1px; background: var(--line); min-height: 0; transition: grid-template-columns .4s var(--ease); }
.stage[data-eng="live"]      { grid-template-columns: 0.78fr 1fr; }
.stage[data-eng="idle"],
.stage[data-eng="collapsed"] { grid-template-columns: 1fr 46px; }

.product { background: var(--board); min-height: 0; display: grid; grid-template-rows: 1fr auto; }
.engineering { background: var(--board); min-height: 0; overflow: hidden; }
.engineering[data-eng="idle"],
.engineering[data-eng="collapsed"] { opacity: .62; }

/* ---- chat ---- */
.chat { display: flex; flex-direction: column; min-height: 0; }
.messages { flex: 1; overflow-y: auto; padding: var(--s6); display: flex; flex-direction: column; gap: var(--s3); }
.bubble { max-width: 78%; padding: var(--s3) var(--s4); border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; }
.bubble.user { align-self: flex-end; background: var(--amber); color: var(--board); border-bottom-right-radius: 4px; }
.bubble.assistant { align-self: flex-start; background: var(--board-2); border: 1px solid var(--line); color: var(--ink); border-bottom-left-radius: 4px; }
.welcome { margin: auto 0; padding: var(--s2) var(--s1); animation: fadeIn .5s ease both; }
.welcome-h { font-size: var(--t-32); letter-spacing: -.02em; margin: 0 0 var(--s2); color: var(--ink); }
.welcome-sub { margin: 0 0 var(--s6); color: var(--muted); max-width: 52ch; }
.presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--s3); }
.preset {
  display: flex; flex-direction: column; gap: 3px; text-align: left;
  padding: var(--s3) var(--s4); border: 1px solid var(--line); border-radius: var(--r);
  background: var(--board-2); color: var(--ink); cursor: pointer; font: inherit;
  transition: border-color .15s, transform .1s;
}
.preset:hover:not(:disabled) { border-color: var(--amber); transform: translateY(-1px); }
.preset:disabled { opacity: .55; cursor: default; }
.preset-label { font-weight: 600; color: var(--ink); }
.preset-sub { font-size: var(--t-12); color: var(--muted); font-variant-numeric: tabular-nums; }
.bubble .prose-p { margin: 0 0 var(--s2); }
.bubble .prose-p:last-child { margin-bottom: 0; }
.bubble .prose-ul { margin: var(--s1) 0 var(--s2); padding-left: 18px; }
.bubble .prose-ul:last-child { margin-bottom: 0; }
.bubble .prose-ul li { margin: 2px 0; }
.typing { display: inline-flex; gap: 4px; padding: 2px 0; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); opacity: .5; animation: dotblink 1.2s infinite both; }
.typing i:nth-child(2) { animation-delay: .2s; }
.typing i:nth-child(3) { animation-delay: .4s; }
@keyframes dotblink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: .9; } }
.tools { display: flex; flex-wrap: wrap; gap: 6px; align-self: flex-start; }
.chip {
  font: 500 var(--t-12)/1 var(--mono); padding: 5px 10px; border-radius: 999px;
  background: var(--board-3); color: var(--amber-hi); border: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
.chat form { display: flex; gap: var(--s2); padding: var(--s3) var(--s6); border-top: 1px solid var(--line); background: var(--board-2); }
.chat form input {
  flex: 1; padding: var(--s3) var(--s4); border: 1px solid var(--line); border-radius: var(--r);
  font: inherit; outline: none; background: var(--board); color: var(--ink);
}
.chat form input::placeholder { color: var(--muted-2); }
.chat form input:focus { border-color: var(--amber); }
.chat form button {
  padding: var(--s3) var(--s4); border: none; border-radius: var(--r); background: var(--amber); color: var(--board);
  font: inherit; font-weight: 600; cursor: pointer;
}
.chat form button:disabled { opacity: .5; cursor: default; }

/* ---- folio (boarding-pass) ---- */
.folio { overflow-y: auto; padding: var(--s6); background: var(--board-2); border-top: 1px solid var(--line); }
.folio.empty { color: var(--muted); display: flex; align-items: center; justify-content: center; text-align: center; font-style: italic; }
.folio-title { margin: 0 0 var(--s2); font-size: var(--t-18); }
.folio h3 { margin: var(--s4) 0 var(--s2); font: 500 var(--t-12)/1 var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.folio section p { color: var(--muted); margin: 0; }
.card {
  display: flex; align-items: flex-start; gap: var(--s3);
  padding: var(--s3) var(--s4); border: 1px solid var(--line); border-radius: var(--r); margin-bottom: var(--s2);
  background: var(--board); font-size: var(--t-15);
}
.card-main { flex: 1; min-width: 0; }
.card-title { font-weight: 600; color: var(--ink); }
.card-meta { margin-top: 3px; font-size: var(--t-13); color: var(--muted); }
.card-price { text-align: right; font: 700 var(--t-15)/1 var(--mono); color: var(--amber-hi); font-variant-numeric: tabular-nums; white-space: nowrap; }
.card-sub { display: block; font-weight: 400; font-size: var(--t-12); color: var(--muted); margin-top: 2px; }
.fade-in { animation: fadeIn .4s ease both; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ---- inspector (inline CRT) ---- */
.inspector { height: 100%; overflow-y: auto; padding: var(--s4) var(--s4) var(--s8); }
.engineering[data-eng="idle"] .inspector,
.engineering[data-eng="collapsed"] .inspector { padding: var(--s4) 6px; }
.ins-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s3); position: relative; z-index: 3; }
.ins-head strong { color: var(--ink); font-size: var(--t-15); }
.ins-collapse { background: none; border: 1px solid var(--line); color: var(--muted); width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font: 500 var(--t-13)/1 var(--mono); }
.ins-collapse:hover { color: var(--ink); border-color: var(--muted); }
.ins-region { position: relative; z-index: 3; }
.ins-region h3 { font: 500 var(--t-12)/1 var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: var(--s4) 0 var(--s2); }
.ins-timeline { margin: var(--s3) 0; }
.ins-empty { color: var(--muted-2); font: 400 var(--t-13)/1.6 var(--mono); }
.ins-tool { border-top: 1px solid var(--line); }
.ins-tool.err .ins-tool-head { color: var(--red); }
.ins-tool-head { width: 100%; display: flex; justify-content: space-between; background: none; border: none; color: var(--ink); padding: 6px 0; cursor: pointer; font: 400 var(--t-13)/1 var(--mono); }
.ins-lat { color: var(--muted); }
.ins-raw { background: #000; border-radius: 5px; padding: var(--s2); overflow-x: auto; font: 400 var(--t-12)/1.5 var(--mono); max-height: 280px; color: var(--ink); }
.ins-scoreboard { margin: var(--s3) 0; line-height: 1.7; color: var(--ink); font-variant-numeric: tabular-nums; }
.ins-toggle { font: 500 var(--t-12)/1 var(--mono); padding: 3px 9px; border: 1px solid var(--line); border-radius: 5px; background: var(--board-3); color: var(--ink); cursor: pointer; }
.ins-tiers { width: 100%; border-collapse: collapse; margin: var(--s2) 0; }
.ins-tiers th, .ins-tiers td { text-align: left; padding: 4px 5px; border-bottom: 1px solid var(--line); font-size: var(--t-12); font-variant-numeric: tabular-nums; }
.ins-tiers th { color: var(--muted); font-weight: 500; }
.ins-note { color: var(--muted-2); font-size: var(--t-12); }
.ins-sources summary { cursor: pointer; color: var(--muted); font-size: var(--t-12); }
.ins-saved h4, .ins-overhead h4 { font-size: var(--t-12); color: var(--muted); margin: var(--s4) 0 var(--s1); text-transform: uppercase; letter-spacing: .06em; }
.ins-saved-total { color: var(--phosphor); font-weight: 600; font-variant-numeric: tabular-nums; }
.ins-saved ul { margin: var(--s1) 0; padding-left: 16px; } .ins-saved li { margin: 3px 0; }
.ins-card { border-top: 1px solid var(--line); }
.ins-card-head { width: 100%; text-align: left; background: none; border: none; color: var(--ink); padding: 6px 0; cursor: pointer; font: 400 var(--t-13)/1 var(--mono); }
.ins-card-body p { margin: var(--s1) 0; } .ins-src { color: var(--amber-hi); font-size: var(--t-12); word-break: break-all; }
.ins-cost-rows { margin: var(--s2) 0; color: var(--ink); }

/* ---- footer meta-note ---- */
.app > footer.meta { padding: var(--s2) var(--s6); border-top: 1px solid var(--line); background: var(--board-2); color: var(--muted-2); font: 400 var(--t-12)/1 var(--mono); text-align: center; }

/* ---- responsive: stack product over engineering, product first ---- */
@media (max-width: 760px) {
  .stage, .stage[data-eng="live"], .stage[data-eng="idle"], .stage[data-eng="collapsed"] {
    grid-template-columns: 1fr; grid-template-rows: auto auto;
  }
  .engineering { max-height: 70vh; }
}
```

- [ ] **Step 2: Build and smoke-test the look**

Run a local worker in one shell: `npm run dev:worker`
Run the web dev server in another: `npm run dev:web`
Open the printed localhost URL. Verify:
- Amber-CRT look (no cyan/slate); header brand + theme switcher visible.
- Before any trip: engineering column is a dimmed narrow rail; chat welcome reads in Space Grotesk.
- Click a preset → tools fire → engineering column expands to the CRT Inspector with the `.pipe` stages lighting up and the packet traveling; folio title + flight codes clack in on split-flap cells.
- The collapse `▾` re-quiets the column to the rail; `▸` expands it.
- ThemeSwitch flips all five palettes; reload preserves the pick.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles.css
git commit -m "feat(demo): rewrite styles.css to amber-CRT departure-board system"
```

---

## Task 10: Full verification + production build

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean (0 errors).

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: all pass — existing worker/shared tests + the 3 new `web/src/lib/*.test.ts` suites (11 new assertions total).

- [ ] **Step 3: Production build**

Run: `rm -rf dist-web && VITE_API_BASE="" npm run build:web`
Expected: build succeeds; `dist-web/` contains the bundled SPA. (The `outDir not emptied` warning is benign — the `rm -rf` handles it.)

- [ ] **Step 4: External review of the risky integration**

Run the `/codex-review` skill against the working diff (per the repo's discipline for production-demo component changes). Focus areas: the `App.tsx` layout restructure, the `Inspector.tsx` props/guard refactor, and the `data-eng` grid transitions. Address any findings, re-run Steps 1–3, then re-commit.

- [ ] **Step 5: Deploy decision (hand to Neil)**

Do NOT deploy automatically. Surface to Neil: the build is ready; deploy recipe is `npx wrangler deploy` from repo root (serves the new `dist-web/` as Workers static assets). The hosted `/mockups/` stay as a design reference unless he asks to remove them.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Two-file CSS split → Tasks 1, 9. ✓
- Layout restructure (product/engineering, folio stacked, inline Inspector, quiet-until-trip, manual collapse, mobile product-first) → Task 7 (App/Inspector) + Task 9 (`.stage[data-eng]` grid, responsive). ✓
- Token system port + delete cyan-on-slate → Task 1 (theme.css), Task 9 (no `:root`, old values gone). ✓
- SplitFlap (folio title + flight codes) → Tasks 5, 8. ✓
- Orchestration packet on live STAGES → Task 7 Step 4. ✓
- CRT Inspector → Task 7 Step 3 + Task 9 inspector block. ✓
- Theme switcher (5 palettes, localStorage, amber default) → Tasks 3, 6. ✓
- Footer meta-note → Task 7 Step 1. ✓
- Honest numbers preserved → Inspector content untouched (only classNames/wrapper changed). ✓
- Tests (logic-level per the deviation note) → Tasks 2, 3, 4. ✓
- Dropped set-pieces (route arc, odometer) → not built. ✓
- Frontend-only → no worker/shared/SSE changes anywhere. ✓
- `/codex-review` before done → Task 10 Step 4. ✓

**Placeholder scan:** none — every code/CSS block is concrete.

**Type consistency:** Inspector props `{ collapsed, onToggleCollapse, tools, turns, summaries, savings, overhead }` defined in Task 7 Step 2 match the call site in Task 7 Step 1. `engState` signature (Task 4) matches its use in `App.tsx` (Task 7). `splitFlapCells` (Task 2) consumed by `SplitFlap` (Task 5). `THEME_IDS`/`ThemeId`/`applyTheme`/`loadTheme` (Task 3) consumed by `ThemeSwitch` (Task 6). `SplitFlap` prop `{ text, as?, className? }` (Task 5) matches usage in `FolioPanel` (Task 8). Class names in `styles.css` (Task 9) match the JSX in Tasks 7–8 and the unchanged ChatView. ✓
