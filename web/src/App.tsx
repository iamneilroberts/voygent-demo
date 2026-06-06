import { useEffect, useRef, useState } from "react";
import { streamChat } from "./sse-client";
import { ChatView, type ChatMessage, type Preset } from "./ChatView";
import { FolioPanel } from "./FolioPanel";
import type { FolioData } from "../../shared/events";
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead } from "./Inspector";
import { ThemeSwitch } from "./ThemeSwitch";
import { engState } from "./lib/inspector-state";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [geoCity, setGeoCity] = useState<string | null>(null);
  const sessionId = useRef(crypto.randomUUID()).current;
  const [collapsed, setCollapsed] = useState(false);
  const [insTools, setInsTools] = useState<InsTool[]>([]);
  const [insTurns, setInsTurns] = useState<InsTurn[]>([]);
  const [insSummaries, setInsSummaries] = useState<InsSummary[]>([]);
  const [insSavings, setInsSavings] = useState<InsSavings[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/presets`)
      .then((r) => r.json() as Promise<{ presets?: Preset[]; geo?: { city?: string | null } }>)
      .then((d) => { setPresets(d.presets ?? []); setGeoCity(d.geo?.city ?? null); })
      .catch(() => { /* welcome falls back to a generic greeting + text box */ });
  }, []);

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
        else if (e.type === "inspector") {
          if (e.kind === "tool") setInsTools((t) => [...t, e]);
          else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
          else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
          else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
          else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
        }
      });
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const eng = engState(insTools.length, collapsed);

  return (
    <div className="app">
      <header>
        <span className="brand"><strong>Voygent</strong> <span className="sub">AI travel-planning agent</span></span>
        <span className="by">built by Neil Roberts</span>
        <ThemeSwitch />
      </header>
      <div className="stage" data-eng={eng}>
        <section className="product">
          <ChatView messages={messages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
          <FolioPanel folio={folio} />
        </section>
        <section className="engineering" data-eng={eng}>
          <Inspector
            state={eng}
            // Manual collapse only applies once live; toggling during the pre-trip idle rail is a
            // no-op so a stray click can't latch `collapsed` and suppress the first-tool reveal.
            onToggleCollapse={() => { if (insTools.length > 0) setCollapsed((c) => !c); }}
            tools={insTools} turns={insTurns} summaries={insSummaries}
            savings={insSavings} overhead={insOverhead}
          />
        </section>
      </div>
      <footer className="meta">This interface was itself built by a coding agent.</footer>
    </div>
  );
}
