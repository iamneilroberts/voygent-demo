import type { BoardCandidate } from "../../shared/events";
import type { ChatMessage } from "./ChatView";

// Discriminated timeline items for the claude skin's inline stream. The board
// skin only ever sees user/assistant items (boards + toolchips are pushed only
// in claude skin / boards mode), so ChatView's code path is unchanged.
export interface BoardItem {
  role: "board";
  boardId: string;
  kind: "flight" | "hotel" | "includes";
  tripId: string;
  candidates: BoardCandidate[];
  resolvedId?: string;   // the card the viewer clicked
  resolved?: boolean;    // closed out (clicked, or agent promoted after a typed reply)
}

export interface ToolChipItem {
  role: "toolchip";
  name: string;
  status: "running" | "done";
  summary?: string;
  title?: string;   // human label ("Shortlisting hotels"); the raw `name` rides as a mono tag
}

export type TimelineItem = ChatMessage | BoardItem | ToolChipItem;

export function isChatMessage(it: TimelineItem): it is ChatMessage {
  return it.role === "user" || it.role === "assistant";
}
