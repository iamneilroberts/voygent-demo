import type { ToolSchema } from "../llm/provider";

type Fetch = typeof fetch;

export class McpClient {
  private id = 0;
  constructor(private url: string, private bearer: string, private f: Fetch = fetch) {}

  private async rpc(method: string, params: unknown): Promise<any> {
    const res = await this.f(this.url, {
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
    if (ct.includes("text/event-stream")) {
      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      const last = lines[lines.length - 1]?.slice(5).trim();
      return last ? JSON.parse(last) : {};
    }
    return JSON.parse(text);
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
