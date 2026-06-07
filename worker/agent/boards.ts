// Inline chooser boards (claude-skin boards mode): turn the slim candidate
// payloads that flight_search/flight_list/hotel_search/hotel_list return into a
// client-renderable `board` event. Candidate ids are the real fixture ids the
// model sees, so a clicked pick always passes the promote_* fabrication guard.
//
// The builder is stateful (per exchange): search-then-list returns the same
// candidate set, so identical consecutive boards are deduped by kind + id set.

import type { ServerEvent, BoardCandidate } from "../../shared/events";

const FLIGHT_TOOLS = new Set(["flight_search", "flight_list"]);
const HOTEL_TOOLS = new Set(["hotel_search", "hotel_list", "hotel_search_and_rank"]);

function usd(n: number | null | undefined): string | undefined {
  return typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : undefined;
}

function stopsLabel(stops: number | null | undefined): string | null {
  if (typeof stops !== "number") return null;
  return stops === 0 ? "nonstop" : stops === 1 ? "1 stop" : `${stops} stops`;
}

function flightCandidate(c: Record<string, any>): BoardCandidate | null {
  if (typeof c.id !== "string" || !c.id) return null;
  const title = typeof c.route === "string" && c.route ? c.route : c.id;
  const meta = [c.airline, stopsLabel(c.stops), c.cabin].filter(Boolean).join(" · ") || undefined;
  const price = usd(c.price);
  const summary = [title, c.airline, stopsLabel(c.stops), price].filter(Boolean).join(", ");
  return { id: c.id, title, price, meta, summary };
}

function hotelCandidate(c: Record<string, any>): BoardCandidate | null {
  if (typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !c.name) return null;
  const stars = typeof c.starRating === "number" ? `${c.starRating}★` : null;
  const review = typeof c.reviewScore === "number"
    ? `${c.reviewScore}${typeof c.reviewCount === "number" ? ` (${c.reviewCount.toLocaleString("en-US")})` : ""}`
    : null;
  const meta = [c.area, stars, review].filter(Boolean).join(" · ") || undefined;
  const perNight = usd(c.pricePerNight);
  const price = perNight ? `${perNight}/night` : usd(c.priceTotal);
  const summary = [c.name, c.area, price].filter(Boolean).join(", ");
  return { id: c.id, title: c.name, price, meta, summary };
}

// cpmaxx hotel_search_and_rank shape ({hotels:[{id, name, stars, area, price_per_night,
// price_total, commission, commission_pct, hotel_sheet_url, ...}]}) — live trips only.
function cpmaxxHotelCandidate(c: Record<string, any>): BoardCandidate | null {
  const id = c.id != null ? String(c.id) : "";
  if (!id || typeof c.name !== "string" || !c.name) return null;
  const stars = typeof c.stars === "number" ? `${c.stars}★` : null;
  const area = typeof c.area === "string" && c.area ? c.area.split(",")[0].slice(0, 40) : null;
  const meta = [area, stars].filter(Boolean).join(" · ") || undefined;
  const perNight = usd(c.price_per_night);
  const price = perNight ? `${perNight}/night` : usd(c.price_total);
  const total = usd(c.price_total);
  const summary = [c.name, price, total ? `${total} total` : null].filter(Boolean).join(", ");
  const out: BoardCandidate = { id, title: c.name, price, meta, summary };
  if (typeof c.hotel_sheet_url === "string" && c.hotel_sheet_url) out.detailUrl = c.hotel_sheet_url;
  if (typeof c.commission === "number") out.commission = c.commission;
  if (typeof c.commission_pct === "number") out.commissionPct = c.commission_pct;
  return out;
}

export type BoardBuilder = (toolName: string, resultText: string, tripId: string) => ServerEvent | null;

export function createBoardBuilder(): BoardBuilder {
  let lastKey: string | null = null; // dedupe consecutive identical boards (search → list)
  return (toolName, resultText, tripId) => {
    const kind: "flight" | "hotel" | null =
      FLIGHT_TOOLS.has(toolName) ? "flight" : HOTEL_TOOLS.has(toolName) ? "hotel" : null;
    if (!kind) return null;

    let parsed: unknown;
    try { parsed = JSON.parse(resultText); } catch { return null; }
    if (!parsed || typeof parsed !== "object") return null;
    // Proxied tools (e.g. hotel_search_and_rank) double-wrap their result in a
    // nested MCP envelope ({content:[{type:"text",text:"<json>"}]}) — unwrap to
    // reach the real payload. (Upstream voygent-lite artifact; model copes, we
    // unwrap for the UI.)
    for (let hops = 0; hops < 3; hops++) {
      const env = parsed as Record<string, any>;
      const inner = Array.isArray(env.content) && env.content[0]?.type === "text" ? env.content[0].text : null;
      if (typeof inner !== "string") break;
      try { parsed = JSON.parse(inner); } catch { break; }
      if (!parsed || typeof parsed !== "object") return null;
    }
    // No blanket scrubAdvisor here: the candidate mappers below copy ONLY named
    // fields (explicit allowlist — that's the firewall), and the demo's boards
    // are the ADVISOR view, where cpmaxx commission is deliberately surfaced
    // (profitability toggle). The inspector trail still scrubs separately.
    const body = parsed as Record<string, any>;
    // hotel_search_and_rank returns {hotels:[...]} (cpmaxx shape); everything else {candidates:[...]}.
    const isCpmaxx = toolName === "hotel_search_and_rank";
    const rawList = isCpmaxx ? body.hotels : body.candidates;
    if (body.action === "clear" || !Array.isArray(rawList) || rawList.length === 0) return null;

    const candidates = rawList
      .map((c: unknown) => (c && typeof c === "object"
        ? (kind === "flight" ? flightCandidate(c as Record<string, any>)
          : isCpmaxx ? cpmaxxHotelCandidate(c as Record<string, any>)
          : hotelCandidate(c as Record<string, any>))
        : null))
      .filter((c: BoardCandidate | null): c is BoardCandidate => c !== null);
    if (candidates.length === 0) return null;

    const key = `${kind}:${candidates.map((c) => c.id).join(",")}`;
    if (key === lastKey) return null;
    lastKey = key;

    return { type: "board", kind, boardId: crypto.randomUUID(), tripId, candidates };
  };
}
