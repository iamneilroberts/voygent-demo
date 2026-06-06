import { useEffect, useRef, useState } from "react";
import { Prose } from "./prose";
import type { Preset } from "./ChatView";
import type { FolioData, BoardCandidate } from "../../shared/events";
import type { TimelineItem, BoardItem } from "./timeline";
import { ClaudeToolChip } from "./ClaudeToolChip";
import { BoardView } from "./BoardView";

// claude.ai-lookalike left pane. Deliberately close to claude.ai's layout
// (centered column, user bubbles right, assistant prose on the page, inline
// tool-use pills, rounded composer) but honestly disambiguated: the Voygent
// wordmark sits where the Claude logo would, and a persistent ribbon labels
// the whole pane a simulation. All classes are cl-* (scoped in skin-claude.css)
// so nothing leaks into the amber board skin.

function FolioArtifact({ folio }: { folio: FolioData }) {
  // A title-only card (trip created, nothing promoted yet) is just noise inline.
  if (folio.flights.length === 0 && folio.hotels.length === 0) return null;
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
              <span className="cl-artifact-price">{h.price ?? ""}{h.perNight ? <span className="cl-artifact-sub">{h.perNight}/night</span> : null}</span>
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
      <h1 className="cl-welcome-h"><span className="cl-spark" aria-hidden="true">✳</span> Where to next{geoCity ? `, ${geoCity}` : ""}?</h1>
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
  { items, folio, onSend, onPick, busy, presets, geoCity }:
  {
    items: TimelineItem[];
    folio: FolioData | null;
    onSend: (m: string) => void;
    onPick: (board: BoardItem, c: BoardCandidate) => void;
    busy: boolean;
    presets: Preset[];
    geoCity: string | null;
  },
) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const firstRun = items.length === 0;

  // Keep the newest content in view as the stream grows (claude.ai behavior).
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [items, folio, busy]);

  const lastIdx = items.length - 1;
  return (
    <main className="cl-pane">
      <header className="cl-header">
        <span className="cl-wordmark"><span className="cl-spark" aria-hidden="true">✳</span> Voygent</span>
        <span className="cl-header-note">travel-planning agent</span>
      </header>
      <div className="cl-ribbon" role="note">Simulated claude.ai environment — this is a Voygent demo, not Anthropic's Claude</div>
      <div className="cl-scroll">
        <div className="cl-col">
          {firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} />}
          {items.map((it, i) => {
            if (it.role === "toolchip") return <ClaudeToolChip key={i} item={it} />;
            if (it.role === "board") return <BoardView key={it.boardId} board={it} busy={busy} onPick={onPick} />;
            if (it.role === "user") return <div key={i} className="cl-msg-user">{it.text}</div>;
            if (it.text) return <div key={i} className="cl-prose"><Prose text={it.text} /></div>;
            return busy && i === lastIdx ? <div key={i} className="cl-thinking" aria-label="Thinking"><span /></div> : null;
          })}
          {folio && <FolioArtifact folio={folio} />}
          <div ref={endRef} />
        </div>
      </div>
      <div className="cl-composer-wrap">
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
