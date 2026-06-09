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
// Takes the whole `selected` map + the two keys (not a pre-looked-up entry) because the
// caller is a per-candidate render loop that has `reelView.selected` + boardId/candidateId
// in scope, not the sliced entry.
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
// NOTE: this path format is the canonical contract emitted by the screenplay compiler
// (web/src/lib/screenplay.ts) and validated at author-time; keep the two in sync.
export function editForActivity(edits: ReelEditMarker[], dayIndex: number, activityIndex: number): ReelEditMarker | undefined {
  const want = `days[${dayIndex}].activities[${activityIndex}]`;
  return edits.find((e) => e.path === want);
}
