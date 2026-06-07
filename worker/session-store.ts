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

export interface SessRecord {
  tripId: string;
  boardsMode: boolean;
  replay: ReplaySnapshot;
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
const MAX_MSG_CHARS = 90_000;
const ELIDED = "[tool result elided to fit session storage — call the tool again if its details are needed]";

export function shrinkForStorage(m: ConversationMessage): ConversationMessage {
  if (JSON.stringify(m).length <= MAX_MSG_CHARS) return m;
  // Only a user tool_result bundle realistically exceeds the cap.
  if (m.role !== "user" || typeof m.content === "string") return m;
  const blocks = m.content.map((b) => ({ ...b }));
  const copy = { role: "user" as const, content: blocks };
  const bySize = [...blocks].sort((a, b) => b.content.length - a.content.length);
  for (const b of bySize) {
    if (JSON.stringify(copy).length <= MAX_MSG_CHARS) break;
    b.content = ELIDED;
  }
  return copy;
}
