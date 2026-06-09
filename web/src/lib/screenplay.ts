import type { ServerEvent, BoardCandidate, FolioData } from "../../../shared/events";
import type { Recording, Frame, Actor } from "./recording";
import type { Highlight, HighlightMatch } from "./highlights";

interface Meta { trip: string; skin: "claude" }

// Resolve a dotted folio path like "days[2].activities[0]" against a FolioData.
// Returns true if the path resolves to a defined value. Used for edit/comment validation.
function pathExists(folio: FolioData | null, path: string): boolean {
  if (!folio) return false;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = folio;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur !== undefined;
}

class Builder {
  frames: Frame[] = [];
  highlights: Highlight[] = [];
  private boards = new Map<string, Set<string>>(); // boardId -> candidate ids emitted
  private folio: FolioData | null = null;
  private seq = 0;
  private beat(): string { return `b${this.seq++}`; }
  private add(f: Frame): void { this.frames.push(f); }
  private event(event: ServerEvent): void { this.add({ delayMs: 0, kind: "event", event, beatId: this.beat() }); }

  readonly agent = {
    says: (text: string) => this.event({ type: "text", delta: text }),
    tool: (tool: string, o?: { summary?: string }) => { this.event({ type: "tool", tool, phase: "start" }); this.event({ type: "tool", tool, phase: "done", summary: o?.summary }); },
    board: (kind: "flight" | "hotel", boardId: string, candidates: BoardCandidate[]) => {
      this.boards.set(boardId, new Set(candidates.map((c) => c.id)));
      this.event({ type: "board", kind, boardId, tripId: "t", candidates });
    },
    folio: (folio: FolioData) => { this.folio = folio; this.event({ type: "folio", folio }); },
  };

  readonly advisor = this.makeHuman("advisor");
  readonly client = this.makeHuman("client");

  private makeHuman(actor: Actor) {
    return {
      says: (text: string) => this.add({ delayMs: 0, kind: "user", text, actor, beatId: this.beat() }),
      picks: (boardId: string, candidateId: string, echo: string, resultingFolio: FolioData) => {
        const board = this.boards.get(boardId);
        if (!board) throw new Error(`screenplay: pick references board "${boardId}" before it was emitted`);
        if (!board.has(candidateId)) throw new Error(`screenplay: pick references candidate "${candidateId}" not on board "${boardId}"`);
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "pick", boardId, candidateId, echo }, beatId: this.beat() });
        this.agent.folio(resultingFolio); // compiler emits the folio event carrying the promotion
      },
      edits: (path: string, o: { was: string; now: string; tag: string }, resultingFolio?: FolioData) => {
        if (!pathExists(this.folio, path)) throw new Error(`screenplay: edit path "${path}" does not exist in the current folio`);
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "edit", path, was: o.was, now: o.now, tag: o.tag }, beatId: this.beat() });
        if (resultingFolio) this.agent.folio(resultingFolio); // explicit folio event for the data change
      },
      comments: (anchor: string, text: string, threadId = anchor) => {
        if (!pathExists(this.folio, anchor)) throw new Error(`screenplay: comment anchor "${anchor}" does not exist in the current folio`);
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "comment", anchor, threadId, text }, beatId: this.beat() });
      },
      sendsToClient: (o: { subject: string; reply?: string }) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "handoff", channel: "email", subject: o.subject, reply: o.reply }, beatId: this.beat() });
      },
    };
  }

  spotlight(match: HighlightMatch, card: { target: string; eyebrow: string; title: string; body: string; dwellMs?: number }): void {
    this.highlights.push({ match, ...card });
  }
}

export function screenplay(meta: Meta, build: (s: Builder) => void): { recording: Recording; highlights: Highlight[] } {
  const b = new Builder();
  build(b);
  b.frames.push({ delayMs: 0, kind: "turn-end" });
  return { recording: { skin: meta.skin, trip: meta.trip, frames: b.frames }, highlights: b.highlights };
}
