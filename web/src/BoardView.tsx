import { Fragment, useState } from "react";
import type { BoardCandidate, FlightLeg } from "../../shared/events";
import type { BoardItem } from "./timeline";
import type { Actor } from "./lib/recording";
import { commissionLabel, fmtUsd } from "./lib/advisor";
import { safeHttpUrl } from "./lib/url";
import { actorClass, actorLabel, pickedActor } from "./lib/reel-render";

// The expandable routing detail behind a flight option: each leg's route, times,
// flight number and aircraft, with the layover called out between legs.
function FlightLegs({ legs }: { legs: FlightLeg[] }) {
  return (
    <div className="cl-option-legs">
      {legs.map((leg, i) => (
        <Fragment key={i}>
          <div className="cl-leg">
            <span className="cl-leg-route">{leg.from} → {leg.to}</span>
            {(leg.depart || leg.arrive) && <span className="cl-leg-times">{[leg.depart, leg.arrive].filter(Boolean).join(" – ")}</span>}
            <span className="cl-leg-meta">{[leg.flightNo, leg.aircraft, leg.duration].filter(Boolean).join(" · ")}</span>
          </div>
          {leg.layoverAfter && <div className="cl-leg-layover">{leg.layoverAfter} layover in {leg.to}</div>}
        </Fragment>
      ))}
    </div>
  );
}

// Inline chooser board — the claude.ai "MCP app" moment. In live (interactive)
// mode a click only HIGHLIGHTS an option (and opens its detail) — nothing is
// committed until the explicit "Confirm" button, so the advisor can explore
// without locking the trip. In the reel (scripted) a click keeps the legacy
// immediate-pick path; reel picks are driven by `selectedCandidate`. Once
// resolved the board locks: the pick stays highlighted, siblings dim.
export function BoardView(
  { board, busy, advisor, onPick, selectedCandidate, reelMode }:
  { board: BoardItem; busy: boolean; advisor: boolean; onPick: (board: BoardItem, c: BoardCandidate) => void; selectedCandidate?: { candidateIds: string[]; actor: Actor }; reelMode?: boolean },
) {
  // Per-candidate expand state for the routing detail. Undefined = follow the default
  // (the highlighted/picked option auto-expands so the routing is visible); a click overrides.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Live highlight: the option the advisor is considering, not yet committed.
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const hasReelSelection = (selectedCandidate?.candidateIds.length ?? 0) > 0;
  const locked = board.resolved || !!board.resolvedId || hasReelSelection;
  const interactive = !reelMode; // live driving = highlight, then confirm
  const kindWord = board.kind === "flight" ? "flight" : board.kind === "hotel" ? "hotel" : "option";
  const title = board.kind === "flight" ? "Select a flight" : board.kind === "includes" ? "Choose what to include" : "Choose a hotel";

  function rowClick(c: BoardCandidate) {
    if (locked || busy) return;
    if (interactive) { setHighlighted((h) => (h === c.id ? null : c.id)); return; }
    onPick(board, c); // reel/auto path keeps the immediate-pick behavior
  }
  function confirm() {
    const c = board.candidates.find((x) => x.id === highlighted);
    if (c) onPick(board, c);
  }

  return (
    <div className="cl-board" role="group" aria-label={title} data-reel-target={`board-${board.kind}`}>
      <div className="cl-board-title">{title}</div>
      <div className="cl-board-list">
        {board.candidates.map((c) => {
          const reelActor = pickedActor(selectedCandidate, c.id);
          const picked = board.resolvedId === c.id || reelActor != null;
          const liveHi = interactive && !locked && highlighted === c.id;
          const detail = safeHttpUrl(c.detailUrl);
          const hasLegs = !!c.legs && c.legs.length > 0;
          const open = c.id in expanded ? expanded[c.id] : ((liveHi || picked) && hasLegs);
          return (
            <div key={c.id} className={`cl-option-wrap ${picked ? "picked" : ""} ${liveHi ? "selected" : ""} ${picked && reelActor ? actorClass(reelActor) : ""} ${locked && !picked ? "dimmed" : ""}`}>
              <button
                type="button"
                className="cl-option"
                disabled={locked || busy}
                aria-pressed={interactive ? liveHi : undefined}
                onClick={() => rowClick(c)}
              >
                {c.image && (
                  <span className="cl-option-thumb">
                    <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    {typeof c.photoCount === "number" && c.photoCount > 0 && (
                      <span className="cl-option-photos">📷 {c.photoCount.toLocaleString("en-US")}</span>
                    )}
                  </span>
                )}
                <span className="cl-option-main">
                  <span className="cl-option-titlerow">
                    <span className="cl-option-title">{c.title}</span>
                    {c.badge && <span className="cl-option-badge">{c.badge}</span>}
                  </span>
                  {c.meta && <span className="cl-option-meta">{c.meta}</span>}
                </span>
                <span className="cl-option-econ">
                  {c.price && <span className="cl-option-price">{c.price}</span>}
                  {advisor && typeof c.commission === "number" && (
                    <span className="cl-option-comm">{commissionLabel(c.commission, c.commissionPct)}</span>
                  )}
                  {advisor && (typeof c.otaFrom === "number" || typeof c.clientPrice === "number") && (
                    <span className="cl-option-ladder">
                      {typeof c.otaFrom === "number" && <>public {fmtUsd(c.otaFrom)}/nt</>}
                      {typeof c.otaFrom === "number" && typeof c.clientPrice === "number" && " · "}
                      {typeof c.clientPrice === "number" && <>client {fmtUsd(c.clientPrice)}</>}
                    </span>
                  )}
                </span>
                <span className="cl-option-mark" aria-hidden={reelActor || liveHi ? undefined : "true"}>
                  {picked ? (reelActor ? `✓ ${actorLabel(reelActor)} chose this` : "✓") : (liveHi ? "●" : "")}
                </span>
              </button>
              {(hasLegs || detail) && (
                <div className="cl-option-sub">
                  {hasLegs && (
                    <button
                      type="button"
                      className="cl-option-expand"
                      aria-expanded={open}
                      onClick={() => setExpanded((m) => ({ ...m, [c.id]: !open }))}
                    >
                      {open ? "Hide routing ▲" : "Routing & aircraft ▼"}
                    </button>
                  )}
                  {detail && (
                    <a className="cl-option-detail" href={detail} target="_blank" rel="noopener noreferrer">{c.detailLabel ?? "details ↗"}</a>
                  )}
                </div>
              )}
              {open && hasLegs && <FlightLegs legs={c.legs!} />}
            </div>
          );
        })}
      </div>
      {interactive && !locked && (
        <div className="cl-board-actions">
          <button type="button" className="cl-board-confirm" disabled={!highlighted || busy} onClick={confirm}>
            {board.kind === "flight" ? "Confirm flight →" : board.kind === "hotel" ? "Choose this hotel →" : "Confirm →"}
          </button>
          {!highlighted && <span className="cl-board-hint">Tap a {kindWord} to see details, or just tell me what you prefer.</span>}
        </div>
      )}
      {!interactive && !locked && <div className="cl-board-hint">Tap an option, or just tell me what you prefer.</div>}
    </div>
  );
}
