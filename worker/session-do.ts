import { SseMultiplexer } from "./agent/sse";
import { runAgentLoop } from "./agent/loop";
import { INITIAL_PHASE, advancePhase, phaseDirective, shouldInjectPhaseDirectiveAfterBatch, isBeforeSummary, type TripPhase, type PhaseCtx } from "./agent/phases";
import { createBoardBuilder, type BoardBuilder } from "./agent/boards";
import { tripToFolio } from "./agent/folio-sync";
import { McpClient } from "./mcp/client";
import { FixtureReplay, type ReplayHelpers } from "./mcp/replay";
import { msgKey, shrinkForStorage, MSG_PREFIX, type SessRecord } from "./session-store";
import { type ModelId, type ModelRouting, DEFAULT_ROUTING, enabledModels, buildRouting, resolveRoutingModel } from "../shared/models";
import { presetRoutes } from "./fixtures/index";
import { ClaudeProvider } from "./llm/claude";
import { estimateCostUsd } from "./llm/cost";
import { withInspectorCost, sessionCostByModel, estTokens, utf8Bytes } from "./inspector";
import { STATS_INSERT_SQL, statsRowFromSummary, type StatsSummary } from "./stats";
import { encodeSse } from "../shared/events";
import type { ConversationMessage, TokenUsage } from "./llm/provider";
import type { ServerEvent } from "../shared/events";

interface Env {
  ANTHROPIC_API_KEY: string;
  VOYGENT_MCP_URL: string;
  VOYGENT_MCP_BEARER: string;
  SESSION: DurableObjectNamespace;        // self-namespace; a reserved instance is the budget ledger
  LLM_MODEL?: string;                     // default/fallback model; per-turn routing overrides per call
  BUDGET_DAILY_USD?: string;              // global daily spend cap (default 5)
  DEMO_OPUS_ENABLED?: string;             // when set, Opus is offered/accepted (abuse gate; default off)
  DEMO_TEST_TOKEN?: string;               // test/smoke runs carrying this header skip the public ledger
  DEMO_PHASE_MACHINE?: string;           // when set, SessionDO drives the deterministic build phase machine
  STATS_DB?: D1Database;                  // optional: per-exchange engineering-stats history (no-op when unbound)
}

// Public-surface denylist (Neil 2026-06-07): the catalog stays claude.ai-faithful
// (~110 of ~120 tools, token economics unchanged) but destructive / outward-facing
// tools are withheld — a visitor prompt must not be able to delete trips, email
// clients, publish to subdomains, or mutate the advisor's CRM under the real MCP
// user. The demo's workflows use none of these.
const DENYLISTED_TOOLS = new Set([
  "delete_trip", "delete_booking", "delete_trip_document", "delete_annotation_pii",
  "publish_trip", "publish_folio", "publish_to_client", "share_folio",
  "update_advisor_profile", "manage_clients", "manage_pipeline", "record_payment",
  "report_issue", "update_issue",
]);

const DEFAULT_MODEL = "claude-haiku-4-5";  // cheap while we work; flip via LLM_MODEL secret
const DEFAULT_DAILY_CAP_USD = 5;

const FEATURED = presetRoutes()
  .map((r) => `• ${r.label}: ${r.origin}→${r.destination} (${r.city}), ${r.depart} to ${r.ret}, 2 travelers`)
  .join("\n");

