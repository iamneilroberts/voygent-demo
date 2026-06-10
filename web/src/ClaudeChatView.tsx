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
import { editForActivity, actorClass, actorLabel, threadsForDay, actorInitial, sendButtonLabel } from "./lib/reel-render";
import type { ReelViewState, ReelEditMarker, ReelThread } from "./lib/interaction";

// claude.ai-lookalike left pane. Deliberately close to claude.ai's layout
// (centered column, user bubbles right, assistant prose on the page, inline
// tool-use pills, rounded composer) but honestly disambiguated: the Voygent
// wordmark sits where the Claude logo would, and a persistent ribbon labels
// the whole pane a simulation. All classes are cl-* (scoped in skin-claude.css)
// so nothing leaks into the amber board skin.

// A collapsible advisor↔client comment thread pinned under a folio day. Renders as
// a count-badge pin that pulses + auto-expands when a comment lands, then tucks back
// down so the folio stays clean (the reel beat holds the dwell while it's open). A
// manual click takes over and cancels the auto-collapse. Timers are abort-safe
// (cleared on unmount / reel reset, which empties reelView.threads → count 0).
function CommentThread({ thread, dayTitle }: { thread: ReelThread; dayTitle: string }) {
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const manual = useRef(false);
  const count = thread.comments.length;
  useEffect(() => {
    if (count === 0 || manual.current) return;
    setExpanded(true);
    setPulse(true);
    // Cosmetic only (not the reel's pacing dwell). Re-armed on each new comment so the
    // thread stays open across the client→advisor pair, then collapses. Soft-default; P2.4 calibrates.
    const stopPulse = setTimeout(() => setPulse(false), 1200);
    const collapse = setTimeout(() => setExpanded(false), 3500);
    return () => { clearTimeout(stopPulse); clearTimeout(collapse); };
  }, [count]);
  if (count === 0) return null;
  const lead = thread.comments[0].actor;
  return (
    <div className="cl-thread-wrap">
      <button
        type="button"
        className={`cl-thread-pin ${actorClass(lead)}${pulse ? " pulsing" : ""}`}
        aria-expanded={expanded}
        data-reel-target={`comment-${thread.threadId}`}
        onClick={() => { manual.current = true; setExpanded((e) => !e); }}
      >
        <span aria-hidden="true">💬</span>
        <span className="cl-thread-ct">{count}</span>
        <span className="cl-thread-on">on {dayTitle}</span>
        <span className="cl-thread-caret" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="cl-thread" role="group" aria-label={`Comments on ${dayTitle}`}>
          {thread.comments.map((c, i) => (
            <div key={i} className={`cl-cmt ${actorClass(c.actor)}`}>
              <span className="cl-cmt-av" aria-hidden="true">{actorInitial(c.actor)}</span>
              <span className="cl-cmt-body">
                <span className="cl-cmt-name">{actorLabel(c.actor)}</span>
                <span className="cl-cmt-text">{c.text}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FolioArtifact({ folio, advisor, edits, threads, showSend, sent }: { folio: FolioData; advisor: boolean; edits: ReelEditMarker[]; threads: ReelThread[]; showSend?: boolean; sent?: boolean }) {
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
        <div className="cl-artifact-sec" data-reel-target="folio-days">
          <h4>Day by day</h4>
          {folio.days!.map((d, i) => (
            <div key={i} className="cl-day" data-reel-target={`folio-day-${i}`}>
              <div className="cl-day-head">
                <span className="cl-day-title">{d.title}</span>
                {d.date && <span className="cl-day-date">{d.date}</span>}
              </div>
              {d.activities.length > 0 && (
                <ul className="cl-day-list">
                  {d.activities.map((a, j) => {
                    const au = safeHttpUrl(a.url);
                    const edit = editForActivity(edits, i, j);
                    return (
                      <li key={j} className={edit ? `cl-day-edited ${actorClass(edit.actor)}${edit.reconciled ? " reconciled" : ""}` : undefined}>
                        {edit && (
                          <span className="cl-edit-marker">
                            <span className="cl-sr-only">Changed from </span>
                            <span className="cl-edit-was">{edit.was}</span>
                            <span className="cl-edit-arrow" aria-hidden="true"> → </span>
                            <span className="cl-edit-tag">{actorLabel(edit.actor)} edited</span>
                          </span>
                        )}
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
              {threadsForDay(threads, i).map((t) => (
                <CommentThread key={t.threadId} thread={t} dayTitle={d.title} />
              ))}
            </div>
          ))}
        </div>
      )}
      {hasIncludes && (
        <div className="cl-artifact-sec" data-reel-target="folio-includes">
          <h4>What&#39;s included &amp; good to know</h4>
          {folio.includes!.map((inc) => (
            <div key={inc.key} className="cl-include">
              <span className="cl-include-title">{inc.title}</span>
              <span className="cl-include-body">{inc.body}</span>
            </div>
          ))}
        </div>
      )}
      {showSend && (
        <div className="cl-artifact-foot">
          <span className={`cl-folio-send ${sent ? "sent" : ""}`} data-reel-target="folio-send" role="button" aria-disabled="true">
            {sendButtonLabel(!!sent)}
          </span>
        </div>
      )}
    </div>
  );
}

function Welcome({ presets, geoCity, onSend, busy, postReel }: { presets: Preset[]; geoCity: string | null; onSend: (m: string) => void; busy: boolean; postReel?: boolean }) {
  return (
    <div className="cl-welcome">
      <h1 className="cl-welcome-h"><span className="cl-spark" aria-hidden="true">✳</span> {postReel ? "Your turn to plan" : "Where to next?"}</h1>
      {geoCity && <p className="cl-welcome-geo">Looks like you might be traveling from {geoCity}.</p>}
      <p className="cl-welcome-sub">{postReel
        ? "You're driving now. Tell me where you'd like to go and roughly when, and I'll pull real flights and hotels and build it the way you just watched. A rough idea is plenty; I'll ask if I need anything else."
        : "Voygent plans real trips with live flights and hotels. Pick one to watch it work, or describe your own."}</p>
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
  { items, folio, onSend, onPick, busy, presets, geoCity, advisor, mobileView, onMobileView, onToggleDemo, demoLabel, engHasContent, postReel, reelView, reelMode }:
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
    postReel?: boolean;
    reelView: ReelViewState;
    reelMode?: boolean;   // reel playback (mode=auto) — shows the folio "Send to client" affordance
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
        <span className="cl-header-note">travel-planning assistant</span>
        <span className="cl-positioning">Live MCP orchestration · persisted trip state · model routing · cost/context telemetry</span>
      </header>
      <div className="cl-ribbon" role="note">A Voygent demo in a Claude-style chat surface — not affiliated with Anthropic.</div>
      <div className="cl-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="cl-col">
          {firstRun && postReel && (
            <div className="cl-reel-greet" role="status">Live · you&#39;re driving now · real model, real supplier data</div>
          )}
          {firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} postReel={postReel} />}
          {items.map((it, i) => {
            if (it.role === "toolchip") return <ClaudeToolChip key={i} item={it} />;
            if (it.role === "board") return <BoardView key={it.boardId} board={it} busy={busy} advisor={advisor} onPick={onPick} selectedCandidate={reelView.selected[it.boardId]} />;
            if (it.role === "user") return <div key={i} className="cl-msg-user">{it.text}</div>;
            if (it.text) return <div key={i} className="cl-prose"><Prose text={it.text} /></div>;
            return busy && i === lastIdx ? <div key={i} className="cl-thinking" aria-label="Thinking"><span /></div> : null;
          })}
          {folio && <div className="cl-folio-inline"><FolioArtifact folio={folio} advisor={advisor} edits={reelView.edits} threads={reelView.threads} showSend={reelMode} sent={!!reelView.handoff?.sent} /></div>}
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
            {folio ? <FolioArtifact folio={folio} advisor={advisor} edits={reelView.edits} threads={reelView.threads} showSend={reelMode} sent={!!reelView.handoff?.sent} /> : <p className="cl-day-desc">Your trip folio will build here as Voygent works.</p>}
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
        <div className="cl-disclaimer">Voygent demo · a Claude-style chat surface, not affiliated with Anthropic.</div>
      </div>
    </main>
  );
}
