import { describe, it, expect, vi } from "vitest";
import { McpClient } from "./client";

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("McpClient", () => {
  it("listTools parses tools/list result", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "flight_search", input_schema: {} }] } }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    const tools = await c.listTools();
    expect(tools[0].name).toBe("flight_search");
  });

  it("callTool returns the text content of a tool result", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "5 flights" }] } }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    const out = await c.callTool("flight_search", { trip_id: "t1" });
    expect(out).toBe("5 flights");
  });

  it("listTools parses tools/list result from an SSE response", async () => {
    const payload = { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "x", input_schema: {} }] } };
    const sseBody = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    const f = vi.fn().mockResolvedValue(new Response(sseBody, { headers: { "content-type": "text/event-stream" } }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    const tools = await c.listTools();
    expect(tools[0].name).toBe("x");
  });
});

describe("McpClient.initialize", () => {
  it("captures instructions and serverInfo, then sends notifications/initialized", async () => {
    const calls: Array<{ method: string; hasId: boolean }> = [];
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const req = JSON.parse(init.body as string);
      calls.push({ method: req.method, hasId: req.id !== undefined });
      if (req.method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0", id: req.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "voygent", version: "1.2.3" },
              instructions: "You are Voygent. Drive manage_trip_goal.",
            },
          },
          { "mcp-session-id": "sess-abc" },
        );
      }
      return new Response("", { status: 202 }); // notifications/initialized
    });

    const c = new McpClient("https://mcp.test/mcp", "tok", f as any);
    const info = await c.initialize();

    expect(info.instructions).toBe("You are Voygent. Drive manage_trip_goal.");
    expect(info.serverInfo).toEqual({ name: "voygent", version: "1.2.3" });
    expect(c.instructions).toBe("You are Voygent. Drive manage_trip_goal.");
    expect(calls.map((x) => x.method)).toEqual(["initialize", "notifications/initialized"]);
    expect(calls[0].hasId).toBe(true);   // request
    expect(calls[1].hasId).toBe(false);  // notification
  });

  it("reuses the captured Mcp-Session-Id header on later calls", async () => {
    const seen: Array<string | null> = [];
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("mcp-session-id"));
      const req = JSON.parse(init.body as string);
      if (req.method === "initialize") {
        return jsonResponse(
          { jsonrpc: "2.0", id: req.id, result: { serverInfo: { name: "v" } } },
          { "mcp-session-id": "sess-xyz" },
        );
      }
      if (req.method === "tools/list") {
        return jsonResponse({ jsonrpc: "2.0", id: req.id, result: { tools: [] } });
      }
      return new Response("", { status: 202 });
    });
    const c = new McpClient("https://mcp.test/mcp", "tok", f as any);
    await c.initialize();
    expect(c.instructions).toBeNull();
    await c.listTools();
    // initialize → no session yet; tools/list (the last call) → carries the captured id
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe("sess-xyz");
  });
});

describe("McpClient.callToolRich", () => {
  it("surfaces _meta alongside the text content", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0", id: 2,
      result: {
        content: [{ type: "text", text: "5 flights" }],
        _meta: { "voygent/sizeStats": { rawBytes: 20626, distilledBytes: 3102 } },
      },
    }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    const out = await c.callToolRich("flight_search", { trip_id: "t1", include_size_stats: true });
    expect(out.text).toBe("5 flights");
    expect(out.meta).toEqual({ "voygent/sizeStats": { rawBytes: 20626, distilledBytes: 3102 } });
    // the args the caller passed go out verbatim (injection is the caller's job)
    const sent = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.params.arguments.include_size_stats).toBe(true);
  });

  it("returns meta:null when the result carries no _meta", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "ok" }] } }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    const out = await c.callToolRich("flight_search", {});
    expect(out).toEqual({ text: "ok", meta: null });
  });

  it("callTool keeps its string contract (text only, _meta dropped)", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({
      jsonrpc: "2.0", id: 2,
      result: { content: [{ type: "text", text: "ok" }], _meta: { "voygent/sizeStats": { rawBytes: 1, distilledBytes: 1 } } },
    }));
    const c = new McpClient("https://mcp.test/mcp", "bearer", f as any);
    expect(await c.callTool("x", {})).toBe("ok");
  });
});