const SYSTEM_HINT =
  "You are Voygent, a travel-planning assistant. You build a trip live by calling the Voygent " +
  "MCP tools, and a folio panel beside the chat renders the trip's flights and hotels as you commit them.\n\n" +
  "ABSOLUTE RULES — never break these:\n" +
  "1. Use ONLY data returned by tool calls. NEVER invent or estimate flights, hotels, prices, schedules, " +
  "airlines, or availability from your own knowledge. If a search returns no results, say so plainly " +
  "('I couldn't pull live results for that route — want to try one of the featured trips, or different dates?') " +
  "and offer to adjust. Fabricating travel data is never acceptable.\n" +
  "2. Never describe how this system works internally. Do NOT say 'captured data', 'demo', 'demo environment', " +
  "'featured-only', 'replay', credentials, API keys, staging, or fixtures. If a search returns nothing, just " +
  "say you couldn't pull live results for that route and offer one of the trips below as a great option you can " +
  "build right now — never explain why in technical terms.\n" +
  "3. Keep chat replies short and conversational — prose only. Do NOT paste markdown tables, headings, or long " +
  "structured lists into chat; the structured detail (flights, hotels, prices) belongs in the folio panel. " +
  "A little **bold** or a short bullet list is fine; the occasional emoji is okay but don't overdo it.\n\n" +
  "You can build any of these standout trips with rich, real options — steer the traveler toward one (use its " +
  "origin, destination, and dates):\n" + FEATURED + "\n\n" +
  "BEFORE BUILDING: if the traveler hasn't given you the essentials — where FROM, where TO, WHEN, and HOW MANY " +
  "travelers — ask for the missing ones in one short, friendly question before you search. Never invent missing " +
  "trip parameters. If they picked a featured trip or already gave everything, skip the questions and build.\n\n" +
  "WORKFLOW (one category at a time):\n" +
  "1. FIRST create the trip: call save_trip with this trip's id (tripId) and data " +
  "{ meta: { title, destination, dates }, flights: [], lodging: [] }. read_trip/patch_trip 404 until it exists.\n" +
  "2. FLIGHTS: call flight_search with { source:'serp', trip_id:<tripId>, origin, destination, departure_date, " +
  "return_date, adults }. Review the returned candidates, choose the best ONE, stage it with patch_trip " +
  "updates { flights: [ { _candidateId: '<id>' } ] }, then call promote_flights. The real flight then appears " +
  "in the folio. Use only candidate ids returned by the search.\n" +
  "3. HOTELS: call hotel_search with { source:'serp', trip_id:<tripId>, location:<city>, check_in, check_out, " +
  "adults }. Choose 2-3, stage them with patch_trip updates { hotels: [ { _candidateId:'<id>' }, ... ] }, then " +
  "call promote_hotels_to_lodging. They appear in the folio as client options.\n" +
  "4. Always stage with patch_trip using the FULL array value, never indexed paths like flights.0.x.\n" +
  "5. Briefly narrate what you're doing in chat; let the folio carry the details.";

// Boards mode (claude skin): the UI renders flight/hotel candidates as clickable
// option cards beside the chat, so the model must present-and-wait instead of
// auto-picking. Appended to the seed message ONLY when the client opts in —
// the default path's seed stays byte-identical.
const BOARDS_WORKFLOW_OVERRIDE =
  "WHEN PRESENTING OPTIONS (this overrides the auto-pick steps above): after flight_search/flight_list " +
  "(and hotel_search/hotel_list) return candidates, STOP and let the traveler choose. Do NOT stage or " +
  "promote a flight or hotel until the traveler tells you which option they picked. Present the options " +
  "in one short, friendly sentence — the option cards render beside your message, so don't enumerate them " +
  "in text — and end your turn. When the traveler replies with a chosen option id, stage THAT exact id " +
  "with patch_trip and call the matching promote tool. For hotels the traveler may pick one or more. " +
  "Never auto-select.";

// Live-trip workflow (additive, all sessions): when the traveler's destination
// is NOT one of the featured trips, the session passes through to real Voygent
// tools (full catalog, no replay). The model needs the real schemas + the real
// enrichment chain, which differ from the fixture-replay shortcuts above.
const LIVE_TRIP_WORKFLOW =
  "LIVE TRIPS — if the traveler's destination is NOT one of the featured trips listed above, you are driving real Voygent " +
  "tools end to end. Follow these steps IN ORDER; do NOT use the featured-trip steps 6a-7. " +
  "FLIGHTS (live): flight_search { source:'serp', trip_id, origin, destination, departure_date, return_date, adults }, " +
  "then flight_list { tripId, action:'list' } to distill candidates — present from flight_list's results, and stage the " +
  "chosen one with patch_trip updates { flights: [ { _candidateId: '<id from flight_list>' } ] } BEFORE promote_flights. " +
  "Never promote before flight_list has returned the candidate ids. " +
  "HOTELS (live): use hotel_search_and_rank { destination, check_in, check_out, travelers:{ adults } } — NOT " +
  "hotel_search — it returns advisor commission data alongside prices. Only if it errors or returns no hotels, fall " +
  "back to hotel_search { source:'serp', ... }. Lock in the picked hotel with patch_trip updates { lodging: [ { name, " +
  "checkIn, checkOut, price, commission, commissionPct, notes } ] } using exact values from the result — copy the " +
  "result's commission and commission_pct verbatim into commission / commissionPct when present; OMIT both fields " +
  "when the source has none (e.g. serp); NEVER estimate or invent commission. " +
  "ENRICHMENT (live, strict order): IMMEDIATELY after the hotel is locked in (promote_hotels_to_lodging or the lodging " +
  "patch succeeds), in the SAME turn, BEFORE writing any summary text, run L1-L4 — the trip is NOT complete without " +
  "them, and there is NO approval step: " +
  "(L1) FIRST patch_trip updates { itinerary: [ { day: 1, date: <date>, location: <city> }, ... ] } — one day per " +
  "night, EVERY day with a location, full array. apply_gap_tour_picks WILL FAIL if this hasn't happened yet. " +
  "(L2) resolve_destination { query: <city> }, then excursion_search { source:'viator', destination_id: <viator id " +
  "from L2>, destination_name: <city>, date: <departure_date> } — viator REQUIRES destination_id; destination_name " +
  "alone is invalid. " +
  "(L3) apply_gap_tour_picks { tripId, picks: [ { day, productCode }, ... ] } — 2-3 productCodes from L2's results. " +
  "(L4) tripadvisor_search { query: 'best restaurants in <city>', category: 'restaurants' }, then read_trip and " +
  "rewrite the FULL itinerary array with patch_trip, keeping every day and every activity L3 added, now adding " +
  "dining: [ { name, description, cuisine, url } ] spread across the days (4-6 picks total). Never use indexed paths. " +
  "Then step 8 (summarize what you added, exact names only) applies to live trips too.";

