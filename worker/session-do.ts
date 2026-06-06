import { SseMultiplexer } from "./agent/sse";
import { runAgentLoop } from "./agent/loop";
import { createBoardBuilder, type BoardBuilder } from "./agent/boards";
import { tripToFolio } from "./agent/folio-sync";
import { McpClient } from "./mcp/client";
import { FixtureReplay, type ReplayHelpers } from "./mcp/replay";
import { presetRoutes } from "./fixtures/index";
import { ClaudeProvider } from "./llm/claude";
import { estimateCostUsd } from "./llm/cost";
import { withInspectorCost, sessionCostByModel, estTokens, utf8Bytes } from "./inspector";
import { encodeSse } from "../shared/events";
import type { ConversationMessage, TokenUsage } from "./llm/provider";
import type { ServerEvent } from "../shared/events";

interface Env {
  ANTHROPIC_API_KEY: string;
  VOYGENT_MCP_URL: string;
  VOYGENT_MCP_BEARER: string;
  SESSION: DurableObjectNamespace;        // self-namespace; a reserved instance is the budget ledger
  LLM_MODEL?: string;                     // cheap default while developing; override to sonnet for quality
  BUDGET_DAILY_USD?: string;              // global daily spend cap (default 5)
}

// Cost guardrail: the demo only needs these ~9 tools. Sending the full ~79-tool
// Voygent catalog every turn was the dominant cost; restrict to what's used.
const DEMO_TOOLS = new Set([
  "save_trip", "read_trip", "patch_trip",
  "flight_search", "flight_list", "promote_flights",
  "hotel_search", "hotel_list", "promote_hotels_to_lodging",
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

function utcDate(): string { return new Date().toISOString().slice(0, 10); }
interface BudgetRec { date: string; spent: number; }

export class SessionDO {
  private messages: ConversationMessage[] = [];
  private tripId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  private replay = new FixtureReplay(this.tripId);
  private lastBaselineTripJson: string | null = null;
  // Latched from the first /chat body; the whole session runs in one mode.
  private boardsMode = false;
  // Session-scoped so search→list dedupe survives across exchanges.
  private boardBuilder: BoardBuilder = createBoardBuilder();
  constructor(private state: DurableObjectState, private env: Env) {}

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
    const { message, mode } = await req.json<{ message: string; mode?: string }>();
    const model = this.env.LLM_MODEL || DEFAULT_MODEL;
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, this.env.VOYGENT_MCP_BEARER);
    const provider = new ClaudeProvider(this.env.ANTHROPIC_API_KEY, model);
    const mux = new SseMultiplexer();

    if (this.messages.length === 0) {
      this.boardsMode = mode === "boards";
      const seed = SYSTEM_HINT + (this.boardsMode ? `\n\n${BOARDS_WORKFLOW_OVERRIDE}` : "");
      this.messages.push({ role: "user", content: `${seed}\n\nMy trip_id is ${this.tripId}.` });
    }
    this.messages.push({ role: "user", content: message });

    // Per-session cost telemetry (server-side only — never sent to the client).
    let sessionCost = 0;
    const u: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

    // Inspector bookkeeping (Slice 1: summary spine).
    const exchangeId = crypto.randomUUID();
    let turnCount = 0;
    let toolCallCount = 0;
    let fullToolCount = 0;
    let exposedToolCount = 0;
    let instrumentationBytes = 0;
    let instrumentationMs = 0;
    let maxFolioTokens = 0;
    this.lastBaselineTripJson = null;

    // Cost-aware emit: inject real $ into zero-cost turn events; tally inspector counters.
    const emit = (e: ServerEvent): boolean => {
      const t0 = Date.now();
      const ev = withInspectorCost(e, model);
      if (ev.type === "inspector") {
        if (ev.kind === "turn") turnCount++;
        else if (ev.kind === "tool") toolCallCount++;
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
    const baseCallTool = (name: string, input: Record<string, unknown>): Promise<string> =>
      this.replay.isIntercepted(name)
        ? this.replay.handle(name, input as Record<string, any>, helpers)
        : mcp.callTool(name, input);

    const callTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
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
        // Restrict the catalog to the tools the demo actually uses (cost guardrail).
        const fullTools = await mcp.listTools();
        fullToolCount = fullTools.length;
        const tools = fullTools.filter((t) => DEMO_TOOLS.has(t.name));
        exposedToolCount = tools.length;
        emit({
          type: "inspector", kind: "savings", exchangeId, mechanism: "toolCatalog",
          tokensSaved: Math.max(0, estTokens(JSON.stringify(fullTools)) - estTokens(JSON.stringify(tools))),
          basis: "chars/4", scope: "perTurn",
          detail: `${exposedToolCount} of ${fullToolCount} tool schemas sent each turn`,
        });
        await runAgentLoop({
          provider, tools, messages: this.messages, exchangeId,
          callTool,
          buildBoard: this.boardsMode
            ? (name, resultText) => this.boardBuilder(name, resultText, this.tripId)
            : undefined,
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* tolerate */ }
            const data = (parsed && typeof parsed === "object" && parsed.data) ? parsed.data : (parsed ?? {});
            this.lastBaselineTripJson = JSON.stringify(data); // pre-overlay baseline for patch savings
            const promoted = this.replay.lastPromoted();
            if (promoted.flights != null) data.flights = promoted.flights;
            if (promoted.lodging != null) data.lodging = promoted.lodging;
            const folio = tripToFolio(this.tripId, { data });
            maxFolioTokens = Math.max(maxFolioTokens, estTokens(JSON.stringify(folio)));
            mux.send({ type: "folio", folio });
          },
          onUsage: (turn) => {
            u.inputTokens += turn.inputTokens; u.outputTokens += turn.outputTokens;
            u.cacheCreationTokens += turn.cacheCreationTokens; u.cacheReadTokens += turn.cacheReadTokens;
            sessionCost += estimateCostUsd(model, turn);
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
        // Inspector summary — emitted while the stream is still open.
        emit({
          type: "inspector", kind: "summary", exchangeId,
          turns: turnCount, toolCalls: toolCallCount, exposedToolCount, fullToolCount,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens, cacheCreationTokens: u.cacheCreationTokens,
          costByModel: sessionCostByModel(u),
        });
        mux.close();
        // Record cost: log (visible via `wrangler tail`) + add to the daily ledger.
        console.log(`[cost] model=${model} trip=${this.tripId} in=${u.inputTokens} out=${u.outputTokens} cacheR=${u.cacheReadTokens} cacheW=${u.cacheCreationTokens} usd=${sessionCost.toFixed(4)}`);
        if (sessionCost > 0) {
          try { await this.budgetStub().fetch("https://do/__budget/add", { method: "POST", body: JSON.stringify({ usd: sessionCost }) }); }
          catch { /* ledger update is best-effort */ }
        }
      }
    })();

    return new Response(mux.readable, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" },
    });
  }
}
