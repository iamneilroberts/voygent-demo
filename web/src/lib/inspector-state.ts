// Visibility state of the engineering (Inspector) column. CSS keys the stage grid
// off this:
//   "idle"  = pre-trip, a dim non-interactive narrow rail.
//   "peek"  = LIVE skinny rail (phase + pipeline + top stats), the default once work
//             starts. It never auto-grabs the screen; clicking it opens the panel.
//   "open"  = the full two-column panel, shown only after the viewer expands.
// The rail is always visible and live in "peek", so "not open" is not "hidden".
export type EngState = "idle" | "peek" | "open";

export function engState(toolCount: number, expanded: boolean): EngState {
  if (toolCount === 0) return "idle";   // nothing to show yet → quiet rail, even if expanded
  return expanded ? "open" : "peek";
}
