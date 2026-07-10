import type { Actor } from "./recording";
import type { ReelEditMarker, ReelThread } from "./interaction";

// Scoped CSS class for an actor's color treatment (defined in skin-claude.css).
export function actorClass(actor: Actor): string {
  return `cl-actor-${actor}`;
}

// Human-readable actor label for inline attribution ("Client chose this").
// The assistant actor is "Voygent", never "Agent" (confusing in a travel context,
// where an agent is a person). advisor/client capitalize normally. A reel can
// override per-actor labels (ReelEntry.actorLabels), e.g. client -> "You" in the
// DIY traveller-only reels.
export type ActorLabels = Partial<Record<Actor, string>>;
const ACTOR_LABELS: Record<Actor, string> = { agent: "Voygent", advisor: "Advisor", client: "Client" };
export function actorLabel(actor: Actor, overrides?: ActorLabels): string {
  return overrides?.[actor] ?? ACTOR_LABELS[actor] ?? (actor.charAt(0).toUpperCase() + actor.slice(1));
}

// The actor who reel-picked this candidate, or null if this candidate isn't in the
// board's selection. Takes the already-sliced selection entry (reelView.selected[boardId]).
// Multi-select boards list several candidateIds; any member counts as picked.
export function pickedActor(
  entry: { candidateIds: string[]; actor: Actor } | undefined,
  candidateId: string,
): Actor | null {
  return entry && entry.candidateIds.includes(candidateId) ? entry.actor : null;
}

// The edit (if any) targeting a specific day's activity by index. Exact-path match
// against the screenplay's `days[i].activities[j]` lowering.
// NOTE: this path format is the canonical contract emitted by the screenplay compiler
// (web/src/lib/screenplay.ts) and validated at author-time; keep the two in sync.
export function editForActivity(edits: ReelEditMarker[], dayIndex: number, activityIndex: number): ReelEditMarker | undefined {
  const want = `days[${dayIndex}].activities[${activityIndex}]`;
  return edits.find((e) => e.path === want);
}

// Comment threads anchored to a specific folio day. The screenplay's
// `comments(anchor, ...)` lowers `anchor = days[i]`, so a thread renders as a pin
// under day `dayIndex` when its anchor is exactly `days[${dayIndex}]`.
export function threadsForDay(threads: ReelThread[], dayIndex: number): ReelThread[] {
  const want = `days[${dayIndex}]`;
  return threads.filter((t) => t.anchor === want);
}

// Single-letter avatar glyph for an actor ("Client" -> "C"). Reuses actorLabel so
// the avatar and the inline attribution never drift.
export function actorInitial(actor: Actor, overrides?: ActorLabels): string {
  return actorLabel(actor, overrides).charAt(0);
}

// Label for the folio "Send to client" affordance, before and after it's sent.
export function sendButtonLabel(sent: boolean): string {
  return sent ? "✓ Sent to client" : "Send to client";
}
