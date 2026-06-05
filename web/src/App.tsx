import { useRef, useState } from "react";
import { streamChat } from "./sse-client";
import { ChatView, type ChatMessage } from "./ChatView";
import { FolioPanel } from "./FolioPanel";
import type { FolioData } from "../../shared/events";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(crypto.randomUUID()).current;

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true); setTools([]);
    await streamChat(API_BASE, sessionId, text, (e) => {
      if (e.type === "text") setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + e.delta }; return c; });
      else if (e.type === "tool" && e.phase === "start") setTools((t) => [...t, e.tool]);
      else if (e.type === "folio") setFolio(e.folio);
      else if (e.type === "error") setMessages((m) => [...m, { role: "assistant", text: `⚠ ${e.message}` }]);
    });
    setBusy(false);
  }

  return (
    <div className="app">
      <header><strong>Voygent</strong> — a live demo of the MCP connector, built by Neil Roberts</header>
      <div className="cols">
        <ChatView messages={messages} tools={tools} onSend={send} busy={busy} />
        <FolioPanel folio={folio} />
      </div>
    </div>
  );
}
