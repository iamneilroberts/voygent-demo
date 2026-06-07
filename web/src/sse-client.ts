import type { ServerEvent } from "../../shared/events";

export async function streamChat(
  apiBase: string, sessionId: string, message: string, onEvent: (e: ServerEvent) => void,
  mode?: "boards", // claude skin: ask the worker for present-and-wait + board events
  extraBody?: Record<string, unknown>, // e.g. { model } / { routing } for per-phase model selection
): Promise<void> {
  const res = await fetch(`${apiBase}/chat?session=${encodeURIComponent(sessionId)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, ...(mode ? { mode } : {}), ...(extraBody ?? {}) }),
  });
  if (!res.ok) throw new Error(`chat request failed: HTTP ${res.status}`);
  if (!res.body) throw new Error("no response stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const drain = (chunk: string) => {
    buf += chunk;
    const frames = buf.split(/\r?\n\r?\n/); // tolerate LF or CRLF frame separators
    buf = frames.pop() ?? "";               // keep the trailing partial frame
    for (const frame of frames) {
      const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5).trim()) as ServerEvent); }
      catch { /* skip a malformed frame rather than abort the whole stream */ }
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    drain(dec.decode(value, { stream: true }));
  }
  drain(dec.decode()); // flush any bytes held by the decoder at EOF
}
