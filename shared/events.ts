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
  | { type: "error"; message: string };

export function encodeSse(ev: ServerEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}
