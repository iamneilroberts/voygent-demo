// Server-side trip-build phase machine for the public demo. The worker decides
// what happens next; the model only ever sees ONE small instruction (the current
// phase's directive). Pure + unit-testable: no env, no DOM, no I/O.
//
// NAMING: distinct from shared/models.ts `Phase` ("discovery"|"enrichment", which
// is the model-routing phase for the Smart selector). This is the BUILD phase.

export type TripPhase =
  | "INTAKE"
  | "FLIGHT_PICK"
  | "HOTEL_SEARCH"
  | "HOTEL_PICK"
  | "ENRICH_EXCURSIONS"
  | "APPLY_PICKS"
  | "ENRICH_DINING"
  | "SUMMARY"
  | "EDITS";

// Linear order. EDITS sits after SUMMARY (it's the post-build follow-up phase).
export const TRIP_PHASES: TripPhase[] = [
  "INTAKE", "FLIGHT_PICK", "HOTEL_SEARCH", "HOTEL_PICK",
  "ENRICH_EXCURSIONS", "APPLY_PICKS", "ENRICH_DINING", "SUMMARY", "EDITS",
];
export const INITIAL_PHASE: TripPhase = "INTAKE";

export function phaseIndex(p: TripPhase): number { return TRIP_PHASES.indexOf(p); }
export function isBeforeSummary(p: TripPhase): boolean { return phaseIndex(p) < phaseIndex("SUMMARY"); }
export function isActionPhase(p: TripPhase): boolean { return p !== "SUMMARY" && p !== "EDITS"; }

// ctx is intentionally minimal: just the two flags that change the directive
// wording. Trip facts (city, dates, ids) are NOT interpolated — the directive uses
// angle-bracket placeholders the model fills from the conversation, exactly like the
// existing LIVE_TRIP_WORKFLOW seed. This avoids any route-resolution/staleness and
// keeps the reducer + directive fully pure. (Also used as the advancePhase ctx.)
export interface PhaseCtx { boardsMode: boolean; liveMode: boolean; }

// Whether afterToolBatch should inject the current phase's directive after a tool
// batch. In BOARDS mode the human-pick phases (FLIGHT_PICK/HOTEL_PICK) are interactive
// wait states already owned by the seed's BOARDS_WORKFLOW_OVERRIDE — injecting a
// per-phase directive there contradicts "present-and-wait" / "promote only on the
// traveler's pick", so we suppress it and let the seed drive. EDITS is post-build (no
// directive). Everything else (HOTEL_SEARCH, enrichment phases, SUMMARY, and pick
// phases in AUTO mode where the model picks itself) still gets its directive.
export function shouldInjectPhaseDirectiveAfterBatch(phase: TripPhase, ctx: PhaseCtx): boolean {
  if (phase === "EDITS") return false;
  if (ctx.boardsMode && (phase === "FLIGHT_PICK" || phase === "HOTEL_PICK")) return false;
  return true;
}

// KNOWN v1 LIMITATION (HIGH #1, 2026-06-08 external review): these directives are
// tuned for FEATURED (replay) trips and do NOT branch on ctx.liveMode. For live
// (off-menu) trips the real MCP chain differs (viator needs a resolved destination_id;
// dining does not auto-save), so the per-phase directives can under-drive a live build.
// The seed's LIVE_TRIP_WORKFLOW still covers live trips; until these directives are
// made liveMode-aware, keep DEMO_PHASE_MACHINE OFF for live traffic. Featured-trip
// acceptance (the Task 9 bar) is unaffected.
// One small instruction per phase. Kept terse: the model also still has the global
// seed (vocabulary, fabrication, tone). v1 is code-only; a future v2 can override
// these from KV (_prompts/demo-phases/<phase>).
export function phaseDirective(phase: TripPhase, ctx: PhaseCtx): string {
  const { boardsMode } = ctx;
  switch (phase) {
    case "INTAKE":
      return "Phase INTAKE: create the trip, then search flights. Call save_trip with this trip's id and "
        + "{ meta:{ title, destination, dates }, flights:[], lodging:[] }, then flight_search "
        + "{ source:'serp', trip_id, origin, destination, departure_date, return_date, adults }. Do NOT write prose.";
    case "FLIGHT_PICK":
      return boardsMode
        ? "Phase FLIGHT_PICK: present the flight options in ONE short, friendly sentence (the option cards render "
          + "beside you — don't enumerate them in text) and END YOUR TURN. Do not stage or promote yet — wait for the traveler's pick."
        : "Phase FLIGHT_PICK: pick the single best flight candidate, stage it with patch_trip "
          + "updates { flights:[{ _candidateId:'<id>' }] }, then call promote_flights. Do NOT write prose.";
    case "HOTEL_SEARCH":
      return "Phase HOTEL_SEARCH: call hotel_search { source:'serp', trip_id, location:<destination city>, check_in, check_out, adults }"
        + (boardsMode
          ? ", then present the hotel options in ONE short sentence with a 2-3 line recommendation (which YOU'd pick and why), and END YOUR TURN."
          : ", then choose 2-3 and continue to staging. Do NOT write prose.");
    case "HOTEL_PICK":
      return boardsMode
        ? "Phase HOTEL_PICK: the traveler picked hotel(s). Stage the chosen id(s) with patch_trip "
          + "updates { hotels:[{ _candidateId:'<id>' }, ...] }, then call promote_hotels_to_lodging. Do NOT write prose."
        : "Phase HOTEL_PICK: stage the 2-3 chosen hotels with patch_trip updates { hotels:[{ _candidateId:'<id>' }, ...] }, "
          + "then call promote_hotels_to_lodging. Do NOT write prose.";
    case "ENRICH_EXCURSIONS":
      return "Phase ENRICH_EXCURSIONS: call excursion_search { source:'viator', destination_name:<destination city>, date:<departure_date> } now. Do NOT write prose, do NOT present options.";
    case "APPLY_PICKS":
      return "Phase APPLY_PICKS: call apply_gap_tour_picks { tripId, picks:[ { day, productCode }, ... ] } with 2-3 "
        + "candidates from the excursion results — include at least one free (free:true) and at least one paid. Do NOT write prose, do NOT ask.";
    case "ENRICH_DINING":
      return "Phase ENRICH_DINING: call tripadvisor_search { query:'best restaurants in <destination city>', category:'restaurants' } now. The dining picks save automatically. Do NOT write prose.";
    case "SUMMARY":
      return "Phase SUMMARY: now write ONE short message — summarize what you ADDED using ONLY exact names returned by the "
        + "tools in this conversation (never from memory), and note the folio now carries the day-by-day plan, dining, and what's-included notes.";
    case "EDITS":
      return "Phase EDITS: the trip is built. Handle the traveler's follow-up request directly (swap a hotel, re-pick an "
        + "activity, etc.) using the appropriate tools, then briefly confirm what changed. Use ONLY tool-returned names.";
  }
}

