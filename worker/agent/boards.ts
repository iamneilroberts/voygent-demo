// Inline chooser boards (claude-skin boards mode): turn the slim candidate
// payloads that flight_search/flight_list/hotel_search/hotel_list return into a
// client-renderable `board` event. Candidate ids are the real fixture ids the
// model sees, so a clicked pick always passes the promote_* fabrication guard.
//
// The builder is stateful (per exchange): search-then-list returns the same
// candidate set, so identical consecutive boards are deduped by kind + id set.

import { scrubAdvisor } from "../inspector";
import type { ServerEvent, BoardCandidate } from "../../shared/events";

const FLIGHT_TOOLS = new Set(["flight_search", "flight_list"]);
const HOTEL_TOOLS = new Set(["hotel_search", "hotel_list"]);

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
    const body = scrubAdvisor(parsed) as Record<string, any>;
    if (body.action === "clear" || !Array.isArray(body.candidates) || body.candidates.length === 0) return null;

    const candidates = body.candidates
      .map((c: unknown) => (c && typeof c === "object"
        ? (kind === "flight" ? flightCandidate(c as Record<string, any>) : hotelCandidate(c as Record<string, any>))
        : null))
      .filter((c: BoardCandidate | null): c is BoardCandidate => c !== null);
    if (candidates.length === 0) return null;

    const key = `${kind}:${candidates.map((c) => c.id).join(",")}`;
    if (key === lastKey) return null;
    lastKey = key;

    return { type: "board", kind, boardId: crypto.randomUUID(), tripId, candidates };
  };
}