// Category sequencing (boards mode only, additive): Neil's 2026-06-07 feedback —
// the model searched flights+hotels in parallel and presented both boards at
// once. Desired demo flow: flights -> traveler picks -> ack -> hotels with a
// short opinionated recommendation -> traveler picks -> enrichment.
const SEQUENCED_BOARDS_WORKFLOW =
  "CATEGORY SEQUENCING (strict): work ONE category at a time, flights THEN hotels. On the first build turn call " +
  "save_trip and flight_search — plus flight_list { tripId, action:'list' } when this is a live (non-featured) trip, " +
  "so the option cards can render — and NO hotel tools until the traveler has picked a flight. Present the " +
  "flight options and end your turn. After the traveler picks a flight, stage and promote it, acknowledge the " +
  "lock-in in one short sentence, then IN THE SAME TURN call hotel_search and present the hotel options. When " +
  "presenting hotels, add a 2-3 line recommendation: which one or two YOU would pick and why (value, location, " +
  "rating) — the cards carry the details, your text carries the judgment. Enrichment (excursions + dining) still " +
  "runs only after promote_hotels_to_lodging, per the enrichment rules.";

// Enrichment workflow (additive, all sessions): after flights+hotels, build out
// the rest of the trip. Orthogonal to BOARDS_WORKFLOW_OVERRIDE — both are appended.
// Excursion selection boards are NOT built yet (deferred), so enrichment
// categories auto-add even in boards mode.
const ENRICHMENT_WORKFLOW =
  "ENRICHMENT IS MANDATORY AND NON-INTERACTIVE — the trip is NOT complete after flights and hotels, and enrichment has NO approval step: " +
  "you choose and apply yourself, then report what you added. Immediately after the hotel is locked in, in the SAME turn, run the enrichment " +
  "sequence BEFORE writing any summary text. There are TWO sequences — pick by destination and NEVER mix them: FEATURED trips (destination is " +
  "in the featured list) use steps 6a-7 below; LIVE trips (any other destination) use ONLY steps L1-L4 from the LIVE TRIPS section instead.\n" +
  "FEATURED-TRIP SEQUENCE:\n" +
  "6a. excursion_search { source:'viator', destination_name:<city>, date:<departure_date> }\n" +
  "6b. apply_gap_tour_picks { tripId:<tripId>, picks:[ { day:<candidate's day>, productCode:<candidate's productCode> }, ... ] } — choose 2-3 " +
  "candidates from 6a's results — when any free (free:true) candidates exist include at least one, and always include at least one paid. Do NOT present candidates and ask; do NOT skip this call — " +
  "excursion_search alone saves NOTHING.\n" +
  "7. tripadvisor_search { query:'best restaurants in <city>', category:'restaurants' } — the returned dining picks save automatically.\n" +
  "8. ONLY AFTER 6b and 7 have both returned, write your message: summarize what you ADDED using exact names from the tool results, and note the " +
  "folio now carries the day-by-day plan, dining picks, and what's-included notes.\n" +
  "HARD DATA RULE: NEVER name a tour, activity, restaurant, price, or rating that did not come from a tool result in THIS conversation. " +
  "If a tool has not been called yet, CALL IT — never describe options from memory. Naming an un-returned item is a critical failure.";

function utcDate(): string { return new Date().toISOString().slice(0, 10); }
interface BudgetRec { date: string; spent: number; }

