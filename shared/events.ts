export interface FolioFlight {
  label: string; price?: string; carrier?: string; route?: string;
  date?: string; cabin?: string; stops?: number;
}
export interface FolioHotel {
  name: string; price?: string; stars?: number;
  area?: string; nights?: number; perNight?: string;
}
export interface FolioData {
  tripId: string;
  title: string;
  flights: FolioFlight[];
  hotels: FolioHotel[];
}

export type ServerEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; phase: "start" | "done"; summary?: string }
  | { type: "folio"; folio: FolioData }
  | { type: "turn-complete" }
  | { type: "error"; message: string }
  | InspectorEvent;

export type InspectorEvent =
  | { type: "inspector"; kind: "tool"; exchangeId: string; turn: number; name: string;
      args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean }
  | { type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      costUsd: number }
  | { type: "inspector"; kind: "savings"; exchangeId: string;
      mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
      tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string }
  | { type: "inspector"; kind: "overhead"; exchangeId: string;
      instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
      folioReprojectMs?: number | null; note?: string }
  | { type: "inspector"; kind: "summary"; exchangeId: string;
      turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      costByModel: { haiku: number; sonnet: number; opus: number } };

export function encodeSse(ev: ServerEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}