// --- result-shape helpers (defensive; tool results are untrusted strings/objects) ---
function isOk(resultJson: any): boolean {
  if (resultJson == null) return false;                 // unparseable result → treat as not-ok
  if (typeof resultJson !== "object") return false;
  if (resultJson.status === "error" || resultJson.ok === false) return false;
  return true;
}
function isPersisted(resultJson: any): boolean {
  return isOk(resultJson) && resultJson.persisted !== false; // apply_gap_tour_picks sets persisted:true on success
}
function inputHasLodging(input: any): boolean {
  const updates = input?.updates ?? input;
  return !!updates && typeof updates === "object" && Array.isArray(updates.lodging) && updates.lodging.length > 0;
}

// Re-enter the relevant build phase from an observed tool during EDITS.
function reEnterFromEdit(toolName: string): TripPhase {
  switch (toolName) {
    case "flight_search": return "FLIGHT_PICK";
    case "hotel_search": case "hotel_search_and_rank": return "HOTEL_PICK";
    case "excursion_search": return "APPLY_PICKS";
    case "tripadvisor_search": return "SUMMARY";
    default: return "EDITS";
  }
}

/**
 * Pure transition: given the current phase and an OBSERVED tool call (name, input,
 * parsed result), return the next phase. Advance only on a successful result that
 * matches the phase's expected tool; otherwise return the SAME phase (the caller
 * owns retry caps + the structural auto-continuation). `resultJson` is the parsed
 * tool result, or null if it didn't parse as JSON. `ctx` is the same `PhaseCtx`
 * used by phaseDirective (only `liveMode` is read here).
 */
export function advancePhase(
  phase: TripPhase, toolName: string, input: any, resultJson: any, ctx: PhaseCtx,
): TripPhase {
  if (phase !== "APPLY_PICKS" && !isOk(resultJson)) return phase;
  switch (phase) {
    case "INTAKE":
      return toolName === "flight_search" ? "FLIGHT_PICK" : phase;
    case "FLIGHT_PICK":
      return toolName === "promote_flights" ? "HOTEL_SEARCH" : phase;
    case "HOTEL_SEARCH":
      return (toolName === "hotel_search" || toolName === "hotel_search_and_rank") ? "HOTEL_PICK" : phase;
    case "HOTEL_PICK":
      if (toolName === "promote_hotels_to_lodging") return "ENRICH_EXCURSIONS";
      if (ctx.liveMode && toolName === "patch_trip" && inputHasLodging(input)) return "ENRICH_EXCURSIONS";
      return phase;
    case "ENRICH_EXCURSIONS":
      return toolName === "excursion_search" ? "APPLY_PICKS" : phase;
    case "APPLY_PICKS":
      return (toolName === "apply_gap_tour_picks" && isPersisted(resultJson)) ? "ENRICH_DINING" : phase;
    case "ENRICH_DINING":
      return toolName === "tripadvisor_search" ? "SUMMARY" : phase;
    case "SUMMARY":
      return phase; // SUMMARY -> EDITS is driven by session-do once the summary message is emitted
    case "EDITS":
      return reEnterFromEdit(toolName);
    default:
      return phase;
  }
}