export class SessionDO {
  private messages: ConversationMessage[] = [];
  private tripId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  private replay = new FixtureReplay(this.tripId);
  private lastBaselineTripJson: string | null = null;
  // Latched from the first /chat body; the whole session runs in one mode.
  private boardsMode = false;
  // Latched true the first time a search leaves the featured-trip catalog:
  // from then on EVERY tool call passes through to real Voygent (no replay,
  // no patch sanitizer, folio rendered from real read_trip data). Featured
  // trips stay replay-driven — they are the "gif"; live trips are faithful.
  private liveMode = false;
  // One-shot host-nudge state (true = fired or behavior observed). Lives on
  // the instance + SessRecord so a nudge can't re-fire across exchange
  // boundaries or after a DO eviction.
  private nudges = { enrichment: false, flightList: false, hsr: false };
  // Visitor's model routing (server-coerced) + outcome-based phase milestone.
  private routing: ModelRouting = DEFAULT_ROUTING;
  private hotelsPromoted = false;
  // Build-phase machine state (phase-machine mode only; harmlessly idle otherwise).
  private tripPhase: TripPhase = INITIAL_PHASE;
  // Session-scoped so search→list dedupe survives across exchanges.
  private boardBuilder: BoardBuilder = createBoardBuilder();
  // How many of this.messages are already in durable storage (hydrated or persisted).
  private persistedMsgCount = 0;
  constructor(private state: DurableObjectState, private env: Env) {
    // Without this, a DO eviction between turns (user idles reading results)
    // wiped the conversation and minted a fresh tripId — the model would then
    // re-create the trip and orphan the original (live failure, 2026-06-07).
    state.blockConcurrencyWhile(() => this.hydrate());
  }

  private async hydrate(): Promise<void> {
    try {
      const sess = await this.state.storage.get<SessRecord>("sess");
      if (!sess) return; // fresh session (or the reserved __budget__ instance)
      this.tripId = sess.tripId;
      this.boardsMode = sess.boardsMode;
      this.liveMode = sess.liveMode ?? false;
      this.nudges = sess.nudges ?? { enrichment: false, flightList: false, hsr: false };
      this.routing = sess.routing ?? DEFAULT_ROUTING;
      this.tripPhase = sess.tripPhase ?? INITIAL_PHASE;
      this.replay = new FixtureReplay(this.tripId);
      this.replay.restore(sess.replay);
      // Re-derive the milestone from replay state so a mid-stream DO death (lodging
      // promoted but persist never ran) doesn't lose the phase (Codex #6).
      const promotedLodging = this.replay.lastPromoted().lodging;
      this.hotelsPromoted = (sess.hotelsPromoted ?? false) || !!(promotedLodging && promotedLodging.length);
      const stored = await this.state.storage.list<ConversationMessage>({ prefix: MSG_PREFIX });
      this.messages = [...stored.values()]; // zero-padded keys → list order = insertion order
      this.persistedMsgCount = this.messages.length;
    } catch (e) {
      // A failed hydration degrades to the old fresh-session behavior rather than erroring the DO.
      console.log(`[hydrate] failed, starting fresh: ${(e as Error).message}`);
    }
  }

  private async persistSession(): Promise<void> {
    try {
      const puts: Record<string, unknown> = {
        sess: { tripId: this.tripId, boardsMode: this.boardsMode, liveMode: this.liveMode, nudges: this.nudges, routing: this.routing, hotelsPromoted: this.hotelsPromoted, tripPhase: this.tripPhase, replay: this.replay.snapshot() } satisfies SessRecord,
      };
      for (let i = this.persistedMsgCount; i < this.messages.length; i++) {
        puts[msgKey(i)] = shrinkForStorage(this.messages[i]);
      }
      await this.state.storage.put(puts);
      this.persistedMsgCount = this.messages.length;
    } catch (e) {
      console.log(`[persist] failed (session continues in memory): ${(e as Error).message}`);
    }
  }

