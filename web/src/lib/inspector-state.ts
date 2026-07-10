// Visibility state of the engineering (Inspector) column. CSS keys the stage grid
// off this:
//   "idle"  = pre-trip, a dim non-interactive narrow rail.
//   "peek"  = LIVE skinny rail (phase + pipeline + top stats), the default once work
//             starts. It never auto-grabs the screen; clicking it opens the panel.
//   "open"  = the full two-column panel, shown only after the viewer expands.
// The rail is always visible and live in "peek", so "not open" is not "hidden".
export type EngState = "idle" | "peek" | "open";

export function engState(toolCount: number, expanded: boolean): EngState {
  // A viewer's explicit expand always wins — the idle rail is clickable (QA 07-10:
  // the rail was dead for the whole reel and pre-first-message live, so "Engineering"
  // could never be opened when there was no telemetry yet). With no tools the open
  // panel still carries the static engineering stories (DIG DEEPER links).
  if (expanded) return "open";
  return toolCount === 0 ? "idle" : "peek";
}
