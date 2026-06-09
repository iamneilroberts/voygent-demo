// Session persistence helpers for SessionDO. Conversation state previously
// lived only in DO instance memory, so a Cloudflare eviction between turns
// (user idles a few minutes reading results) wiped the conversation AND
// minted a fresh tripId — the model would then "create the trip first" again
// and orphan the original trip (observed live, 2026-06-07 Cancún run).
//
// Storage layout (alongside the existing "budget" key):
//   sess        → SessRecord (tripId, boardsMode, replay snapshot)
//   msg:00000…  → one ConversationMessage per key, zero-padded so
//                 storage.list({ prefix: "msg:" }) returns them in order.
import type { ConversationMessage } from "./llm/provider";
import type { ReplaySnapshot } from "./mcp/replay";
import type { ModelRouting } from "../shared/models";
import type { TripPhase } from "./agent/phases";

export interface SessRecord {
  tripId: string;
  boardsMode: boolean;
  liveMode?: boolean;  // latched true when a search left the featured-trip catalog (real-Voygent pass-through)
  faithful?: boolean;  // latched on first turn: the whole session runs faithful-or-not regardless of later env flips (Decision A4)
  // One-shot host-nudge flags (true = the nudge fired OR the behavior was
  // observed). Session-scoped: persisted so a nudge can't re-fire after an
  // exchange boundary or a DO eviction.
  nudges?: { enrichment: boolean; flightList: boolean; hsr: boolean };
  // Model routing chosen by the visitor (already server-coerced before persist).
  routing?: ModelRouting;
  // Outcome-based phase milestone: true once a hotel lock succeeded with lodging.
  // Re-derived from replay state on hydrate to survive mid-stream DO death.
  hotelsPromoted?: boolean;
  replay: ReplaySnapshot;
  tripPhase?: TripPhase;   // current build-machine phase (phase-machine mode only; undefined otherwise)
}

export const MSG_PREFIX = "msg:";
export function msgKey(i: number): string {
  return `${MSG_PREFIX}${String(i).padStart(5, "0")}`;
}

// DO storage caps values at 128 KiB. A turn's tool_result bundle (several raw
// search payloads) can exceed that, so the PERSISTED copy elides the largest
// tool_result contents until it fits. The in-memory conversation is untouched;
// only a post-eviction rehydration sees the elision — a degraded-but-correct
// fallback (the assistant's own summaries and candidate ids survive, and
// staging by _candidateId reads server-side state, not the elided text).
// Measured in BYTES (TextEncoder), not chars — the DO cap is 131_072 bytes and
// multibyte payloads (e.g. Japanese results on the Tokyo trip) can be ~3x their
// char count. 100_000 leaves headroom for the storage envelope.
const MAX_MSG_BYTES = 100_000;
const ELIDED = "[tool result elided to fit session storage — call the tool again if its details are needed]";

const msgBytes = (m: unknown): number => new TextEncoder().encode(JSON.stringify(m)).length;

export function shrinkForStorage(m: ConversationMessage): ConversationMessage {
  if (msgBytes(m) <= MAX_MSG_BYTES) return m;
  // Only a user tool_result bundle realistically exceeds the cap.
  if (m.role !== "user" || typeof m.content === "string") return m;
  const blocks = m.content.map((b) => ({ ...b }));
  const copy = { role: "user" as const, content: blocks };
  // Shrink ONLY tool_result blocks: the bundle may also carry harness-injected
  // {type:"text"} nudge notes (no .content — sorting on it used to throw, which
  // silently killed persistence for the whole session) and those must survive.
  const shrinkable = blocks.filter(
    (b): b is Extract<typeof b, { type: "tool_result" }> => b.type === "tool_result",
  );
  shrinkable.sort((a, b) => b.content.length - a.content.length);
  for (const b of shrinkable) {
    if (msgBytes(copy) <= MAX_MSG_BYTES) break;
    b.content = ELIDED;
  }
  return copy;
}
