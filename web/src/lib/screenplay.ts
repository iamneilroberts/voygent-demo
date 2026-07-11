import type { ServerEvent, BoardCandidate, FolioData } from "../../../shared/events";
import type { Recording, Frame, Actor, ReelClientSession, ReelEngPanel, ReelFolioSession, ReelEmailView, ReelPocketGuide } from "./recording";
import type { Highlight, HighlightMatch } from "./highlights";

interface Meta { trip: string; skin: "claude" }

// Resolve a dotted folio path like "days[2].activities[0]" against a FolioData.
// Returns true if the path resolves to a defined value. Used for edit/comment validation.
function pathExists(folio: FolioData | null, path: string): boolean {
  if (!folio) return false;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  if (!parts.length) return false;
  let cur: unknown = folio;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return false;
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
    board: (kind: "flight" | "hotel" | "includes" | "tour" | "car" | "cruise", boardId: string, candidates: BoardCandidate[]) => {
      this.boards.set(boardId, new Set(candidates.map((c) => c.id)));
      this.event({ type: "board", kind, boardId, tripId: "t", candidates });
    },
    folio: (folio: FolioData) => { this.folio = folio; this.event({ type: "folio", folio }); },
    // Honesty tag: whether this session's results are live supplier data or sample fixtures.
    source: (live: boolean) => this.event({ type: "source", live }),
    // Brief engineering-view peek: open/update/close a small panel showing the real
    // tools called so far. Pass null to close. One beat per call (like client.view).
    engPanel: (snapshot: ReelEngPanel | null) => {
      this.add({ delayMs: 0, kind: "interaction", actor: "agent", interaction: { kind: "engpanel", view: snapshot }, beatId: this.beat() });
    },
  };

  readonly advisor = this.makeHuman("advisor");
  readonly client = this.makeHuman("client");

  private makeHuman(actor: Actor) {
    return {
      says: (text: string) => this.add({ delayMs: 0, kind: "user", text, actor, beatId: this.beat() }),
      // Single pick (flights): one candidate + the resulting folio carrying the promotion.
      picks: (boardId: string, candidateId: string, echo: string, resultingFolio: FolioData) =>
        this.pickMany(actor, boardId, [candidateId], echo, resultingFolio),
      // Multi-select (hotel shortlist, includes): several candidates; folio is optional
      // (a hotel shortlist changes no folio yet — the client picks one of them later).
      picksMany: (boardId: string, candidateIds: string[], echo: string, resultingFolio?: FolioData) =>
        this.pickMany(actor, boardId, candidateIds, echo, resultingFolio),
      edits: (path: string, o: { was: string; now: string; tag: string }, resultingFolio?: FolioData) => {
        if (!pathExists(this.folio, path)) throw new Error(`screenplay: edit path "${path}" does not exist in the current folio`);
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "edit", path, was: o.was, now: o.now, tag: o.tag }, beatId: this.beat() });
        if (resultingFolio) this.agent.folio(resultingFolio); // explicit folio event for the data change
      },
      comments: (anchor: string, text: string, threadId = anchor) => {
        if (!pathExists(this.folio, anchor)) throw new Error(`screenplay: comment anchor "${anchor}" does not exist in the current folio`);
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "comment", anchor, threadId, text }, beatId: this.beat() });
      },
      // inbound: true = the notification is the client's reply ARRIVING (ch3's opener);
      // the notice then renders only the reply card + routing chip, no "sent" card.
      sendsToClient: (o: { subject: string; reply?: string; inbound?: boolean }) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "handoff", channel: "email", subject: o.subject, reply: o.reply, inbound: o.inbound }, beatId: this.beat() });
      },
      // R4: open/update/close the simulated client browser window. Snapshot-based — each
      // call is one beat; pass null to close. Consecutive snapshots animate the price recalc.
      view: (snapshot: ReelClientSession | null) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "clientview", view: snapshot }, beatId: this.beat() });
      },
      // Ch3: open/update/close the simulated client FOLIO window (the full folio, not the
      // pricing widget). Snapshot-based like view(); pass null to close. opts.holdMs
      // overrides the beat's post-apply dwell (quick section flips vs the 4.2s default).
      folioView: (snapshot: ReelFolioSession | null, opts?: { holdMs?: number }) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "folioview", view: snapshot }, beatId: this.beat(), ...(opts?.holdMs != null ? { holdMs: opts.holdMs } : {}) });
      },
      // QA4 ch3: open/close the raw-email window — the confirmation exactly as the
      // airline sent it, shown before the advisor pastes it into the chat.
      email: (snapshot: ReelEmailView | null) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "emailview", view: snapshot }, beatId: this.beat() });
      },
      // DIY finale: open/close the Pocket Guide window (the saved-to-phone offline guide).
      pocketGuide: (snapshot: ReelPocketGuide | null, opts?: { holdMs?: number }) => {
        this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "pocketguide", view: snapshot }, beatId: this.beat(), ...(opts?.holdMs != null ? { holdMs: opts.holdMs } : {}) });
      },
    };
  }

  private pickMany(actor: Actor, boardId: string, candidateIds: string[], echo: string, resultingFolio?: FolioData): void {
    const board = this.boards.get(boardId);
    if (!board) throw new Error(`screenplay: pick references board "${boardId}" before it was emitted`);
    if (!candidateIds.length) throw new Error(`screenplay: pick on "${boardId}" needs at least one candidate`);
    for (const id of candidateIds) {
      if (!board.has(id)) throw new Error(`screenplay: pick references candidate "${id}" not on board "${boardId}"`);
    }
    this.add({ delayMs: 0, kind: "interaction", actor, interaction: { kind: "pick", boardId, candidateIds, echo }, beatId: this.beat() });
    if (resultingFolio) this.agent.folio(resultingFolio); // explicit folio event for any data change
  }

  spotlight(match: HighlightMatch, card: { target: string; eyebrow: string; title: string; body: string; dwellMs?: number; variant?: "hero" }): void {
    this.highlights.push({ match, ...card });
  }
}

export function screenplay(meta: Meta, build: (s: Builder) => void): { recording: Recording; highlights: Highlight[] } {
  const b = new Builder();
  build(b);
  b.frames.push({ delayMs: 0, kind: "turn-end" });
  return { recording: { skin: meta.skin, trip: meta.trip, frames: b.frames }, highlights: b.highlights };
}
