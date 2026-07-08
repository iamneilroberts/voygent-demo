// Shared segments -> board/advisor leg mapping. Used by both the fixture-replay
// layer (worker/mcp/replay.ts, for the featured/replayed trips) and the live
// passthrough board builder (worker/agent/boards.ts, for off-menu/faithful
// searches that return real prod candidates whose routing detail lives in
// `segments`, not a pre-shaped `legs` array).

import type { FlightSegment } from "../fixtures/index";
import type { FlightLeg } from "../../shared/events";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-12 12:53" -> "Oct 12, 12:53p". Returns undefined for anything we can't parse.
function fmtSegTime(s: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s ?? ""));
  if (!m) return undefined;
  const mon = MONTHS[Number(m[2]) - 1] ?? "";
  const day = Number(m[3]);
  let h = Number(m[4]);
  const min = m[5];
  const ap = h >= 12 ? "p" : "a";
  h = h % 12; if (h === 0) h = 12;
  return `${mon} ${day}, ${h}:${min}${ap}`;
}

function fmtDur(min: number | null | undefined): string | undefined {
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0) return undefined;
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Map captured prod segments to the board/advisor leg shape, keeping only the
// fields the routing detail renders. Times are formatted; junk capture fields
// (offerId, searchedAt, query echo, ...) never make it here.
export function segmentsToLegs(segments: FlightSegment[] | null | undefined): FlightLeg[] | undefined {
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  const legs = segments
    .filter((s): s is FlightSegment => !!s && typeof s === "object")
    .map((s) => {
      const leg: FlightLeg = { from: String(s.origin ?? ""), to: String(s.destination ?? "") };
      const dep = fmtSegTime(s.depart); if (dep) leg.depart = dep;
      const arr = fmtSegTime(s.arrive); if (arr) leg.arrive = arr;
      if (s.carrier) leg.carrier = String(s.carrier);
      if (s.flightNumber) leg.flightNo = String(s.flightNumber);
      if (s.equipment) leg.aircraft = String(s.equipment);
      const dur = fmtDur(s.durationMinutes); if (dur) leg.duration = dur;
      if (s.layover) leg.layoverAfter = String(s.layover);
      return leg;
    });
  return legs.length ? legs : undefined;
}
