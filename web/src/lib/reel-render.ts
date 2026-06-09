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
