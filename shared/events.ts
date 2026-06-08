export interface FolioFlight {
  label: string; price?: string; carrier?: string; route?: string;
  date?: string; cabin?: string; stops?: number;
}
export interface FolioHotel {
  name: string; price?: string; stars?: number;
  area?: string; nights?: number; perNight?: string;
  commission?: number;     // advisor commission USD (cpmaxx-sourced lodging only; absent elsewhere)
  commissionPct?: number;  // advisor commission percentage (same sourcing rule)
}
export interface FolioActivity { time?: string; name: string; description?: string; url?: string }
export interface FolioDining   { name: string; description?: string; cuisine?: string; url?: string }
export interface FolioDay {
  date?: string; title: string; location?: string;
  activities: FolioActivity[]; dining: FolioDining[]; stay?: string;
}
export interface FolioInclude { key: string; title: string; body: string }
export interface FolioData {
  tripId: string;
  title: string;
  flights: FolioFlight[];
  hotels: FolioHotel[];
  days?: FolioDay[];          // NEW — day-by-day (activities = excursions + free things; dining)
  includes?: FolioInclude[];  // NEW — boilerplate "what's included / tips"
}

// One clickable option on an inline chooser board (claude-skin boards mode).
// Built from the same slim candidate fields the model sees — id is always a
// real fixture candidate id, so a clicked pick passes the promote_* guard.
export interface BoardCandidate {
  id: string;       // e.g. "serp:70wngy"
  title: string;    // flight route ("MOB→DUB") or hotel name
  price?: string;   // formatted: "$3,426" / "$214/night"
  meta?: string;    // "United · 1 stop · Economy" / "Temple Bar · 4★ · 8.9 (1,203)"
  summary: string;  // one-liner echoed back to the agent on selection
  detailUrl?: string;      // supplier detail page (e.g. cpmaxx hotel sheet) — renders as a "details" link
  commission?: number;     // advisor commission for the stay, USD (cpmaxx-sourced candidates only)
  commissionPct?: number;  // advisor commission percentage (cpmaxx-sourced candidates only)
}

export type ServerEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; phase: "start" | "done"; summary?: string }
  | { type: "folio"; folio: FolioData }
  | { type: "board"; kind: "flight" | "hotel"; boardId: string; tripId: string; candidates: BoardCandidate[] }
  | { type: "turn-complete" }
  | { type: "error"; message: string }
  | InspectorEvent;

export type InspectorEvent =
  | { type: "inspector"; kind: "tool"; exchangeId: string; turn: number; name: string;
      args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean }
  | { type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      costUsd: number; model?: string }
  | { type: "inspector"; kind: "savings"; exchangeId: string;
      mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
      tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string }
  | { type: "inspector"; kind: "overhead"; exchangeId: string;
      instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
      folioReprojectMs?: number | null; note?: string }
  | { type: "inspector"; kind: "store"; exchangeId: string; turn: number;
      tool: string; ops: import("../worker/storeops").StoreOp[] }
  | { type: "inspector"; kind: "summary"; exchangeId: string;
      turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      // costByModel = COUNTERFACTUAL (what the aggregate usage would cost priced entirely as each tier).
      // actualCostUsd = MEASURED routed spend (sum of per-turn cost at that turn's model).
      costByModel: { haiku: number; sonnet: number; opus: number };
      actualCostUsd: number; actualCostByModel?: Record<string, number> };

export function encodeSse(ev: ServerEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

// Public cumulative-stats shape returned by GET /stats and consumed by the
// Inspector's "Across all sessions" section. Aggregates only — no per-exchange
// rows are ever exposed. byModel is the measured routed spend split by tier.
export interface StatsResponse {
  sessions: number;
  exchanges: number;
  trips: number;
  totalActualCostUsd: number;
  totalSavedTokens: number;     // ESTIMATE — sum of emitted savings, labeled "estimated" in the UI
  totalTokens: number;
  byModel: { haiku: number; sonnet: number; opus: number };
}
