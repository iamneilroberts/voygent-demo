// Inline chooser boards (claude-skin boards mode): turn the slim candidate
// payloads that flight_search/flight_list/hotel_search/hotel_list return into a
// client-renderable `board` event. Candidate ids are the real fixture ids the
// model sees, so a clicked pick always passes the promote_* fabrication guard.
//
// The builder is stateful (per exchange): search-then-list returns the same
// candidate set, so identical consecutive boards are deduped by kind + id set.

import type { ServerEvent, BoardCandidate, FlightLeg } from "../../shared/events";

const FLIGHT_TOOLS = new Set(["flight_search", "flight_list"]);
const HOTEL_TOOLS = new Set(["hotel_search", "hotel_list", "hotel_search_and_rank"]);

function usd(n: number | null | undefined): string | undefined {
  return typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : undefined;
}

function stopsLabel(stops: number | null | undefined): string | null {
  if (typeof stops !== "number") return null;
  return stops === 0 ? "nonstop" : stops === 1 ? "1 stop" : `${stops} stops`;
}

function durationLabel(min: number | null | undefined): string | null {
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Copy the slim payload's legs through verbatim — they already arrive in FlightLeg
// shape (formatted times) from the replay layer. Only `from`/`to` are required.
function legsFrom(raw: unknown): FlightLeg[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const legs = raw
    .filter((l): l is Record<string, any> => !!l && typeof l === "object" && typeof l.from === "string" && typeof l.to === "string")
    .map((l) => {
      const leg: FlightLeg = { from: l.from, to: l.to };
      for (const k of ["depart", "arrive", "carrier", "flightNo", "aircraft", "duration", "layoverAfter"] as const) {
        if (typeof l[k] === "string" && l[k]) leg[k] = l[k];
      }
      return leg;
    });
  return legs.length ? legs : undefined;
}

function flightCandidate(c: Record<string, any>): BoardCandidate | null {
  if (typeof c.id !== "string" || !c.id) return null;
  const title = typeof c.route === "string" && c.route ? c.route : c.id;
  const meta = [c.airline, stopsLabel(c.stops), durationLabel(c.durationMinutes), c.cabin].filter(Boolean).join(" · ") || undefined;
  const price = usd(c.price);
  const summary = [title, c.airline, stopsLabel(c.stops), price].filter(Boolean).join(", ");
  const out: BoardCandidate = { id: c.id, title, price, meta, summary };
  const legs = legsFrom(c.legs);
  if (legs) out.legs = legs;
  return out;
}

// A Google-by-name+area link for hotels whose source exposes no deep link (serp).
// Mirrors voygent-lite's googleFallbackUrl so the demo's "search ↗" lands the same
// place the real renderer would — honest (a real search for a real property), and
// no fabricated supplier inventory.
function googleHotelUrl(name: string, area: unknown): string {
  const q = [name, typeof area === "string" ? area : null].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function hotelCandidate(c: Record<string, any>): BoardCandidate | null {
  if (typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !c.name) return null;
  const stars = typeof c.starRating === "number" ? `${c.starRating}★` : null;
  // Show the review scale (Google Hotels is /5) so "5" doesn't read as ambiguous.
  const scale = typeof c.reviewScoreScale === "number" && c.reviewScoreScale > 0 ? c.reviewScoreScale : null;
  const review = typeof c.reviewScore === "number"
    ? `${c.reviewScore}${scale ? `/${scale}` : ""}${typeof c.reviewCount === "number" ? ` (${c.reviewCount.toLocaleString("en-US")})` : ""}`
    : null;
  const perNight = usd(c.pricePerNight);
  const total = usd(c.priceTotal);
  // Surface the stay total alongside the nightly rate (the advisor's real number).
  const totalLabel = perNight && total ? `${total} total` : null;
  const meta = [c.area, stars, review, totalLabel].filter(Boolean).join(" · ") || undefined;
  const price = perNight ? `${perNight}/night` : total;
  const summary = [c.name, c.area, price].filter(Boolean).join(", ");
  const out: BoardCandidate = { id: c.id, title: c.name, price, meta, summary };
  // Prefer a real deep link the source exposed; else the Google-by-name fallback.
  const real = typeof c.websiteUrl === "string" && c.websiteUrl ? c.websiteUrl
    : typeof c.url === "string" && c.url ? c.url : null;
  if (real) {
    out.detailUrl = real;
  } else {
    out.detailUrl = googleHotelUrl(c.name, c.area);
    out.detailLabel = "search ↗";
  }
  return out;
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
