// Resolve which board candidate the agent actually chose, so the default reel
// (and live mode) can mark the selected option — not just lock the board with
// every sibling dimmed and no ✓.
//
// Why not match the folio's promoted flight/hotel text back to a candidate? In
// the real recording every flight candidate shares the same title ("MOB→DUB")
// and several share a price, so text matching is ambiguous. The unambiguous
// signal is the candidate id itself: the agent stages/promotes exactly one id
// (e.g. serp:70wngy), which shows up in the patch_trip `updates` and the
// promote_* result. flight_search/hotel_search are excluded on purpose — their
// results echo ALL candidate ids, which would defeat disambiguation.

// Tools whose args/result name the chosen candidate id. Search tools are NOT
// pick tools (they return every candidate).
export function isPickTool(name: string): boolean {
  return name.startsWith("promote_") || name === "patch_trip" || name === "confirm_lodging";
}

// Given a board's candidate ids and the accumulated text of all pick-tool
// args+results this session, return the chosen candidate id (the one staged or
// promoted), or undefined if none is referenced yet.
export function resolveBoardPickId(candidateIds: string[], stagedBlob: string): string | undefined {
  return candidateIds.find((id) => id.length > 0 && stagedBlob.includes(id));
}
