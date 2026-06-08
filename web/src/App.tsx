import { useEffect, useRef, useState } from "react";
import { streamChat } from "./sse-client";
import { ChatView, type ChatMessage, type Preset } from "./ChatView";
import { ClaudeChatView } from "./ClaudeChatView";
import { FolioPanel } from "./FolioPanel";
import type { ServerEvent, FolioData, BoardCandidate, StatsResponse } from "../../shared/events";
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead } from "./Inspector";
import { type InsStore } from "./StoreOpsWidget";
import { ThemeSwitch } from "./ThemeSwitch";
import { SkinSwitch } from "./SkinSwitch";
import { AdvisorSwitch } from "./AdvisorSwitch";
import { resolveInitialAdvisor, persistAdvisor } from "./lib/advisor";
import { ModelSwitch } from "./ModelSwitch";
import { TweaksPanel } from "./TweaksPanel";
import { resolveInitialSelector, persistSelector, routingBody, type SelectorMode } from "./lib/model";
import { type MobileView, DEFAULT_MOBILE_VIEW } from "./lib/mobile-view";
import { DEFAULT_SMART_MAP, type ModelId, type PhaseModelMap, type Phase, type ModelRouting } from "../../shared/models";
import { engState } from "./lib/inspector-state";
import { applyTheme, loadTheme } from "./lib/theme";
import { resolveInitialSkin, applySkin, type SkinId } from "./lib/skin";
import { createRecorder } from "./lib/recorder";
import { resolveInitialMode, persistMode, type ModeId } from "./lib/mode";
import { replayChat, type Recording } from "./lib/recording";
import dublinRecording from "./recordings/dublin-oct.json";
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
  const recordParam = (() => { try { return new URLSearchParams(window.location.search).get("record") === "1"; } catch { return false; } })();
  // Recording is claude-skin only (the Recording type is locked to skin:"claude"), so
  // ?record=1 is a no-op unless the claude skin is active — capture as ?skin=claude&record=1.
  const recorder = useRef(recordParam && resolveInitialSkin() === "claude" ? createRecorder("dublin-oct") : null).current;
  const [collapsed, setCollapsed] = useState(false);
  const [skin, setSkin] = useState<SkinId>(() => {
    if (resolveInitialMode() === "auto") {
      // Auto mode always plays in the claude skin. Set data-skin synchronously
      // here (before the useEffect fires) so there is no board→claude flash on
      // first paint. resolveInitialSkin() has no DOM side effects, so it is safe
      // to bypass it in this branch.
      applySkin("claude");
      return "claude";
    }
    return resolveInitialSkin();
  });
  const [insTools, setInsTools] = useState<InsTool[]>([]);
  const [insTurns, setInsTurns] = useState<InsTurn[]>([]);
  const [insSummaries, setInsSummaries] = useState<InsSummary[]>([]);
  const [insSavings, setInsSavings] = useState<InsSavings[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);
  const [insStores, setInsStores] = useState<InsStore[]>([]);
  // Cumulative cross-session stats (public aggregates) for the "Across all
  // sessions" panel section. Fetched once on mount, like /presets.
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [mode] = useState<ModeId>(resolveInitialMode);
  // Advisor view: commission per item + trip total (real supplier data only).
  const [advisor, setAdvisor] = useState<boolean>(resolveInitialAdvisor);
  useEffect(() => { persistAdvisor(advisor); }, [advisor]);
  // Model selector: mode (single id | "smart"), the editable smart map, and the
  // enabled model set (from /presets — gates Opus). activePhase highlights the map.
  const [modelMode, setModelMode] = useState<SelectorMode>(resolveInitialSelector);
  useEffect(() => { persistSelector(modelMode); }, [modelMode]);
  const [smartMap, setSmartMap] = useState<PhaseModelMap>({ ...DEFAULT_SMART_MAP });
  const [enabledModels, setEnabledModels] = useState<ModelId[]>(["claude-haiku-4-5", "claude-sonnet-4-6"]);
  // Tweaks panel (fuller provider/preset picker) open state + the routing applier
  // that maps a chosen ModelRouting back onto modelMode + smartMap.
  const [tweaksOpen, setTweaksOpen] = useState(false);
  function applyRouting(r: ModelRouting) {
    setSmartMap(r.map);
    setModelMode(r.mode === "single" ? (r.model as SelectorMode) : "smart");
  }
  const activePhase: Phase = folio && folio.hotels.length > 0 ? "enrichment" : "discovery";
  // Mobile-only: which surface is showing (chat base + folio/engineering overlays).
  const [mobileView, setMobileView] = useState<MobileView>(DEFAULT_MOBILE_VIEW);
  const replayAbort = useRef<AbortController | null>(null);
  useEffect(() => { persistMode(mode); }, [mode]);

  // Skin is React state (component trees differ) AND a data attribute (CSS scoping).
  useEffect(() => { applySkin(skin); }, [skin]);
  // Restore the persisted palette even when ThemeSwitch isn't mounted (claude skin).
  useEffect(() => { applyTheme(loadTheme()); }, []);

  useEffect(() => {
    if (!recorder) return;
    (window as any).__exportRecording = () => {
      const data = JSON.stringify(recorder.export(), null, 2);
      // eslint-disable-next-line no-console
      console.log("RECORDING_JSON_START\n" + data + "\nRECORDING_JSON_END");
      try {
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "dublin-oct.json"; a.click();
      } catch { /* console copy is the fallback */ }
      return data;
    };
    return () => { try { delete (window as any).__exportRecording; } catch { /* ignore */ } };
  }, [recorder]);

  useEffect(() => {
    if (mode !== "auto") return;
    if (skin !== "claude") setSkin("claude");      // auto always plays in the claude skin
    const ac = new AbortController();
    replayAbort.current?.abort();
    replayAbort.current = ac;
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    void replayChat(dublinRecording as Recording, {
      applyEvent: (e) => applyEvent(e, true),
      pushUser,
      setBusy,
    }, { reducedMotion: reduced, signal: ac.signal });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    fetch(`${API_BASE}/presets`)
      .then((r) => r.json() as Promise<{ presets?: Preset[]; geo?: { city?: string | null }; enabledModels?: ModelId[]; smartMap?: PhaseModelMap }>)
      .then((d) => {
        setPresets(d.presets ?? []); setGeoCity(d.geo?.city ?? null);
        if (d.enabledModels?.length) setEnabledModels(d.enabledModels);
        if (d.smartMap) setSmartMap(d.smartMap);
      })
      .catch(() => { /* welcome falls back to a generic greeting + text box */ });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/stats`)
      .then((r) => r.json() as Promise<StatsResponse>)
      .then((s) => { if (s && typeof s.exchanges === "number") setStats(s); })
      .catch(() => { /* section just stays hidden when stats are unavailable */ });
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

  // Single per-event reducer over the existing setters. Called by BOTH the live
  // stream callback and the replay player so they produce identical state.
  function applyEvent(e: ServerEvent, claude: boolean) {
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
      else if (e.kind === "store") setInsStores((s) => [...s, e]);
    }
  }

  function pushUser(text: string) {
    setItems((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setTools([]);
  }

  async function send(text: string) {
    const claude = skin === "claude";
    pushUser(text);
    recorder?.recordUser(text);
    setBusy(true);
    try {
      await streamChat(API_BASE, sessionId, text, (e) => { recorder?.recordEvent(e); applyEvent(e, claude); }, claude ? "boards" : undefined, routingBody(modelMode, smartMap));
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setBusy(false);
      recorder?.recordTurnEnd();
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

  function toggleDemo() {
    const next: ModeId = mode === "auto" ? "live" : "auto";
    persistMode(next);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mode", next);
      if (next === "auto") u.searchParams.set("skin", "claude");
      window.location.href = u.toString();   // reload re-latches the session cleanly
    } catch { /* no-op */ }
  }
  const demoLabel = mode === "auto" ? "● build your own" : "▶ watch the demo";

  return (
    <div className="app">
      {skin === "board" && (
        <header>
          <span className="brand"><strong>Voygent</strong> <span className="sub">AI travel-planning agent</span></span>
          <span className="by">built by Neil Roberts</span>
          <ModelSwitch mode={modelMode} enabled={enabledModels} onPick={setModelMode} onTweaks={() => setTweaksOpen(true)} />
          <AdvisorSwitch on={advisor} onToggle={setAdvisor} />
          <ThemeSwitch />
        </header>
      )}
      <div className="stage" data-eng={eng} data-mview={skin === "claude" ? mobileView : "chat"}>
        <section className="product">
          {skin === "claude" ? (
            <ClaudeChatView
              items={items} folio={folio} onSend={send} onPick={onPick}
              busy={busy} presets={presets} geoCity={geoCity} advisor={advisor}
              mobileView={mobileView} onMobileView={setMobileView}
              onToggleDemo={toggleDemo} demoLabel={demoLabel}
              engHasContent={insTools.length > 0}
            />
          ) : (
            <>
              <ChatView messages={chatMessages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
              <FolioPanel folio={folio} advisor={advisor} />
            </>
          )}
        </section>
        <section className="engineering" data-eng={eng}>
          {skin === "claude" && (
            <button type="button" className="mview-close" onClick={() => setMobileView("chat")} aria-label="Back to chat">✕ chat</button>
          )}
          <Inspector
            state={eng}
            // Manual collapse only applies once live; toggling during the pre-trip idle rail is a
            // no-op so a stray click can't latch `collapsed` and suppress the first-tool reveal.
            onToggleCollapse={() => { if (insTools.length > 0) setCollapsed((c) => !c); }}
            tools={insTools} turns={insTurns} summaries={insSummaries}
            savings={insSavings} overhead={insOverhead} stats={stats}
            stores={insStores}
            headExtra={skin === "claude" ? <><ModelSwitch mode={modelMode} enabled={enabledModels} onPick={setModelMode} onTweaks={() => setTweaksOpen(true)} /><AdvisorSwitch on={advisor} onToggle={setAdvisor} /><ThemeSwitch /></> : undefined}
            routing={{ mode: modelMode, enabledModels, smartMap, activePhase, onMode: setModelMode, onSmartMap: setSmartMap }}
          />
        </section>
      </div>
      <footer className="meta">This interface was itself built by a coding agent.</footer>
      <SkinSwitch skin={skin} onPick={setSkin} />
      <button type="button" className="watch-demo" onClick={toggleDemo}>{demoLabel}</button>
      <TweaksPanel
        open={tweaksOpen} onClose={() => setTweaksOpen(false)}
        enabled={enabledModels} mode={modelMode} onMode={setModelMode} onRouting={applyRouting}
      />
    </div>
  );
}