  // --- daily budget ledger (a single reserved DO instance, "__budget__") ---
  private capUsd(): number { return Number(this.env.BUDGET_DAILY_USD ?? DEFAULT_DAILY_CAP_USD); }
  private async readBudget(): Promise<BudgetRec> {
    const today = utcDate();
    const rec = (await this.state.storage.get<BudgetRec>("budget")) ?? { date: today, spent: 0 };
    return rec.date === today ? rec : { date: today, spent: 0 };
  }
  private budgetStub(): DurableObjectStub {
    return this.env.SESSION.get(this.env.SESSION.idFromName("__budget__"));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__budget/status") {
      const rec = await this.readBudget();
      const cap = this.capUsd();
      return Response.json({ date: rec.date, spentUsd: rec.spent, capUsd: cap, over: rec.spent >= cap });
    }
    if (url.pathname === "/__budget/add") {
      const { usd } = await req.json<{ usd: number }>();
      const rec = await this.readBudget();
      rec.spent += Number(usd) || 0;
      await this.state.storage.put("budget", rec);
      return Response.json(rec);
    }
    return this.handleChat(req);
  }

  private async handleChat(req: Request): Promise<Response> {
    // Test/smoke runs (valid secret header) don't count against the public daily ledger.
    const isTest = !!this.env.DEMO_TEST_TOKEN && req.headers.get("x-demo-test") === this.env.DEMO_TEST_TOKEN;
    // Stats identity: the session id the worker addressed this DO by (forwarded in the query)
    // + the wall-clock the exchange started, stamped into the stats row at finalize.
    const sessionId = new URL(req.url).searchParams.get("session") ?? "anon";
    const exchangeTs = Date.now();
    const body = await req.json<{ message: string; mode?: string; model?: unknown; routing?: { discovery?: unknown; enrichment?: unknown } }>();
    const { message, mode } = body;
    const fallbackModel = (this.env.LLM_MODEL || DEFAULT_MODEL) as ModelId;
    const model = fallbackModel; // ClaudeProvider default + cost fallback; per-turn routing overrides per call
    // Server-coerce the visitor's model choice through the enabled allowlist (the real Opus gate).
    const enabled = enabledModels(!!this.env.DEMO_OPUS_ENABLED);
    this.routing = buildRouting({ model: body.model, routing: body.routing }, enabled, fallbackModel);
    const phaseMachine = !!this.env.DEMO_PHASE_MACHINE;
    // ctx is just the two mode flags. They change DURING an exchange (liveMode
    // latches mid-run when a search leaves the featured catalog), so build it fresh
    // on each read rather than snapshotting. Directives carry no trip facts — the
    // model fills <destination city>/<departure_date> from the conversation.
    const buildPhaseCtx = (): PhaseCtx => ({ boardsMode: this.boardsMode, liveMode: this.liveMode });
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, this.env.VOYGENT_MCP_BEARER);
    const provider = new ClaudeProvider(this.env.ANTHROPIC_API_KEY, model);
    const mux = new SseMultiplexer();

    const isFirstTurn = this.messages.length === 0;
    if (isFirstTurn) {
      this.boardsMode = mode === "boards";
      const seed = SYSTEM_HINT
        + (this.boardsMode ? `\n\n${BOARDS_WORKFLOW_OVERRIDE}\n\n${SEQUENCED_BOARDS_WORKFLOW}` : "")
        + `\n\n${ENRICHMENT_WORKFLOW}\n\n${LIVE_TRIP_WORKFLOW}`;
      this.messages.push({ role: "user", content: `${seed}\n\nMy trip_id is ${this.tripId}.` });
    }
    this.messages.push({ role: "user", content: message });
    if (phaseMachine && isFirstTurn && isBeforeSummary(this.tripPhase)) {
      this.messages.push({ role: "user", content: phaseDirective(this.tripPhase, buildPhaseCtx()) });
    }

    // Per-session cost telemetry (server-side only — never sent to the client).
    // sessionCost = MEASURED actual routed spend (per-turn model). Distinct from
    // the counterfactual sessionCostByModel(u) shown in the business case.
    let sessionCost = 0;
    const actualCostByModel: Record<string, number> = {};
    const u: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
    // Resolve the model for the upcoming turn from the visitor's routing + the
    // live milestone (re-read every turn so the model can flip mid-exchange).
    const nextModel = (): string => resolveRoutingModel(this.routing, this.hotelsPromoted);

    // Inspector bookkeeping (Slice 1: summary spine).
    const exchangeId = crypto.randomUUID();
    let turnCount = 0;
    let toolCallCount = 0;
    let fullToolCount = 0;
    let exposedToolCount = 0;
    let instrumentationBytes = 0;
    let instrumentationMs = 0;
    let maxFolioTokens = 0;
    // Sum of every emitted savings event (patch + searchDistill + template) this
    // exchange — the ESTIMATE persisted as saved_tokens. Read after the template
    // savings is emitted in `finally`, so it includes the per-render figure.
    let savedTokens = 0;
    this.lastBaselineTripJson = null;

    // Cost-aware emit: inject real $ into zero-cost turn events; tally inspector counters.
    const emit = (e: ServerEvent): boolean => {
      const t0 = Date.now();
      const ev = withInspectorCost(e, model);
      if (ev.type === "inspector") {
        if (ev.kind === "turn") turnCount++;
        else if (ev.kind === "tool") toolCallCount++;
        else if (ev.kind === "savings") savedTokens += ev.tokensSaved;
        if (ev.kind !== "overhead" && ev.kind !== "summary") {
          instrumentationBytes += utf8Bytes(encodeSse(ev));
        }
        instrumentationMs += Date.now() - t0;
      }
      return mux.send(ev);
    };

    const helpers: ReplayHelpers = {
      readTrip: async () => {
        const raw = await mcp.callTool("read_trip", { tripId: this.tripId, raw: true });
        try { const p = JSON.parse(raw); return p?.data ?? p ?? {}; } catch { return {}; }
      },
      patchTrip: async (updates) => { await mcp.callTool("patch_trip", { tripId: this.tripId, updates }); },
    };
    const SEARCH_TOOLS = new Set(["flight_search", "hotel_search", "hotel_search_and_rank"]);
    const baseCallTool = (name: string, input: Record<string, unknown>): Promise<string> => {
      if (this.liveMode) return mcp.callTool(name, input); // faithful pass-through, no interception
      const intercepted = this.replay.isIntercepted(name) || name === "hotel_search_and_rank";
      if (!intercepted) return mcp.callTool(name, input);
      if (SEARCH_TOOLS.has(name) && !this.replay.matchesFixture(name, input as Record<string, any>)) {
        this.liveMode = true; // destination left the featured catalog — latch live for the rest of the session
        return mcp.callTool(name, input);
      }
      // Featured trip: hotel_search_and_rank serves the hotel fixture (replay
      // reads location ?? destination, so cpmaxx-style args map cleanly).
      return this.replay.handle(name === "hotel_search_and_rank" ? "hotel_search" : name, input as Record<string, any>, helpers);
    };

    const callTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      // Fabrication guard: strip enrichment-content keys from model-initiated patch_trip.
      // Replay's own helpers.patchTrip calls mcp.callTool directly (bypassing this wrapper),
      // so fixture-keyed enrichment writes are unaffected.
      if (name === "patch_trip" && !this.liveMode) {
        const inAny = input as any;
        const updates = inAny.updates ?? inAny;
        if (updates && typeof updates === "object") {
          for (const k of ["itinerary", "days", "activities", "dining", "includes"]) delete updates[k];
        }
      }
      // patch savings: incremental patch vs full-trip rewrite (baseline-gated, clamped ≥0).
      if (name === "patch_trip" && this.lastBaselineTripJson) {
        const updates = (input as any).updates ?? input;
        emit({
          type: "inspector", kind: "savings", exchangeId, mechanism: "patch",
          tokensSaved: Math.max(0, estTokens(this.lastBaselineTripJson) - estTokens(JSON.stringify(updates))),
          basis: "chars/4", scope: "aggregate", detail: "incremental patch vs full-trip rewrite",
        });
      }
      const out = await baseCallTool(name, input);
      // Outcome-based phase milestone (Codex #1): flip to enrichment only when a
      // hotel lock actually SUCCEEDED with lodging — never on intent alone.
      if (!this.hotelsPromoted && !out.startsWith("ERROR")) {
        if (name === "promote_hotels_to_lodging") this.hotelsPromoted = true;
        else if (this.liveMode && name === "patch_trip") {
          const updates = (input as any).updates ?? input;
          const lodging = updates && typeof updates === "object" ? (updates as any).lodging : undefined;
          if (Array.isArray(lodging) && lodging.length) this.hotelsPromoted = true;
        }
        // Featured trips promote via the replay layer — trust its committed lodging.
        if (!this.hotelsPromoted && !this.liveMode) {
          const pl = this.replay.lastPromoted().lodging;
          if (pl && pl.length) this.hotelsPromoted = true;
        }
      }
      // searchDistill: prod response size (fixture meta) vs the slim payload the model saw.
      if (this.replay.isIntercepted(name)) {
        const m = this.replay.lastMeasurement();
        const fx = this.replay.currentFixture();
        const metaKey = m?.tool as ("flightSearch" | "flightList" | "hotelSearch" | "hotelList" | undefined);
        const meta = metaKey && fx?.meta ? fx.meta[metaKey] : undefined;
        if (m && meta) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "searchDistill",
            tokensSaved: Math.max(0, meta.rawTokensEst - m.modelFacingTokens),
            basis: "chars/4", scope: "aggregate",
            detail: `prod ${m.tool} returned ~${meta.rawTokensEst} tok → model saw ~${m.modelFacingTokens} tok`,
          });
        }
      }
      return out;
    };

    void (async () => {
      try {
        // Full catalog, claude.ai-faithful (Neil 2026-06-07): send every tool the
        // per-user MCP URL exposes, exactly like a real Claude connector session.
        // Cost is absorbed by the prompt-cache breakpoints (tools array + moving
        // conversation breakpoint in claude.ts) — cache reads bill at ~0.1x.
        const fullTools = await mcp.listTools();
        fullToolCount = fullTools.length;
        // Sort by name: prompt caching is prefix-exact, so a stable order keeps
        // the tools-block cache key deterministic even if the upstream catalog
        // re-registers in a different order across deploys.
        const tools = fullTools
          .filter((t) => !DENYLISTED_TOOLS.has(t.name))
          .sort((a, b) => a.name.localeCompare(b.name));
        exposedToolCount = tools.length;
        // One-shot enrichment nudge: when the hotel lands and enrichment hasn't
        // run yet this session, remind the model in the SAME turn. Deterministic
        // backstop for the prompt's "same turn, before summary" rule. One-shot
        // state lives on this.nudges (persisted), not per-exchange locals.
        const nudge = (batch: Array<{ name: string; input: Record<string, unknown> }>): string | null => {
          const names = new Set(batch.map((b) => b.name));
          if (names.has("apply_gap_tour_picks") || names.has("excursion_search")) this.nudges.enrichment = true;
          if (names.has("flight_list")) this.nudges.flightList = true;
          if (names.has("hotel_search_and_rank")) this.nudges.hsr = true;
          // Live hotels: hotel_search_and_rank carries commission data AND a
          // board-renderable shape; plain serp hotel_search renders no cards.
          if (this.liveMode && names.has("hotel_search") && !this.nudges.hsr) {
            this.nudges.hsr = true;
            return "[host reminder] This is a live trip: hotels come from hotel_search_and_rank { destination, check_in, "
              + "check_out, travelers:{ adults } } — call it now and present from ITS results (it carries advisor "
              + "commission and renders the traveler's option cards). hotel_search is only the fallback if it fails.";
          }
          // Live flights distill: raw flight_search results carry no candidate
          // ids, so the option cards can't render until flight_list runs. The
          // model reliably skips the buried conditional — remind it once.
          if (this.liveMode && names.has("flight_search") && !this.nudges.flightList) {
            this.nudges.flightList = true;
            return "[host reminder] This is a live trip: now call flight_list { tripId, action:'list' } to distill the "
              + "flight candidates, and present from ITS results — the traveler's option cards only render from "
              + "flight_list. Do not stage or promote a flight before flight_list has returned its candidate ids.";
          }
          const lodgingPatched = batch.some((b) => {
            if (b.name !== "patch_trip") return false;
            const updates = (b.input as any).updates ?? b.input;
            return updates && typeof updates === "object" && "lodging" in updates;
          });
          const hotelLanded = names.has("promote_hotels_to_lodging") || (this.liveMode && lodgingPatched);
          if (this.nudges.enrichment || !hotelLanded) return null;
          this.nudges.enrichment = true;
          return "[host reminder] The hotel is locked in but the trip has NO activities or dining yet. Before writing any "
            + "summary, run the enrichment sequence NOW in this same turn: featured trips → steps 6a-7; live trips → steps "
            + "L1-L4 (L1 itinerary scaffold first). This is mandatory and has no approval step.";
        };
        let continuations = 0;
        const MAX_CONTINUATIONS = 4;
        await runAgentLoop({
          provider, tools, messages: this.messages, exchangeId,
          callTool, nextModel,
          nudge: phaseMachine ? undefined : nudge,
          afterToolBatch: phaseMachine ? (batch) => {
            for (const b of batch) {
              let parsed: any = null;
              try { parsed = JSON.parse(b.result); } catch { /* non-JSON tool result */ }
              const next = advancePhase(this.tripPhase, b.name, b.input, parsed, buildPhaseCtx());
              if (next !== this.tripPhase) {
                this.tripPhase = next;
                emit({ type: "inspector", kind: "phase", exchangeId, phase: next, via: b.name });
              }
            }
            // Hand the model the CURRENT phase's directive after every tool batch —
            // including SUMMARY, so the model writes the closing message right after the
            // dining result. EDITS = post-build, no directive.
            return shouldInjectPhaseDirectiveAfterBatch(this.tripPhase, buildPhaseCtx())
              ? phaseDirective(this.tripPhase, buildPhaseCtx())
              : null;
          } : undefined,
          continueDirective: phaseMachine ? () => {
            // The model stopped with no tool calls.
            // 1) Boards present-and-wait: a stop at a boards pick phase IS the model
            //    correctly waiting for the human — do NOT auto-continue.
            if (this.boardsMode && (this.tripPhase === "FLIGHT_PICK" || this.tripPhase === "HOTEL_PICK")) return null;
            // 2) At SUMMARY the model just wrote the closing message → advance to EDITS and end.
            if (this.tripPhase === "SUMMARY") { this.tripPhase = "EDITS"; return null; }
            // 3) Post-build (EDITS) → end the turn.
            if (!isBeforeSummary(this.tripPhase)) return null;
            // 4) Stopped mid-build: re-prompt with the current directive, capped. On the
            //    cap, force the SUMMARY directive so the trip always gets a closing message.
            if (continuations >= MAX_CONTINUATIONS) { this.tripPhase = "SUMMARY"; return phaseDirective("SUMMARY", buildPhaseCtx()); }
            continuations++;
            return phaseDirective(this.tripPhase, buildPhaseCtx());
          } : undefined,
          buildBoard: this.boardsMode
            ? (name, resultText) => this.boardBuilder(name, resultText, this.tripId)
            : undefined,
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* tolerate */ }
            const data = (parsed && typeof parsed === "object" && parsed.data) ? parsed.data : (parsed ?? {});
            this.lastBaselineTripJson = JSON.stringify(data); // pre-overlay baseline for patch savings
            if (!this.liveMode) {
              const promoted = this.replay.lastPromoted();
              if (promoted.flights != null) data.flights = promoted.flights;
              if (promoted.lodging != null) data.lodging = promoted.lodging;
              // Replay-controlled for FEATURED trips — a model-written itinerary is dropped.
              // Live trips render whatever the real trip carries (faithful).
              if (promoted.itinerary != null) data.itinerary = promoted.itinerary;
              else delete data.itinerary;
            }
            const folio = tripToFolio(this.tripId, { data });
            maxFolioTokens = Math.max(maxFolioTokens, estTokens(JSON.stringify(folio)));
            mux.send({ type: "folio", folio });
          },
          onUsage: (turn, turnModel) => {
            u.inputTokens += turn.inputTokens; u.outputTokens += turn.outputTokens;
            u.cacheCreationTokens += turn.cacheCreationTokens; u.cacheReadTokens += turn.cacheReadTokens;
            const m = turnModel || model;
            const c = estimateCostUsd(m, turn);
            sessionCost += c;                                   // MEASURED routed spend
            actualCostByModel[m] = (actualCostByModel[m] ?? 0) + c;
          },
          emit,
        });
      } catch (e) {
        mux.send({ type: "error", message: (e as Error).message });
      } finally {
        if (maxFolioTokens > 0) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "template",
            tokensSaved: maxFolioTokens, basis: "chars/4", scope: "perRender",
            detail: "deterministic render payload (chars÷4) the model never had to generate — not a model-measured count",
          });
        }
        emit({
          type: "inspector", kind: "overhead", exchangeId,
          instrumentationMs: instrumentationMs > 0 ? instrumentationMs : null,
          instrumentationBytes, addedModelTokens: 0,
        });
        // Inspector summary — emitted while the stream is still open. The same
        // numbers feed the stats row (savedTokens now includes the template
        // savings emitted just above).
        const summary: StatsSummary = {
          turns: turnCount, toolCalls: toolCallCount, exposedToolCount, fullToolCount,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens, cacheCreationTokens: u.cacheCreationTokens,
          costByModel: sessionCostByModel(u),          // counterfactual (all-tier)
          actualCostUsd: sessionCost,                  // measured routed spend
          actualCostByModel: { ...actualCostByModel },
        };
        emit({ type: "inspector", kind: "summary", exchangeId, ...summary });
        // Record cost: log (visible via `wrangler tail`).
        console.log(`[cost] model=${model} trip=${this.tripId} in=${u.inputTokens} out=${u.outputTokens} cacheR=${u.cacheReadTokens} cacheW=${u.cacheCreationTokens} usd=${sessionCost.toFixed(4)}`);
        // Anchor the telemetry writes BEFORE mux.close() — a detached tail after
        // close can be lost on DO eviction (Codex #2). Both are best-effort:
        // allSettled never rejects, so a D1/ledger failure never aborts the turn.
        // Stats writes skip test/smoke runs and no-op when STATS_DB is unbound.
        await Promise.allSettled([
          (this.env.STATS_DB && !isTest)
            ? this.env.STATS_DB.prepare(STATS_INSERT_SQL)
                .bind(...statsRowFromSummary(
                  summary,
                  { sessionId, exchangeId, tripId: this.tripId, boardsMode: this.boardsMode, liveMode: this.liveMode, routing: this.routing },
                  savedTokens, exchangeTs,
                ))
                .run()
            : Promise.resolve(),
          (sessionCost > 0 && !isTest)
            ? this.budgetStub().fetch("https://do/__budget/add", { method: "POST", body: JSON.stringify({ usd: sessionCost }) })
            : Promise.resolve(),
        ]);
        mux.close();
        await this.persistSession();
      }
    })();

    return new Response(mux.readable, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" },
    });
  }
}
