import type { Actor, ReelInteraction } from "./recording";

export interface ReelEditMarker { path: string; was: string; now: string; tag: string; actor: Actor; reconciled: boolean }
export interface ReelComment { actor: Actor; text: string }
export interface ReelThread { threadId: string; anchor: string; comments: ReelComment[] }
export interface ReelHandoff { sent: boolean; routedBack: boolean; subject?: string; reply?: string }

// Reel-only presentation state. Deliberately holds NO folio data — the canonical
// folio is owned exclusively by the ServerEvent "folio" reducer (applyEvent).
export interface ReelViewState {
  selected: Record<string, { candidateId: string; actor: Actor }>;
  edits: ReelEditMarker[];
  threads: ReelThread[];
  handoff: ReelHandoff | null;
}

export function emptyReelViewState(): ReelViewState {
  return { selected: {}, edits: [], threads: [], handoff: null };
}

export function applyInteraction(state: ReelViewState, i: ReelInteraction, actor: Actor): ReelViewState {
  switch (i.kind) {
    case "pick":
      return { ...state, selected: { ...state.selected, [i.boardId]: { candidateId: i.candidateId, actor } } };
    case "edit":
      return { ...state, edits: [...state.edits, { path: i.path, was: i.was, now: i.now, tag: i.tag, actor, reconciled: false }] };
    case "comment": {
      const idx = state.threads.findIndex((t) => t.threadId === i.threadId);
      const threads = state.threads.slice();
      if (idx === -1) threads.push({ threadId: i.threadId, anchor: i.anchor, comments: [{ actor, text: i.text }] });
      else threads[idx] = { ...threads[idx], comments: [...threads[idx].comments, { actor, text: i.text }] };
      return { ...state, threads };
    }
    case "handoff":
      return { ...state, handoff: { sent: true, routedBack: i.reply != null, subject: i.subject, reply: i.reply } };
  }
}

// Marks ALL pending edit overlays reconciled. The caller (App's applyEvent) fires this on any
// folio event. V1: the reel's linear flow means a folio event always follows the edit it carries,
// so "reconcile all pending" is correct here; a path-aware version can come if reels interleave edits.
export function reconcileEdits(state: ReelViewState): ReelViewState {
  if (!state.edits.some((e) => !e.reconciled)) return state;
  return { ...state, edits: state.edits.map((e) => (e.reconciled ? e : { ...e, reconciled: true })) };
}
