import { useEffect, useRef, useState } from "react";
import { Prose } from "./prose";
import type { Preset } from "./ChatView";
import type { FolioData, BoardCandidate } from "../../shared/events";
import type { TimelineItem, BoardItem } from "./timeline";
import { ClaudeToolChip } from "./ClaudeToolChip";
import { BoardView } from "./BoardView";
import { commissionLabel, commissionTotal, fmtUsd } from "./lib/advisor";
import { safeHttpUrl } from "./lib/url";
import { type MobileView, toggleMobileView } from "./lib/mobile-view";

// claude.ai-lookalike left pane. Deliberately close to claude.ai's layout
// (centered column, user bubbles right, assistant prose on the page, inline
// tool-use pills, rounded composer) but honestly disambiguated: the Voygent
// wordmark sits where the Claude logo would, and a persistent ribbon labels
// the whole pane a simulation. All classes are cl-* (scoped in skin-claude.css)
// so nothing leaks into the amber board skin.

function FolioArtifact({ folio, advisor }: { folio: FolioData; advisor: boolean }) {
  const commTotal = advisor ? commissionTotal(folio.hotels) : null;
  // A title-only card (trip created, nothing promoted yet) is just noise inline.
  const hasDays = !!folio.days && folio.days.length > 0;
  const hasIncludes = !!folio.includes && folio.includes.length > 0;
  if (folio.flights.length === 0 && folio.hotels.length === 0 && !hasDays && !hasIncludes) return null;
  return (
    <div className="cl-artifact" role="group" aria-label="Trip folio">
      <div className="cl-artifact-head">
        <span className="cl-artifact-kicker">Trip folio</span>
        <span className="cl-artifact-title">{folio.title}</span>
      </div>
      {folio.flights.length > 0 && (
        <div className="cl-artifact-sec">
          <h4>Flights</h4>
          {folio.flights.map((f, i) => (
            <div key={i} className="cl-artifact-row">
              <span className="cl-artifact-main">
                <span className="cl-artifact-name">{f.route ?? f.label}</span>
                <span className="cl-artifact-meta">{[f.carrier, f.date, f.cabin].filter(Boolean).join(" · ")}</span>
              </span>
              {f.price && <span className="cl-artifact-price">{f.price}</span>}
            </div>
          ))}
        </div>
      )}
      {folio.hotels.length > 0 && (
        <div className="cl-artifact-sec">
          <h4>Hotels</h4>
          {folio.hotels.map((h, i) => (
            <div key={i} className="cl-artifact-row">
              <span className="cl-artifact-main">
                <span className="cl-artifact-name">{h.name}</span>
                <span className="cl-artifact-meta">
                  {[h.area, typeof h.stars === "number" ? `${h.stars}★` : null, typeof h.nights === "number" ? `${h.nights} nights` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="cl-artifact-price">
                {h.price ?? ""}{h.perNight ? <span className="cl-artifact-sub">{h.perNight}/night</span> : null}
                {advisor && typeof h.commission === "number" && (
                  <span className="cl-artifact-comm">{commissionLabel(h.commission, h.commissionPct)}</span>
                )}
              </span>
            </div>
          ))}
          {commTotal != null && (
            <div className="cl-artifact-row cl-artifact-totalrow">
              <span className="cl-artifact-main"><span className="cl-artifact-name">Trip commission</span></span>
              <span className="cl-artifact-comm cl-artifact-total">{fmtUsd(commTotal)}</span>
            </div>
          )}
        </div>
      )}
      {hasDays && (
        <div className="cl-artifact-sec">
          <h4>Day by day</h4>
          {folio.days!.map((d, i) => (
            <div key={i} className="cl-day">
              <div className="cl-day-head">
                <span className="cl-day-title">{d.title}</span>
                {d.date && <span className="cl-day-date">{d.date}</span>}
              </div>
              {d.activities.length > 0 && (
                <ul className="cl-day-list">
                  {d.activities.map((a, j) => {
                    const au = safeHttpUrl(a.url);
                    return (
                      <li key={j}>
                        {au ? <a href={au} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}
                        {a.description && <span className="cl-day-desc"> — {a.description}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {d.dining.length > 0 && (
                <div className="cl-day-dining">
                  <span className="cl-day-dining-label">Local picks:</span>{" "}
                  {d.dining.map((m, j) => {
                    const mu = safeHttpUrl(m.url);
                    return (
                      <span key={j} className="cl-dining-item">
                        {mu ? <a href={mu} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name}
                        {m.cuisine ? ` (${m.cuisine})` : ""}{j < d.dining.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </div>
              )}
              {d.stay && <div className="cl-day-stay">Stay: {d.stay}</div>}
            </div>
          ))}
        </div>
      )}
      {hasIncludes && (
        <div className="cl-artifact-sec">
          <h4>What&#39;s included &amp; good to know</h4>
          {folio.includes!.map((inc) => (
            <div key={inc.key} className="cl-include">
              <span className="cl-include-title">{inc.title}</span>
              <span className="cl-include-body">{inc.body}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Welcome({ presets, geoCity, onSend, busy }: { presets: Preset[]; geoCity: string | null; onSend: (m: string) => void; busy: boolean }) {
  return (
    <div className="cl-welcome">
      <h1 className="cl-welcome-h"><span className="cl-spark" aria-hidden="true">✳</span> Where to next?</h1>
      {geoCity && <p className="cl-welcome-geo">Looks like you might be traveling from {geoCity}.</p>}
      <p className="cl-welcome-sub">Voygent plans real trips with live flights and hotels — pick one to watch it work, or describe your own.</p>
      {presets.length > 0 && (
        <div className="cl-suggestions">
          {presets.map((p) => (
            <button key={p.id} type="button" className="cl-suggestion" disabled={busy} onClick={() => onSend(p.prompt)}>
              <span className="cl-suggestion-label">{p.label}</span>
              <span className="cl-suggestion-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClaudeChatView(
  { items, folio, onSend, onPick, busy, presets, geoCity, advisor, mobileView, onMobileView, onToggleDemo, demoLabel, engHasContent }:
  {
    items: TimelineItem[];
    folio: FolioData | null;
    onSend: (m: string) => void;
    onPick: (board: BoardItem, c: BoardCandidate) => void;
    busy: boolean;
    presets: Preset[];
    geoCity: string | null;
    advisor: boolean;
    mobileView: MobileView;
    onMobileView: (v: MobileView) => void;
    onToggleDemo: () => void;
    demoLabel: string;
    engHasContent: boolean;
  },
) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);   // is the user parked at the bottom of the chat?
  const firstRun = items.length === 0;
  const folioHasContent = !!folio && (folio.flights.length > 0 || folio.hotels.length > 0 || !!folio.days?.length);

  // Auto-scroll ONLY on new chat content AND only when the user is already at the
  // bottom — never on a folio-only update (that yank was the mobile "glitchy
  // scrolling"). Track the pinned-to-bottom state from the scroll position.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => { if (pinnedRef.current) endRef.current?.scrollIntoView({ block: "end" }); }, [items, busy]);

  const lastIdx = items.length - 1;
  return (
    <main className="cl-pane">
      <header className="cl-header">
        <span className="cl-wordmark"><span className="cl-spark" aria-hidden="true">✳</span> Voygent</span>
        <span className="cl-header-note">travel-planning agent</span>
      </header>
      <div className="cl-ribbon" role="note">Simulated claude.ai environment — this is a Voygent demo, not Anthropic's Claude</div>
      <div className="cl-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="cl-col">
          {firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} />}
          {items.map((it, i) => {
            if (it.role === "toolchip") return <ClaudeToolChip key={i} item={it} />;
            if (it.role === "board") return <BoardView key={it.boardId} board={it} busy={busy} advisor={advisor} onPick={onPick} />;
            if (it.role === "user") return <div key={i} className="cl-msg-user">{it.text}</div>;
            if (it.text) return <div key={i} className="cl-prose"><Prose text={it.text} /></div>;
            return busy && i === lastIdx ? <div key={i} className="cl-thinking" aria-label="Thinking"><span /></div> : null;
          })}
          {folio && <div className="cl-folio-inline"><FolioArtifact folio={folio} advisor={advisor} /></div>}
          <div ref={endRef} />
        </div>
      </div>
      {mobileView === "folio" && (
        <div className="cl-sheet" role="dialog" aria-label="Trip folio">
          <div className="cl-sheet-head">
            <span>Trip folio</span>
            <button type="button" className="cl-sheet-close" onClick={() => onMobileView("chat")} aria-label="Back to chat">✕ chat</button>
          </div>
          <div className="cl-sheet-body">
            {folio ? <FolioArtifact folio={folio} advisor={advisor} /> : <p className="cl-day-desc">Your trip folio will build here as Voygent works.</p>}
          </div>
        </div>
      )}
      <div className="cl-composer-wrap">
        <div className="cl-pillbar" role="group" aria-label="Mobile views">
          {folioHasContent && (
            <button type="button" className={`cl-pill ${mobileView === "folio" ? "on" : ""}`} onClick={() => onMobileView(toggleMobileView(mobileView, "folio"))}>📄 Folio</button>
          )}
          {engHasContent && (
            <button type="button" className={`cl-pill ${mobileView === "engineering" ? "on" : ""}`} onClick={() => onMobileView(toggleMobileView(mobileView, "engineering"))}>⚙ Engineering</button>
          )}
          <button type="button" className="cl-pill" onClick={onToggleDemo}>{demoLabel}</button>
        </div>
        <form
          className="cl-composer"
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) { onSend(input); setInput(""); } }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to Voygent…"
            disabled={busy}
            aria-label="Message Voygent"
          />
          <button type="submit" className="cl-send" disabled={busy || !input.trim()} aria-label="Send message">↑</button>
        </form>
        <div className="cl-disclaimer">Voygent demo — a look-alike of the claude.ai chat experience.</div>
      </div>
    </main>
  );
}
