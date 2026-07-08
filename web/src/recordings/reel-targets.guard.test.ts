import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dublinRun } from "./dublin-run.screenplay";
import { dublinCollab } from "./dublin-collab.screenplay";
import { dublinClient } from "./dublin-client.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";

// Guard against a highlight spotlighting a `data-reel-target` that no claude-skin
// component actually emits — that's exactly how the pre-fix dublin-run screenplay
// broke (`client-view-toggle` matched nothing, `folio-bookings` matched nothing
// before the bookings section existed in ClaudeChatView). This scans the real
// component source for every `data-reel-target` literal and the small set of
// dynamic template patterns, then checks every `highlights[].target` in both
// reels lands on one of them.
const webSrcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// One scanner for both guards below — the anchor-authoring convention lives here only.
function fileTargets(name: string): Set<string> {
  const src = readFileSync(join(webSrcDir, name), "utf8");
  return new Set([...src.matchAll(/data-reel-target="([^"]+)"/g)].map((m) => m[1]));
}

function collectStaticTargets(): Set<string> {
  const out = new Set<string>();
  for (const name of readdirSync(webSrcDir)) {
    if (!name.endsWith(".tsx")) continue;
    for (const t of fileTargets(name)) out.add(t);
  }
  return out;
}

// Dynamic `data-reel-target={`prefix-${expr}`}` patterns found in the components,
// and the concrete suffixes the two screenplays actually drive:
//   - ClaudeToolChip:      `tool-${item.name}`      -> any tool name (agent.tool() calls)
//   - CommentThread:       `comment-${threadId}`     -> any thread id (advisor/client .comments())
//   - FolioArtifact days:  `folio-day-${i}`          -> any non-negative day index
//   - BoardView:           `board-${board.kind}`     -> only the board kinds the screenplay compiler accepts
const DYNAMIC_PATTERNS: RegExp[] = [
  /^tool-.+$/,
  /^comment-.+$/,
  /^folio-day-\d+$/,
  /^board-(flight|hotel|includes|tour)$/,
];

function isValidTarget(target: string, staticTargets: Set<string>): boolean {
  return staticTargets.has(target) || DYNAMIC_PATTERNS.some((re) => re.test(target));
}

describe("reel highlight targets exist in the claude-skin render path", () => {
  const staticTargets = collectStaticTargets();

  it("found a non-trivial set of static data-reel-target literals to check against", () => {
    // Sanity check the scan itself isn't silently empty (e.g. a moved/renamed dir).
    expect(staticTargets.size).toBeGreaterThanOrEqual(5);
    expect(staticTargets.has("client-view")).toBe(true);
  });

  for (const [name, screenplay] of [["dublinRun", dublinRun], ["dublinCollab", dublinCollab], ["dublinClient", dublinClient]] as const) {
    it(`every highlight target in ${name} resolves to a real or dynamically-valid data-reel-target`, () => {
      const bad = screenplay.highlights
        .map((h) => h.target)
        .filter((t) => !isValidTarget(t, staticTargets));
      expect(bad).toEqual([]);
    });
  }
});

// C9: ReelCallout resolves targets with a GLOBAL document.querySelector, and in ch1/ch2
// the chat's FolioArtifact (ClaudeChatView) stays in the DOM behind the cutaway scrim.
// A spotlight bound to a `folioview` frame must therefore target an anchor the chat can
// NOT emit, or the callout anchors to the hidden chat element instead of the cutaway.
// Chat-emittable anchors = ClaudeChatView's static literals + its 0-based `folio-day-${i}`
// for every day index the recording's folio events actually reach. (ch3 is exempt: it
// emits no chat folio events by design.)
describe("cutaway (folioview) spotlight targets avoid anchors the chat folio also emits", () => {
  const chatStatic = fileTargets("ClaudeChatView.tsx");

  for (const [name, sp] of [["dublinRun", dublinRun], ["dublinCollab", dublinCollab]] as const) {
    it(`${name}: folioview-bound highlights collide with nothing the chat renders`, () => {
      const frames = sp.recording.frames;
      const maxDays = Math.max(0, ...frames.flatMap((f) =>
        f.kind === "event" && f.event.type === "folio" ? [f.event.folio.days?.length ?? 0] : []));
      const chatTargets = new Set(chatStatic);
      for (let d = 0; d < maxDays; d++) chatTargets.add(`folio-day-${d}`);
      const bad: string[] = [];
      for (const [idx, hs] of resolveHighlightFrames(frames, sp.highlights)) {
        const f = frames[idx];
        if (f.kind === "interaction" && f.interaction.kind === "folioview") {
          for (const h of hs) if (chatTargets.has(h.target)) bad.push(h.target);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
