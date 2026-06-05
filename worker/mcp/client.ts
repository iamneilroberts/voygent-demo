import type { ToolSchema } from "../llm/provider";

type Fetch = typeof fetch;

export class McpClient {
  private id = 0;
  constructor(private url: string, private bearer: string, private f: Fetch = fetch) {}

  private async rpc(method: string, params: unknown): Promise<any> {
    // Call through a local binding, NOT `this.f(...)`: invoking the global `fetch` as a
    // method of this instance strips its required `this` and throws "Illegal invocation"
    // under the Workers runtime (a unit test with a mock fetch can't catch this).
    const doFetch = this.f;
    const res = await doFetch(this.url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.bearer}`,
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}`);
    const payload = await this.parseBody(res);
    if (payload.error) throw new Error(`MCP ${method}: ${payload.error.message}`);
    return payload.result;
  }

  private async parseBody(res: Response): Promise<any> {
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!ct.includes("text/event-stream")) return JSON.parse(text);
    // SSE: split into frames on blank lines; within a frame, concatenate `data:` lines
    // (stripping one optional leading space per the SSE spec). Return the last frame whose
    // joined data parses as JSON — that is the JSON-RPC response (ping/comment frames are skipped).
    let last: any = {};
    for (const frame of text.split(/\n\n+/)) {
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
      if (!data) continue;
      try { last = JSON.parse(data); } catch { /* skip non-JSON data frame */ }
    }
    return last;
  }

  async listTools(): Promise<ToolSchema[]> {
    const result = await this.rpc("tools/list", {});
    return (result.tools ?? []).map((t: any) => ({
      name: t.name, description: t.description, input_schema: t.inputSchema ?? t.input_schema ?? {},
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.rpc("tools/call", { name, arguments: args });
    const text = (result.content ?? [])
      .filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    return text || JSON.stringify(result);
  }
}
