import { SseMultiplexer } from "./agent/sse";
import { runAgentLoop } from "./agent/loop";
import { tripToFolio } from "./agent/folio-sync";
import { McpClient } from "./mcp/client";
import { ClaudeProvider } from "./llm/claude";
import type { ConversationMessage } from "./llm/provider";

interface Env { ANTHROPIC_API_KEY: string; VOYGENT_MCP_URL: string; VOYGENT_MCP_BEARER: string; }

const SYSTEM_HINT =
  "You are Voygent, a travel-planning assistant driving the live Voygent MCP tools. " +
  "A trip-folio panel renders beside the chat; it shows whatever is in this trip's " +
  "flights[] and lodging[] arrays. Your job is to build that folio live as you work.\n\n" +
  "Workflow:\n" +
  "1. FIRST create the trip: call save_trip with this trip's id (tripId) and a data object " +
  "{ meta: { title, destination, dates, clientName }, flights: [], lodging: [] }. patch_trip and " +
  "read_trip return 404 until the trip exists, so this step is required before any others.\n" +
  "2. Then work one category at a time: flights first, then hotels.\n" +
  "3. Search with this trip's id so results accumulate (flight_search / hotel_search take a " +
  "trip_id; a 'serp' source works well and is fast). Search one category per step.\n" +
  "4. After each search, choose the best 2-3 options and WRITE them into the trip so they appear " +
  "in the folio, by calling patch_trip (it takes tripId) with the FULL array value — never indexed " +
  "paths like flights.0.x, which silently no-op. For flights, patch the `flights` array with objects " +
  "shaped { role, status, route, airline }. For hotels, patch the `lodging` array with objects shaped " +
  "{ name, location, nights, rate, total }.\n" +
  "5. Keep chat replies short and conversational — the rich detail lives in the folio panel.";

export class SessionDO {
  private messages: ConversationMessage[] = [];
  private tripId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const { message } = await req.json<{ message: string }>();
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, this.env.VOYGENT_MCP_BEARER);
    const provider = new ClaudeProvider(this.env.ANTHROPIC_API_KEY);
    const mux = new SseMultiplexer();

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
          callTool: (name, input) => mcp.callTool(name, input),
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* read_trip may wrap text; tolerate */ }
            mux.send({ type: "folio", folio: tripToFolio(this.tripId, parsed) });
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
