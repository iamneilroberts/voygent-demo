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

  // Write an error into the trailing empty assistant placeholder if present (so a failure
  // before any text doesn't leave a blank bubble + a second warning bubble); else append.
  function showError(msg: string) {
    setMessages((m) => {
      const c = [...m];
      if (c.length && c[c.length - 1].role === "assistant" && c[c.length - 1].text === "") {
        c[c.length - 1] = { role: "assistant", text: `⚠ ${msg}` };
      } else {
        c.push({ role: "assistant", text: `⚠ ${msg}` });
      }
      return c;
    });
  }

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true); setTools([]);
    try {
      await streamChat(API_BASE, sessionId, text, (e) => {
        if (e.type === "text") setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + e.delta }; return c; });
        else if (e.type === "tool" && e.phase === "start") setTools((t) => [...t, e.tool]);
        else if (e.type === "folio") setFolio(e.folio);
        else if (e.type === "error") showError(e.message);
      });
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setBusy(false); // always clear busy, even on network/CORS/stream failure
    }
  }

  return (
    <div className="app">
      <header><strong>Voygent</strong> <span className="sub">AI travel-planning agent</span> <span className="by">built by Neil Roberts</span></header>
      <div className="cols">
        <ChatView messages={messages} tools={tools} onSend={send} busy={busy} />
        <FolioPanel folio={folio} />
      </div>
    </div>
  );
}
