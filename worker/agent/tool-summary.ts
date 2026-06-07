// Humanize a raw tool result for the chat-facing tool chip's expanded body.
// Previously the chip showed `content.slice(0, 120)` — raw JSON cut mid-token
// (e.g. `…"consistencyWarnings":[{"type":"stag`). The full args/result still
// live in the Engineering Inspector; this is only the friendly one-liner.

const MAX = 140;

// Array keys commonly carrying a search tool's payload, checked in order.
const COUNT_KEYS = [
  "candidates", "results", "flights", "hotels", "properties",
  "excursions", "restaurants", "tours", "picks", "items",
];

export function summarizeToolResult(content: string): string {
  if (content.startsWith("ERROR:")) return clip(content, MAX);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return clip(content, MAX); }
  // Unwrap nested MCP envelopes from proxied tools ({content:[{type:"text",text:"<json>"}]}).
  for (let hops = 0; hops < 3; hops++) {
    const env = parsed as Record<string, any> | null;
    const inner = env && !Array.isArray(env) && Array.isArray(env.content) && env.content[0]?.type === "text"
      ? env.content[0].text : null;
    if (typeof inner !== "string") break;
    try { parsed = JSON.parse(inner); } catch { break; }
  }
  if (Array.isArray(parsed)) return `${parsed.length} item${parsed.length === 1 ? "" : "s"}`;
  if (!parsed || typeof parsed !== "object") return clip(content, MAX);
  const o = parsed as Record<string, unknown>;

  if (typeof o.error === "string" && o.error) return clip(`error: ${o.error}`, MAX);

  const parts: string[] = [];
  if (typeof o.status === "string") parts.push(o.status);
  else if (o.ok === true) parts.push("ok");
  if (Array.isArray(o.updatedFields) && o.updatedFields.length) {
    parts.push(`updated ${o.updatedFields.join(", ")}`);
  }
  for (const k of COUNT_KEYS) {
    const v = o[k];
    if (Array.isArray(v)) { parts.push(`${v.length} ${k}`); break; }
  }
  if (typeof o.count === "number" && !parts.some((p) => /\d+ /.test(p))) {
    parts.push(`${o.count} results`);
  }
  if (Array.isArray(o.consistencyWarnings) && o.consistencyWarnings.length) {
    parts.push(`${o.consistencyWarnings.length} warning${o.consistencyWarnings.length === 1 ? "" : "s"}`);
  }
  if (parts.length) return clip(parts.join(" · "), MAX);
  // Structured but unrecognized — name the top-level keys rather than dumping JSON.
  const keys = Object.keys(o);
  return keys.length ? clip(`ok · ${keys.slice(0, 5).join(", ")}`, MAX) : "ok";
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
