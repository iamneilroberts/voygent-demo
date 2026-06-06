import { useEffect, useRef, useState } from "react";
import { streamChat } from "./sse-client";
import { ChatView, type ChatMessage, type Preset } from "./ChatView";
import { ClaudeChatView } from "./ClaudeChatView";
import { FolioPanel } from "./FolioPanel";
import type { FolioData, BoardCandidate } from "../../shared/events";
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead } from "./Inspector";
import { ThemeSwitch } from "./ThemeSwitch";
import { SkinSwitch } from "./SkinSwitch";
import { engState } from "./lib/inspector-state";
import { applyTheme, loadTheme } from "./lib/theme";
import { resolveInitialSkin, applySkin, type SkinId } from "./lib/skin";
import { isChatMessage, type TimelineItem, type BoardItem } from "./timeline";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function App() {
  // Timeline: user/assistant messages plus (claude skin only) inline toolchip +
  // board items. In the board skin only chat messages are ever pushed, so the
  // filtered view handed to ChatView is identical to the old messages array.
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [geoCity, setGeoCity] = useState<string | null>(null);
  const sessionId = useRef(crypto.randomUUID()).current;
  const [collapsed, setCollapsed] = useState(false);
  const [skin, setSkin] = useState<SkinId>(resolveInitialSkin);
  const [insTools, setInsTools] = useState<InsTool[]>([]);
  const [insTurns, setInsTurns] = useState<InsTurn[]>([]);
  const [insSummaries, setInsSummaries] = useState<InsSummary[]>([]);
  const [insSavings, setInsSavings] = useState<InsSavings[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);

  // Skin is React state (component trees differ) AND a data attribute (CSS scoping).
  useEffect(() => { applySkin(skin); }, [skin]);
  // Restore the persisted palette even when ThemeSwitch isn't mounted (claude skin).
  useEffect(() => { applyTheme(loadTheme()); }, []);

  useEffect(() => {
    fetch(`${API_BASE}/presets`)
      .then((r) => r.json() as Promise<{ presets?: Preset[]; geo?: { city?: string | null } }>)
      .then((d) => { setPresets(d.presets ?? []); setGeoCity(d.geo?.city ?? null); })
      .catch(() => { /* welcome falls back to a generic greeting + text box */ });
  }, []);

  function showError(msg: string) {
    setItems((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last && last.role === "assistant" && last.text === "") {
        c[c.length - 1] = { role: "assistant", text: `⚠ ${msg}` };
      } else {
        c.push({ role: "assistant", text: `⚠ ${msg}` });
      }
      return c;
    });
  }

  async function send(text: string) {
    const claude = skin === "claude";
    setItems((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true); setTools([]);
    try {
      await streamChat(API_BASE, sessionId, text, (e) => {
        if (e.type === "text") setItems((m) => {
          const c = [...m];
          const last = c[c.length - 1];
          // Append to the open assistant message; after an inline toolchip/board
          // interrupted the stream, start a fresh prose block instead.
          if (last && last.role === "assistant") c[c.length - 1] = { role: "assistant", text: last.text + e.delta };
          else c.push({ role: "assistant", text: e.delta });
          return c;
        });
        else if (e.type === "tool") {
          if (e.phase === "start") {
            setTools((t) => [...t, e.tool]);
            if (claude) setItems((m) => [...m, { role: "toolchip", name: e.tool, status: "running" }]);
          } else if (claude) {
            setItems((m) => {
              const c = [...m];
              for (let i = c.length - 1; i >= 0; i--) {
                const it = c[i];
                if (it.role === "toolchip" && it.name === e.tool && it.status === "running") {
                  c[i] = { ...it, status: "done", summary: e.summary };
                  break;
                }
              }
              return c;
            });
          }
        }
        else if (e.type === "board") setItems((m) => [...m, {
          role: "board", boardId: e.boardId, kind: e.kind, tripId: e.tripId, candidates: e.candidates,
        }]);
        else if (e.type === "folio") {
          setFolio(e.folio);
          // Fallback resolution: the agent promoted (e.g. after a typed reply),
          // so close out any still-open boards of the now-promoted kind.
          setItems((m) => m.map((it) => (
            it.role === "board" && !it.resolved && !it.resolvedId &&
            ((it.kind === "flight" && e.folio.flights.length > 0) || (it.kind === "hotel" && e.folio.hotels.length > 0))
              ? { ...it, resolved: true } : it
          )));
        }
        else if (e.type === "error") showError(e.message);
        else if (e.type === "inspector") {
          if (e.kind === "tool") setInsTools((t) => [...t, e]);
          else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
          else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
          else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
          else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
        }
      }, claude ? "boards" : undefined);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onPick(board: BoardItem, c: BoardCandidate) {
    setItems((m) => m.map((it) => (
      it.role === "board" && it.boardId === board.boardId ? { ...it, resolvedId: c.id, resolved: true } : it
    )));
    void send(`I'll take the ${board.kind} option ${c.id} (${c.summary}).`);
  }

  const eng = engState(insTools.length, collapsed);
  const chatMessages = items.filter(isChatMessage) as ChatMessage[];

  return (
    <div className="app">
      {skin === "board" && (
        <header>
          <span className="brand"><strong>Voygent</strong> <span className="sub">AI travel-planning agent</span></span>
          <span className="by">built by Neil Roberts</span>
          <ThemeSwitch />
        </header>
      )}
      <div className="stage" data-eng={eng}>
        <section className="product">
          {skin === "claude" ? (
            <ClaudeChatView
              items={items} folio={folio} onSend={send} onPick={onPick}
              busy={busy} presets={presets} geoCity={geoCity}
            />
          ) : (
            <>
              <ChatView messages={chatMessages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
              <FolioPanel folio={folio} />
            </>
          )}
        </section>
        <section className="engineering" data-eng={eng}>
          <Inspector
            state={eng}
            // Manual collapse only applies once live; toggling during the pre-trip idle rail is a
            // no-op so a stray click can't latch `collapsed` and suppress the first-tool reveal.
            onToggleCollapse={() => { if (insTools.length > 0) setCollapsed((c) => !c); }}
            tools={insTools} turns={insTurns} summaries={insSummaries}
            savings={insSavings} overhead={insOverhead}
            headExtra={skin === "claude" ? <ThemeSwitch /> : undefined}
          />
        </section>
      </div>
      <footer className="meta">This interface was itself built by a coding agent.</footer>
      <SkinSwitch skin={skin} onPick={setSkin} />
    </div>
  );
}
