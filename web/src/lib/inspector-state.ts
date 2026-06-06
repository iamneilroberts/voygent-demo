// Visibility state of the engineering (Inspector) column. CSS keys the stage
// grid off this: "live" expands to the 0.78fr/1fr two-column layout; "idle" and
// "collapsed" both render the dimmed narrow rail. "idle" = quiet until the first
// trip; "collapsed" = the viewer manually re-quieted it after activity began.
export type EngState = "idle" | "live" | "collapsed";

export function engState(toolCount: number, collapsed: boolean): EngState {
  if (collapsed) return "collapsed";
  return toolCount > 0 ? "live" : "idle";
}
