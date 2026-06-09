import type { ToolSchema } from "../llm/provider";

type Fetch = typeof fetch;

export interface ServerInfo { name: string; version?: string }
export interface InitializeResult {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: ServerInfo;
  instructions?: string;
}

const PROTOCOL_VERSION = "2025-03-26";

export class McpClient {
  private id = 0;
  private sessionId: string | null = null;
  private _instructions: string | null = null;
  private _serverInfo: ServerInfo | null = null;
  constructor(private url: string, private bearer: string, private f: Fetch = fetch) {}

  /** Operating core delivered by the server's MCP `instructions`. Null until initialize(). */
  get instructions(): string | null { return this._instructions; }
  get serverInfo(): ServerInfo | null { return this._serverInfo; }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "authorization": `Bearer ${this.bearer}`,
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    };
    if (this.sessionId) h["mcp-session-id"] = this.sessionId;
    return h;
  }

  private async rpc(method: string, params: unknown): Promise<any> {
    // Call through a local binding, NOT `this.f(...)`: invoking the global `fetch` as a
    // method of this instance strips its required `this` and throws "Illegal invocation"
    // under the Workers runtime (a unit test with a mock fetch can't catch this).
    const doFetch = this.f;
    const res = await doFetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}`);
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const payload = await this.parseBody(res);
    if (payload.error) throw new Error(`MCP ${method}: ${payload.error.message}`);
    return payload.result;
  }

  /** Fire-and-forget JSON-RPC notification (no id, no result expected). */
  private async notify(method: string, params: unknown): Promise<void> {
    const doFetch = this.f;
    const res = await doFetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });
    if (!res.ok && res.status !== 202 && res.status !== 204) {
      throw new Error(`MCP ${method} HTTP ${res.status}`);
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
  }

  /** MCP initialize handshake. Captures serverInfo + instructions + session id, then sends initialized. */
  async initialize(): Promise<InitializeResult> {
    const result = (await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "voygent-demo", version: "1.0.0" },
    })) as InitializeResult | undefined;
    const r: InitializeResult = (result && typeof result === "object") ? result : {};
    this._instructions = r.instructions ?? null;
    this._serverInfo = r.serverInfo ?? null;
    await this.notify("notifications/initialized", {});
    return r;
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
