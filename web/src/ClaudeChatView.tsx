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
import { markProgrammaticScroll, consumeProgrammaticScroll } from "./lib/scroll-intent";
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

// While the assistant is working with no content yet, a bare pulsing dot reads as hung
// on a long live run. In live mode show an elapsed counter and, after a few seconds, a
// reassurance line. In the reel (quick scripted beats) keep the plain dot.
function WorkingIndicator({ live }: { live: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t0 = performance.now();
    const id = setInterval(() => setSecs(Math.floor((performance.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (!live) return <div className="cl-thinking" aria-label="Thinking"><span /></div>;
  return (
    <div className="cl-thinking cl-thinking-live" aria-live="polite" aria-label="Working">
      <i className="cl-thinking-dot" aria-hidden="true" />
      <span className="cl-thinking-label">
        Voygent is working{secs >= 1 ? ` · ${secs}s` : "…"}
        {secs >= 5 && <span className="cl-thinking-sub">running live searches, this can take up to a minute</span>}
      </span>
    </div>
  );
}

function FolioArtifact({ folio, advisor, edits, threads, showSend, sent, onRequestAccess }: { folio: FolioData; advisor: boolean; edits: ReelEditMarker[]; threads: ReelThread[]; showSend?: boolean; sent?: boolean; onRequestAccess?: () => void }) {
  // N12: an authored breakdown supersedes the hotels-derived total — the header pill
  // then shows earned commission across ALL components, and the itemized section below
  // carries the per-component rows (the section owns the trip-commission anchor then).
  const commRows = advisor && folio.commissions && folio.commissions.length > 0 ? folio.commissions : null;
  const commEarned = commRows ? commissionTotal(commRows.filter((r) => !r.potential).map((r) => ({ commission: r.amount }))) : null;
  const commTotal = advisor ? (commEarned ?? commissionTotal(folio.hotels)) : null;
  // A title-only card (trip created, nothing promoted yet) is just noise inline.
  const hasDays = !!folio.days && folio.days.length > 0;
  const hasIncludes = !!folio.includes && folio.includes.length > 0;
  if (folio.flights.length === 0 && folio.hotels.length === 0 && !hasDays && !hasIncludes) return null;
  // Glanceable summary chips — the panel leads with the trip at a glance, then the
  // detail sits below in a compact form (so it stops eating real estate when long).
  const flightChip = folio.flights.length === 1 ? (folio.flights[0].route ?? folio.flights[0].label) : folio.flights.length > 1 ? `${folio.flights.length} flights` : null;
  const hotelChip = folio.hotels.length === 1 ? folio.hotels[0].name : folio.hotels.length > 1 ? `${folio.hotels.length} hotels` : null;
  const summaryChips: Array<[string, string]> = [];
  if (flightChip) summaryChips.push(["✈", flightChip]);
  if (hotelChip) summaryChips.push(["🏨", hotelChip]);
  if (hasDays) summaryChips.push(["🗓", `${folio.days!.length} days`]);
  if (hasIncludes) summaryChips.push(["ℹ", `${folio.includes!.length} notes`]);
  return (
    <div className="cl-artifact" role="group" aria-label="Trip folio">
      <div className="cl-artifact-head">
        <span className="cl-artifact-titlerow">
          <span className="cl-artifact-kicker">Folio</span>
          <span className="cl-artifact-title">{folio.title}</span>
          {commTotal != null && <span className="cl-artifact-comm cl-artifact-headcomm" data-reel-target={commRows ? undefined : "trip-commission"}>{fmtUsd(commTotal)} comm.</span>}
        </span>
        {summaryChips.length > 0 && (
          <span className="cl-artifact-summary">
            {summaryChips.map(([icon, label]) => (
              <span key={label} className="cl-artifact-chip"><span aria-hidden="true">{icon}</span> {label}</span>
            ))}
          </span>
        )}
      </div>
      {(folio.flights.length > 0 || folio.hotels.length > 0) && (
        <div className="cl-artifact-sec">
          {folio.flights.map((f, i) => (
            <div key={`f${i}`} className="cl-artifact-row">
              <span className="cl-artifact-main">
                <span className="cl-artifact-name">{f.route ?? f.label}</span>
                <span className="cl-artifact-meta">{["Flight", f.carrier, f.date, f.cabin].filter(Boolean).join(" · ")}</span>
              </span>
              {f.price && <span className="cl-artifact-price">{f.price}</span>}
            </div>
          ))}
          {folio.hotels.map((h, i) => (
            <div key={`h${i}`} className="cl-artifact-row">
              <span className="cl-artifact-main">
                <span className="cl-artifact-name">{h.name}</span>
                <span className="cl-artifact-meta">
                  {["Hotel", h.area, typeof h.stars === "number" ? `${h.stars}★` : null, typeof h.nights === "number" ? `${h.nights} nights` : null].filter(Boolean).join(" · ")}
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
        </div>
      )}
      {folio.bookings && folio.bookings.length > 0 && (
        <div className="cl-artifact-sec" data-reel-target="folio-bookings">
          <h4>Confirmed</h4>
          {folio.bookings.map((b, i) => (
            <div key={i} className="cl-artifact-row">
              <span className="cl-artifact-main">
                <span className="cl-artifact-name">{b.label}</span>
                {b.detail && <span className="cl-artifact-meta">{b.detail}</span>}
              </span>
              <span className="cl-artifact-conf">{b.conf}</span>
            </div>
          ))}
        </div>
      )}
      {hasDays && (
        <div className="cl-artifact-sec cl-artifact-days" data-reel-target="folio-days">
          <h4>Day by day</h4>
          {folio.days!.map((d, i) => (
            <div key={i} className="cl-day" data-reel-target={`folio-day-${i}`}>
              <div className="cl-day-head">
                <span className="cl-day-title">{d.title}</span>
                {d.date && <span className="cl-day-date">{d.date}</span>}
              </div>
              {d.activities.length > 0 && (
                <div className="cl-day-acts">
                  {d.activities.map((a, j) => {
                    const au = safeHttpUrl(a.url);
                    const edit = editForActivity(edits, i, j);
                    // The edit marker can land a frame before the folio event that carries
                    // the new text — show the marker's `now` so the strikethrough never
                    // points at an identical "new" line while a callout dwells here.
                    const name = edit && a.name === edit.was ? edit.now : a.name;
                    return (
                      <span key={j} className={`cl-day-act${edit ? ` cl-day-edited ${actorClass(edit.actor)}${edit.reconciled ? " reconciled" : ""}` : ""}`}>
                        {edit && (
                          <span className="cl-edit-marker">
                            <span className="cl-sr-only">Changed from </span>
                            <span className="cl-edit-was">{edit.was}</span>
                            <span className="cl-edit-arrow" aria-hidden="true"> → </span>
                            <span className="cl-edit-tag">{actorLabel(edit.actor)} edited</span>
                          </span>
                        )}
                        {au ? <a href={au} target="_blank" rel="noopener noreferrer">{name}</a> : name}
                      </span>
                    );
                  })}
                </div>
              )}
              {d.dining.length > 0 && (
                <div className="cl-day-dining">
                  <span className="cl-day-dining-label">Dining:</span>{" "}
                  {d.dining.map((m, j) => {
                    const mu = safeHttpUrl(m.url);
                    return (
                      <span key={j} className="cl-dining-item">
                        {mu ? <a href={mu} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name}
                        {j < d.dining.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </div>
              )}
              {threadsForDay(threads, i).map((t) => (
                <CommentThread key={t.threadId} thread={t} dayTitle={d.title} />
              ))}
            </div>
          ))}
        </div>
      )}
      {hasIncludes && (
        <div className="cl-artifact-sec" data-reel-target="folio-includes">
          <h4>Good to know</h4>
          <div className="cl-include-list">
            {folio.includes!.map((inc) => (
              <details key={inc.key} className="cl-include">
                <summary className="cl-include-title">{inc.title}</summary>
                <div className="cl-include-body">{inc.body}</div>
              </details>
            ))}
          </div>
        </div>
      )}
      {commRows && (
        <div className="cl-artifact-sec cl-artifact-commsec" data-reel-target="trip-commission">
          <h4>Your commission</h4>
          {commRows.filter((r) => !r.potential).map((r, i) => (
            <div key={`c${i}`} className="cl-artifact-row">
              <span className="cl-artifact-main"><span className="cl-artifact-name">{r.label}</span></span>
              <span className="cl-artifact-comm">{commissionLabel(r.amount, r.pct)}</span>
            </div>
          ))}
          {commEarned != null && (
            <div className="cl-artifact-row cl-comm-total">
              <span className="cl-artifact-main"><span className="cl-artifact-name">Booked so far</span></span>
              <span className="cl-artifact-comm cl-comm-total-amt">{fmtUsd(commEarned)}</span>
            </div>
          )}
          {commRows.filter((r) => r.potential).map((r, i) => (
            <div key={`p${i}`} className="cl-artifact-row cl-comm-potential">
              <span className="cl-artifact-main"><span className="cl-artifact-name">{r.label}</span><span className="cl-artifact-meta">if they add it</span></span>
              <span className="cl-artifact-comm">{commissionLabel(r.amount, r.pct)}</span>
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
      {onRequestAccess && (
        <div className="cl-folio-cta">
          <p className="cl-folio-cta-lead">This folio is your proposal, built live. Want to build real trips with live supplier data?</p>
          <button type="button" className="cl-folio-cta-btn" onClick={onRequestAccess}>Get an auth code for a live demo →</button>
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
  { items, folio, onSend, onPick, busy, presets, geoCity, advisor, mobileView, onMobileView, onToggleDemo, demoLabel, engHasContent, postReel, reelView, reelMode, dataSource, onRequestAccess }:
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
    dataSource?: "live" | "sample" | null;  // honesty tag: live supplier data vs curated sample fixtures
    onRequestAccess?: () => void;  // live (non-reel) only: folio CTA → request a live-demo auth code
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
  // A2: only a USER scroll may unpin. Our own scrollIntoView calls (and ReelCallout's)
  // also fire onScroll, and on a phone a pinned chooser board is taller than the
  // viewport, so treating those programmatic scrolls as intent permanently killed
  // follow-scroll — everything after a pick (confirmation, first folio) landed below
  // the fold. Programmatic scrolls mark themselves (lib/scroll-intent) and each scroll
  // event consumes one mark, so a genuine gesture is never mistaken for ours.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (consumeProgrammaticScroll()) return; // our scrollIntoView, not the user
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => {
    if (!pinnedRef.current) return;
    // A mounted spotlight owns the frame: its layout-effect scroll (to an arbitrary
    // target) ran before this passive effect in the same commit, and scrolling to the
    // bottom now would shove the spotlit content back out of view. Playback is held
    // during the callout, so following resumes on the next beat after it closes.
    if (document.querySelector(".cl-reel-overlay")) return;
    // If a chooser board is awaiting a pick, keep IT in view instead of scrolling past it
    // to the trailing summary text (Neil: better to miss the summary than have to scroll
    // back up to choose). Otherwise stick to the bottom as before.
    markProgrammaticScroll();
    const pendingBoard = items.some((it) => it.role === "board" && !it.resolved && !it.resolvedId);
    if (pendingBoard) {
      const boards = scrollRef.current?.querySelectorAll<HTMLElement>('[data-reel-target^="board-"]');
      const last = boards && boards[boards.length - 1];
      if (last) { last.scrollIntoView({ block: "start" }); return; }
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, busy]);

  const lastIdx = items.length - 1;
  // Enrichment runs a long batch of tools (itinerary, excursions, dining) with
  // model-thinking gaps in between. The inline indicator (below) only covers an
  // empty trailing assistant placeholder, and a running tool chip carries its own
  // progress UI — so the gaps between batches would otherwise show nothing. Fill
  // them with a tail "working" line whenever we're busy and neither of those is
  // already on screen. Out of the reel (scripted beats pace themselves).
  const last = items[lastIdx];
  const lastIsRunningChip = last?.role === "toolchip" && last.status === "running";
  const lastIsEmptyAssistant = !!last && last.role !== "toolchip" && last.role !== "board" && last.role !== "user" && !last.text;
  const showTailWorking = busy && !reelMode && !lastIsRunningChip && !lastIsEmptyAssistant;
  return (
    <main className="cl-pane">
      <header className="cl-header">
        <span className="cl-wordmark"><span className="cl-spark" aria-hidden="true">✳</span> Voygent</span>
        <span className="cl-header-note">travel-planning assistant</span>
        <span className="cl-positioning">Live MCP orchestration · persisted trip state · model routing · cost/context telemetry</span>
      </header>
      <div className="cl-ribbon" role="note">A Voygent demo in a Claude-style chat surface — not affiliated with Anthropic.</div>
      {dataSource && (
        <div className={`cl-source cl-source-${dataSource}`} role="note">
          {dataSource === "live"
            ? <><span className="cl-source-dot" aria-hidden="true" /> Live results — real-time flights and hotels from suppliers.</>
            : <><span className="cl-source-dot" aria-hidden="true" /> Sample results — this featured trip uses curated data. Try an off-menu destination for a live run.</>}
        </div>
      )}
      <div className="cl-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="cl-col">
          {firstRun && postReel && (
            <div className="cl-reel-greet" role="status">Live · you&#39;re driving now · real model, real supplier data</div>
          )}
          {firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} postReel={postReel} />}
          {items.map((it, i) => {
            if (it.role === "toolchip") return <ClaudeToolChip key={i} item={it} />;
            if (it.role === "board") return <BoardView key={it.boardId} board={it} busy={busy} advisor={advisor} onPick={onPick} selectedCandidate={reelView.selected[it.boardId]} reelMode={reelMode} />;
            if (it.role === "user") return <div key={i} className="cl-msg-user">{it.text}</div>;
            if (it.text) return <div key={i} className="cl-prose"><Prose text={it.text} /></div>;
            return busy && i === lastIdx ? <WorkingIndicator key={i} live={!reelMode} /> : null;
          })}
          {showTailWorking && <WorkingIndicator live={!reelMode} />}
          {folio && <div className={`cl-folio-inline${reelMode ? " in-reel" : ""}`}><FolioArtifact folio={folio} advisor={advisor} edits={reelView.edits} threads={reelView.threads} showSend={reelMode} sent={!!reelView.handoff?.sent} onRequestAccess={onRequestAccess} /></div>}
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
            {folio ? <FolioArtifact folio={folio} advisor={advisor} edits={reelView.edits} threads={reelView.threads} showSend={reelMode} sent={!!reelView.handoff?.sent} onRequestAccess={onRequestAccess} /> : <p className="cl-day-desc">Your trip folio will build here as Voygent works.</p>}
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
      </div>
    </main>
  );
}
