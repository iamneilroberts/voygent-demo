import { SseMultiplexer } from "./agent/sse";
import { runAgentLoop } from "./agent/loop";
import { tripToFolio } from "./agent/folio-sync";
import { McpClient } from "./mcp/client";
import { FixtureReplay, type ReplayHelpers } from "./mcp/replay";
import { presetRoutes } from "./fixtures/index";
import { ClaudeProvider } from "./llm/claude";
import type { ConversationMessage } from "./llm/provider";

interface Env { ANTHROPIC_API_KEY: string; VOYGENT_MCP_URL: string; VOYGENT_MCP_BEARER: string; }

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
  "2. Never mention credentials, API keys, tooling, staging, fixtures, or any internal plumbing. If a tool " +
  "errors, just say you couldn't pull results and offer an alternative — never explain why in technical terms.\n" +
  "3. Keep chat replies short and conversational — prose only. Do NOT paste markdown tables, headings, or long " +
  "structured lists into chat; the structured detail (flights, hotels, prices) belongs in the folio panel. " +
  "A little **bold** or a short bullet list is fine.\n\n" +
  "This demo has REAL captured search results for these featured trips — steer the traveler toward one " +
  "(matching its origin, destination, and dates gives the richest live results):\n" + FEATURED + "\n\n" +
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

export class SessionDO {
  private messages: ConversationMessage[] = [];
  private tripId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  private replay = new FixtureReplay(this.tripId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const { message } = await req.json<{ message: string }>();
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, this.env.VOYGENT_MCP_BEARER);
    const provider = new ClaudeProvider(this.env.ANTHROPIC_API_KEY);
    const mux = new SseMultiplexer();

    // The replay layer needs live access to the staging trip for the promote steps
    // (read which candidate ids the model staged; write back the real promoted object).
    const helpers: ReplayHelpers = {
      readTrip: async () => {
        const raw = await mcp.callTool("read_trip", { tripId: this.tripId, raw: true });
        try { const p = JSON.parse(raw); return p?.data ?? p ?? {}; } catch { return {}; }
      },
      patchTrip: async (updates) => { await mcp.callTool("patch_trip", { tripId: this.tripId, updates }); },
    };

    // Supplier-search / candidate-list / promote tools are replayed from real captured
    // fixtures (staging has no supplier creds); everything else runs live against staging.
    const callTool = (name: string, input: Record<string, unknown>): Promise<string> =>
      this.replay.isIntercepted(name)
        ? this.replay.handle(name, input as Record<string, any>, helpers)
        : mcp.callTool(name, input);

    // seed the conversation with the system hint as the first user message if empty
    if (this.messages.length === 0) this.messages.push({ role: "user", content: `${SYSTEM_HINT}\n\nMy trip_id is ${this.tripId}.` });
    this.messages.push({ role: "user", content: message });

    // Run the loop fire-and-forget; the open SSE response body keeps the
    // request (and isolate) alive until mux.close(). No waitUntil needed.
    void (async () => {
      try {
        const tools = await mcp.listTools();
        await runAgentLoop({
          provider, tools, messages: this.messages,
          callTool,
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* read_trip may wrap text; tolerate */ }
            // Overlay what promote_* actually committed. read_trip can momentarily
            // miss a just-written flights/lodging array due to KV eventual
            // consistency; the replay's retained result is authoritative and immediate.
            const data = (parsed && typeof parsed === "object" && parsed.data) ? parsed.data : (parsed ?? {});
            const promoted = this.replay.lastPromoted();
            if (promoted.flights != null) data.flights = promoted.flights;
            if (promoted.lodging != null) data.lodging = promoted.lodging;
            mux.send({ type: "folio", folio: tripToFolio(this.tripId, { data }) });
          },
          emit: (e) => mux.send(e),
        });
      } catch (e) {
        mux.send({ type: "error", message: (e as Error).message });
      } finally { mux.close(); }
    })();

    return new Response(mux.readable, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" },
    });
  }
}
