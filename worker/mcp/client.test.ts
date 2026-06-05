import { describe, it, expect, vi } from "vitest";
import { McpClient } from "./client";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
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
});
