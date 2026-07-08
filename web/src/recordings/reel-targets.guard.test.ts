import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dublinRun } from "./dublin-run.screenplay";
import { dublinCollab } from "./dublin-collab.screenplay";

// Guard against a highlight spotlighting a `data-reel-target` that no claude-skin
// component actually emits — that's exactly how the pre-fix dublin-run screenplay
// broke (`client-view-toggle` matched nothing, `folio-bookings` matched nothing
// before the bookings section existed in ClaudeChatView). This scans the real
// component source for every `data-reel-target` literal and the small set of
// dynamic template patterns, then checks every `highlights[].target` in both
// reels lands on one of them.
const webSrcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectStaticTargets(): Set<string> {
  const out = new Set<string>();
  for (const name of readdirSync(webSrcDir)) {
    if (!name.endsWith(".tsx")) continue;
    const src = readFileSync(join(webSrcDir, name), "utf8");
    for (const m of src.matchAll(/data-reel-target="([^"]+)"/g)) out.add(m[1]);
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

  for (const [name, screenplay] of [["dublinRun", dublinRun], ["dublinCollab", dublinCollab]] as const) {
    it(`every highlight target in ${name} resolves to a real or dynamically-valid data-reel-target`, () => {
      const bad = screenplay.highlights
        .map((h) => h.target)
        .filter((t) => !isValidTarget(t, staticTargets));
      expect(bad).toEqual([]);
    });
  }
});
