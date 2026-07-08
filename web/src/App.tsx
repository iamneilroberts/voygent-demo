import { useEffect, useRef, useState } from "react";
import { streamChat, UnauthorizedError } from "./sse-client";
import { Gate } from "./Gate";
import { OnboardingForm } from "./OnboardingForm";
import { ProAccessForm } from "./ProAccessForm";
import { readCodeFromHash, authenticate, sessionInfo } from "./lib/gate";
import { effectiveMode, gateOnGoLive, showPublicDisclaimer, type Tier } from "./lib/access";
import { ChatView, type ChatMessage, type Preset } from "./ChatView";
import { ClaudeChatView } from "./ClaudeChatView";
import { FolioPanel } from "./FolioPanel";
import type { ServerEvent, FolioData, BoardCandidate, StatsResponse } from "../../shared/events";
import { toolChipTitle } from "../../shared/tool-chip-title";
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead, type InsValidation, type InsFanout } from "./Inspector";
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
import { replayChat } from "./lib/recording";
import { emptyReelViewState, applyInteraction, reconcileEdits, type ReelViewState } from "./lib/interaction";
import { isPickTool, resolveBoardPickId } from "./lib/board-match";
import { selectReel, CHAPTERS, REELS } from "./recordings/registry";
import { ReelIntro } from "./ReelIntro";
import { ReelCallout } from "./ReelCallout";
import { ReelHandoffNotice } from "./ReelHandoffNotice";
import { ReelClientView } from "./ReelClientView";
import { ReelEngPanel } from "./ReelEngPanel";
import { ReelEndCard } from "./ReelEndCard";
import { ReelExplore } from "./ReelExplore";
import type { Highlight } from "./lib/highlights";
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
  const recordParam = (() => { try { return new URLSearchParams(window.location.search).get("record") === "1"; } catch { return false; } })();
  // Recording is claude-skin only (the Recording type is locked to skin:"claude"), so
  // ?record=1 is a no-op unless the claude skin is active — capture as ?skin=claude&record=1.
  const recorder = useRef(recordParam && resolveInitialSkin() === "claude" ? createRecorder("dublin-oct") : null).current;
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [pendingCode, setPendingCode] = useState("");
  const [expanded, setExpanded] = useState(false); // Inspector: false = live skinny rail, true = full panel
  // The reel is public: unauthed visitors are NOT blocked. Auth is required only
  // to cross into the live demo — that crossing flips showOnboard on (Phase A
  // renders the existing Gate; Phase B swaps in the self-serve OnboardingForm).
  const [showOnboard, setShowOnboard] = useState(false);
  const [forceGate, setForceGate] = useState(false); // "already have a code?" → passcode entry
  const [showProForm, setShowProForm] = useState(false); // "request pro access" → credentialed-access request form
  const [tier, setTier] = useState<Tier | null>(null);
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
  const [insFanouts, setInsFanouts] = useState<InsFanout[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);
  const [insStores, setInsStores] = useState<InsStore[]>([]);
  const [insValidations, setInsValidations] = useState<InsValidation[]>([]);
  const [insPhases, setInsPhases] = useState<{ phase: string; via: string }[]>([]);
  // Cumulative cross-session stats (public aggregates) for the "Across all
  // sessions" panel section. Fetched once on mount, like /presets.
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [mode, setMode] = useState<ModeId>(resolveInitialMode);
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
  // Lazy-init: compute once per mount (useRef(selectReel()) would re-evaluate on every render).
  const selectedReelRef = useRef<ReturnType<typeof selectReel> | null>(null);
  if (!selectedReelRef.current) selectedReelRef.current = selectReel();
  const selectedReel = selectedReelRef.current;
  type ReelPhase = "intro" | "playing" | "ended";
  const [reelPhase, setReelPhase] = useState<ReelPhase>(() => (resolveInitialMode() === "auto" ? "intro" : "ended"));
  const [speed, setSpeed] = useState<number>(2);          // default 2x
  const speedRef = useRef(speed); useEffect(() => { speedRef.current = speed; }, [speed]);
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  // Playback transport: pause/resume gate (a ref so the replay closure reads the live
  // value) + waiters resolved on resume; progress = (framesDone, framesTotal).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resumeWaiters = useRef<Array<() => void>>([]);
  const [reelProg, setReelProg] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  // Scrubber: dragging seeks to a frame. seekFrameRef carries the target into the replay
  // effect; replayNonce re-triggers it; scrubbing/scrubVal track an in-progress drag.
  const seekFrameRef = useRef(0);
  const [replayNonce, setReplayNonce] = useState(0);
  const scrubbingRef = useRef(false);
  const scrubValRef = useRef(0);
  const [scrubPct, setScrubPct] = useState<number | null>(null);
  // Frame-number readout (off by default; persisted) — lets us refer to an exact spot.
  const [showFrameNum, setShowFrameNum] = useState<boolean>(() => { try { return localStorage.getItem("voygent-reel-frameno") === "1"; } catch { return false; } });
  function toggleFrameNum() { setShowFrameNum((s) => { const n = !s; try { localStorage.setItem("voygent-reel-frameno", n ? "1" : "0"); } catch { /* ignore */ } return n; }); }
  function flushResume() { const ws = resumeWaiters.current; resumeWaiters.current = []; ws.forEach((r) => r()); }
  function pauseGate(): Promise<void> { return pausedRef.current ? new Promise<void>((res) => resumeWaiters.current.push(res)) : Promise.resolve(); }
  function togglePause() { setPaused((p) => { const next = !p; pausedRef.current = next; if (!next) flushResume(); return next; }); }
  // Reset + fast-forward to `target` (instant rebuild), then play on. resetReelState
  // clears the accumulated timeline so the rebuild starts clean; the effect (keyed on
  // replayNonce) reads seekFrameRef and passes it as replayChat's seekTo.
  function seekToFrame(target: number) {
    replayAbort.current?.abort();
    resetReelState();
    seekFrameRef.current = target;
    setReplayNonce((n) => n + 1);
  }
  function commitSeek(pctVal: number) {
    setScrubPct(null);
    const total = reelProg.total;
    if (!total) return;
    const target = Math.min(total, Math.max(0, Math.round((pctVal / 100) * total)));
    seekToFrame(target);
  }
  // Reel interaction view-state; consumed by ClaudeChatView render.
  const [reelView, setReelView] = useState<ReelViewState>(emptyReelViewState);
  // Honesty tag: whether this live session's flight/hotel results are real ("live") or
  // curated sample fixtures ("sample"). Set from the worker's `source` event.
  const [dataSource, setDataSource] = useState<"live" | "sample" | null>(null);
  const hlResolve = useRef<(() => void) | null>(null);
  // Accumulated args+result text of pick-signaling tools (patch_trip / promote_*),
  // used to resolve which board candidate the agent chose. A ref, not state, so the
  // folio handler reads the latest value regardless of the stream/replay closure.
  const stagedBlob = useRef("");
  const postReel = (() => { try { return new URLSearchParams(window.location.search).get("greet") === "reel"; } catch { return false; } })();
  // Faithful (fully-live) mode is opt-in via ?faithful=1; default OFF gives the
  // orchestrated experience (replayed featured trips + boards + stepping). Sent on
  // every /chat so the worker latches the right mode on turn 1.
  const faithful = (() => { try { const v = new URLSearchParams(window.location.search).get("faithful"); return v === "1" || v === "true"; } catch { return false; } })();
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
    if (mode !== "auto" || reelPhase !== "playing") return;
    if (skin !== "claude") setSkin("claude");
    const ac = new AbortController();
    replayAbort.current?.abort();
    replayAbort.current = ac;
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    const seekTo = seekFrameRef.current; seekFrameRef.current = 0;   // consume the seek target (0 = normal start)
    void replayChat(selectedReel.recording, {
      applyEvent: (e) => applyEvent(e, true),
      pushUser,
      setBusy,
      onHighlight: onReelHighlight,
      applyInteraction: (i, actor) => setReelView((s) => applyInteraction(s, i, actor)),
    }, {
      reducedMotion: reduced,
      signal: ac.signal,
      speed: () => speedRef.current,
      highlights: selectedReel.highlights,
      pauseGate,
      onProgress: (done, total) => setReelProg({ done, total }),
      seekTo,
    }).then(() => { if (!ac.signal.aborted) setReelPhase("ended"); });
    return () => {
      ac.abort();
      // Settle any paused callout so the replayChat loop's Promise.race resolves and
      // no stale spotlight survives a restart/mode-switch (Codex review).
      hlResolve.current?.(); hlResolve.current = null; setActiveHighlight(null);
      // Release a paused gate so the aborted loop's Promise.race can resolve.
      flushResume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reelPhase, replayNonce]);

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
    const code = readCodeFromHash(window.location, window.history);
    (async () => {
      let sess = false;
      if (code) {
        const r = await authenticate(API_BASE, code);
        if (r.ok) { sess = true; setTier(r.tier); }
        else { setPendingCode(code); }
      }
      if (!sess) {
        const me = await sessionInfo(API_BASE);
        sess = me.ok; setTier(me.tier);
      }
      setAuthed(sess);
      // Unauthed visitors always land on the reel, even if localStorage persisted "live".
      setMode((m) => effectiveMode(m, sess));
    })();
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
        if (claude) setItems((m) => [...m, { role: "toolchip", name: e.tool, status: "running", title: e.title ?? toolChipTitle(e.tool) }]);
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
      // Folio ownership: canonical folio is owned here; an edit overlay clears once its folio event lands.
      setReelView((s) => reconcileEdits(s));
      // Fallback resolution: the agent promoted (e.g. after a typed reply),
      // so close out any still-open boards of the now-promoted kind.
      setItems((m) => m.map((it) => {
        if (it.role !== "board" || it.resolved || it.resolvedId) return it;
        const promoted = (it.kind === "flight" && e.folio.flights.length > 0)
          || (it.kind === "hotel" && e.folio.hotels.length > 0);
        if (!promoted) return it;
        // Mark WHICH candidate was chosen (the staged/promoted id), not just lock
        // the board. resolvedId stays undefined for reels with no pick tools
        // (e.g. collab, where the interaction pick already owns the selection).
        const pickId = resolveBoardPickId(it.candidates.map((c) => c.id), stagedBlob.current);
        return { ...it, resolved: true, resolvedId: pickId ?? it.resolvedId };
      }));
    }
    else if (e.type === "error") showError(e.message);
    else if (e.type === "source") setDataSource(e.live ? "live" : "sample");
    else if (e.type === "inspector") {
      if (e.kind === "tool") {
        setInsTools((t) => [...t, e]);
        // Record which candidate id the agent staged/promoted (not search results).
        if (isPickTool(e.name)) stagedBlob.current += ` ${JSON.stringify(e.args)} ${e.result}`;
      }
      else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
      else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
      else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
      else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
      else if (e.kind === "store") setInsStores((s) => [...s, e]);
      else if (e.kind === "validation") setInsValidations((v) => [...v, e]);
      else if (e.kind === "phase") setInsPhases((p) => [...p, { phase: e.phase, via: e.via }]);
      else if (e.kind === "fanout") setInsFanouts((f) => [...f, e]);
    }
  }

  function pushUser(text: string) {
    setItems((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setTools([]);
  }

  function resetReelState() {
    setItems([]); setTools([]); setFolio(null); setBusy(false);
    setInsTools([]); setInsTurns([]); setInsSummaries([]); setInsSavings([]);
    setInsOverhead([]); setInsStores([]); setInsValidations([]); setInsPhases([]); setInsFanouts([]);
    stagedBlob.current = "";   // forget prior picks so a Replay re-resolves cleanly
    setPaused(false); pausedRef.current = false; flushResume(); setReelProg({ done: 0, total: 0 });
    // Clear any in-flight callout so a Replay never starts under a stale spotlight (Codex review).
    hlResolve.current?.(); hlResolve.current = null; setActiveHighlight(null);
    setReelView(emptyReelViewState());   // P2: clear picks/edits/threads/handoff
    setDataSource(null);                 // honesty tag re-derives on the next live search
  }

  function onReelHighlight(h: Highlight): Promise<void> {
    setActiveHighlight(h);
    return new Promise<void>((resolve) => {
      hlResolve.current = () => { hlResolve.current = null; setActiveHighlight(null); resolve(); };
    });
  }

  function startReel() { resetReelState(); setReelPhase("playing"); }
  function planYourOwn() { goLive(false); }
  function tryYourself() { goLive(true); }

  // Clean reload with mutated URL params — re-latches the session / restarts the
  // reel player from a fresh state. Shared by gotoReel, enterLive, toggleDemo.
  function reloadWith(mutate: (u: URL) => void) {
    try {
      const u = new URL(window.location.href);
      mutate(u);
      window.location.href = u.toString();
    } catch { /* no-op */ }
  }

  // Chapter navigation — mode=auto is pinned (the URL param beats persisted mode).
  function gotoReel(id: string) {
    persistMode("auto");
    reloadWith((u) => { u.searchParams.set("reel", id); u.searchParams.set("mode", "auto"); u.searchParams.delete("greet"); });
  }
  const nextReel = selectedReel.next ? REELS.find((r) => r.id === selectedReel.next) : undefined;
  const nextChapter = nextReel ? { label: `Watch ${nextReel.title} →`, onClick: () => gotoReel(nextReel.id) } : undefined;

  // The actual live transition — a clean reload that re-latches the session.
  // No session check here: callers either already gated (goLive) or just
  // authenticated in the same tick (onboarding), where `authed` state is still
  // stale-false so re-checking it would wrongly re-gate.
  function enterLive(greet: boolean) {
    persistMode("live");
    reloadWith((u) => {
      u.searchParams.set("mode", "live"); u.searchParams.set("skin", "claude");
      if (greet) u.searchParams.set("greet", "reel"); else u.searchParams.delete("greet");
    });
  }

  // Reel CTA → live. Crossing into live requires a session — show onboarding when absent.
  function goLive(greet: boolean) {
    if (gateOnGoLive(authed === true)) { setShowOnboard(true); return; }
    enterLive(greet);
  }

  async function send(text: string) {
    const claude = skin === "claude";
    pushUser(text);
    recorder?.recordUser(text);
    setBusy(true);
    try {
      await streamChat(API_BASE, text, (e) => { recorder?.recordEvent(e); applyEvent(e, claude); }, claude ? "boards" : undefined, { ...routingBody(modelMode, smartMap), faithful });
    } catch (err) {
      if (err instanceof UnauthorizedError) { setAuthed(false); setShowOnboard(true); return; }
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

  const eng = engState(insTools.length, expanded);
  const chatMessages = items.filter(isChatMessage) as ChatMessage[];
  const reelPct = reelProg.total ? Math.round((reelProg.done / reelProg.total) * 100) : 0;
  const reelSeekPct = scrubPct ?? reelPct;   // show the dragged position while scrubbing

  function toggleDemo() {
    const next: ModeId = mode === "auto" ? "live" : "auto";
    persistMode(next);
    reloadWith((u) => {
      u.searchParams.set("mode", next);
      if (next === "auto") u.searchParams.set("skin", "claude");
    });
  }
  const demoLabel = mode === "auto" ? "● build your own" : "▶ watch the demo";

  // Reel is public — only block while we're still checking the session.
  if (authed === null) return <div style={{ margin: "12vh auto", textAlign: "center", color: "#888" }}>Loading…</div>;
  // The gate appears only when the visitor crosses into the live demo without a
  // session. Default to the self-serve onboarding form; "already have a code?"
  // (forceGate) switches to the passcode entry.
  // Pro-access request form — a full takeover reachable from the public-source
  // banner (live UI) or from the onboarding form. Guard ahead of the normal render.
  if (showProForm) return <ProAccessForm apiBase={API_BASE} onDone={() => setShowProForm(false)} />;

  if (!authed && showOnboard) {
    if (forceGate) return <Gate initialCode={pendingCode} onSubmit={async (c) => {
      const r = await authenticate(API_BASE, c);
      if (r.ok) { setAuthed(true); setTier(r.tier); setShowOnboard(false); setForceGate(false); }
      return r.ok;
    }} />;
    return <OnboardingForm
      apiBase={API_BASE}
      onAuthed={(t) => { setAuthed(true); setTier(t); setShowOnboard(false); enterLive(true); }}
      onHaveCode={() => setForceGate(true)}
      onWantPro={() => setShowProForm(true)}
    />;
  }

  return (
    <div className="app">
      {showPublicDisclaimer(tier, mode) && (
        <div className="public-source-banner" role="note"
          style={{ padding: ".5rem 1rem", background: "#fff7e6", borderBottom: "1px solid #f0d9a8", fontSize: ".85rem", textAlign: "center" }}>
          Results are from public sources.{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); setShowProForm(true); }}>Request pro access →</a>
        </div>
      )}
      {skin === "board" && (
        <header>
          <span className="brand"><strong>Voygent</strong> <span className="sub">AI travel-planning assistant</span></span>
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
              busy={busy} presets={presets} geoCity={geoCity} advisor={mode === "auto" ? true : advisor}
              mobileView={mobileView} onMobileView={setMobileView}
              onToggleDemo={toggleDemo} demoLabel={demoLabel}
              engHasContent={insTools.length > 0}
              postReel={postReel}
              reelView={reelView}
              reelMode={mode === "auto"}
              dataSource={dataSource}
              onRequestAccess={mode === "auto" ? undefined : () => setShowProForm(true)}
            />
          ) : (
            <>
              <ChatView messages={chatMessages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
              <FolioPanel folio={folio} advisor={advisor} onRequestAccess={mode === "auto" ? undefined : () => setShowProForm(true)} />
            </>
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "intro" && (
            <ReelIntro
              title={selectedReel.title} blurb={selectedReel.blurb} durationLabel={selectedReel.durationLabel}
              eyebrow={selectedReel.intro?.eyebrow} note={selectedReel.intro?.note}
              onWatch={startReel} onPlanYourOwn={planYourOwn}
              chapters={CHAPTERS.map((c) => ({ id: c.id, title: c.title, durationLabel: c.durationLabel, current: c.id === selectedReel.id }))}
              onChapter={gotoReel}
            />
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "playing" && activeHighlight && (
            <ReelCallout
              key={activeHighlight.title}
              highlight={activeHighlight}
              dwellMs={activeHighlight.dwellMs ?? 4000}
              paused={paused}
              onContinue={() => hlResolve.current?.()}
            />
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "playing" && reelView.handoff?.sent && (
            <ReelHandoffNotice key={reelView.handoff.subject ?? "handoff"} handoff={reelView.handoff} />
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "playing" && reelView.clientView?.open && (
            <ReelClientView view={reelView.clientView} />
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "playing" && reelView.engPanel?.open && (
            <ReelEngPanel view={reelView.engPanel} />
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "playing" && (
            <div className="cl-reel-controls" role="group" aria-label="Playback controls">
              <button type="button" className="cl-reel-ctl" aria-pressed={paused} aria-label={paused ? "Play" : "Pause"} onClick={togglePause}>{paused ? "▶" : "❚❚"}</button>
              <button type="button" className="cl-reel-ctl" aria-label="Restart" onClick={startReel}>↺</button>
              <div className="cl-reel-track">
                <i style={{ width: `${reelSeekPct}%` }} />
                <input
                  type="range" className="cl-reel-seek" min={0} max={100} step={1}
                  value={reelSeekPct} aria-label="Seek through the reel"
                  onPointerDown={() => { scrubbingRef.current = true; }}
                  onChange={(e) => { const v = Number(e.currentTarget.value); scrubValRef.current = v; setScrubPct(v); if (!scrubbingRef.current) commitSeek(v); }}
                  onPointerUp={() => { if (scrubbingRef.current) { scrubbingRef.current = false; commitSeek(scrubValRef.current); } }}
                />
              </div>
              <div className="cl-reel-speed">
                <button type="button" aria-pressed={speed === 1} onClick={() => setSpeed(1)}>1×</button>
                <button type="button" aria-pressed={speed === 2} onClick={() => setSpeed(2)}>2×</button>
              </div>
              <button type="button" className="cl-reel-ctl" aria-pressed={showFrameNum} aria-label="Toggle frame number" title="Frame number" onClick={toggleFrameNum}>#</button>
              {showFrameNum && <span className="cl-reel-frameno" aria-live="off">{reelProg.done}/{reelProg.total}</span>}
            </div>
          )}
          {skin === "claude" && mode === "auto" && reelPhase === "ended" && (
            reelView.clientView
              // Reels with a priced client-view (collab) end on an interactive folio the
              // viewer can experiment with; others keep the static end card.
              ? <ReelExplore view={reelView.clientView} onLiveDemo={tryYourself} onReplay={startReel} nextChapter={nextChapter} />
              : <ReelEndCard
                  onTryYourself={tryYourself} onReplay={startReel}
                  recap={selectedReel.recap}
                  eyebrow={selectedReel.endCard?.eyebrow}
                  title={selectedReel.endCard?.title}
                  blurb={selectedReel.endCard?.blurb}
                  nextChapter={nextChapter}
                />
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
            onToggleCollapse={() => setExpanded((x) => !x)}
            tools={insTools} turns={insTurns} summaries={insSummaries}
            savings={insSavings} overhead={insOverhead} stats={stats}
            stores={insStores} validations={insValidations} phases={insPhases} fanouts={insFanouts} busy={busy}
            headExtra={skin === "claude" ? <><ModelSwitch mode={modelMode} enabled={enabledModels} onPick={setModelMode} onTweaks={() => setTweaksOpen(true)} /><AdvisorSwitch on={advisor} onToggle={setAdvisor} /><ThemeSwitch /></> : undefined}
            routing={{ mode: modelMode, enabledModels, smartMap, activePhase, onMode: setModelMode, onSmartMap: setSmartMap }}
          />
        </section>
      </div>
      <footer className="meta">Built with coding-agent workflows; architecture, constraints, and review by Neil Roberts.</footer>
      {mode !== "auto" && <SkinSwitch skin={skin} onPick={setSkin} />}
      <TweaksPanel
        open={tweaksOpen} onClose={() => setTweaksOpen(false)}
        enabled={enabledModels} mode={modelMode} onMode={setModelMode} onRouting={applyRouting}
      />
    </div>
  );
}
