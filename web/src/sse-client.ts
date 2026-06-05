import type { ServerEvent } from "../../shared/events";

export async function streamChat(
  apiBase: string, sessionId: string, message: string, onEvent: (e: ServerEvent) => void,
): Promise<void> {
  const res = await fetch(`${apiBase}/chat?session=${encodeURIComponent(sessionId)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
  });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line) onEvent(JSON.parse(line.slice(5).trim()) as ServerEvent);
    }
  }
}
