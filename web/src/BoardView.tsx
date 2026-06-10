import { Fragment, useState } from "react";
import type { BoardCandidate, FlightLeg } from "../../shared/events";
import type { BoardItem } from "./timeline";
import type { Actor } from "./lib/recording";
import { commissionLabel } from "./lib/advisor";
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

// Inline chooser board — the claude.ai "MCP app" moment. Candidates render as
// clickable option cards; a click sends the selection back to the agent as the
// next user turn. Once resolved (clicked, or the agent promoted after a typed
// reply) the board locks: the pick stays highlighted, siblings dim.
export function BoardView(
  { board, busy, advisor, onPick, selectedCandidate }:
  { board: BoardItem; busy: boolean; advisor: boolean; onPick: (board: BoardItem, c: BoardCandidate) => void; selectedCandidate?: { candidateIds: string[]; actor: Actor } },
) {
  // Per-candidate expand state for the routing detail. Undefined = follow the default
  // (the picked option auto-expands so the chosen routing is visible); a click overrides.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasReelSelection = (selectedCandidate?.candidateIds.length ?? 0) > 0;
  const locked = board.resolved || !!board.resolvedId || hasReelSelection;
  const title = board.kind === "flight" ? "Select a flight" : board.kind === "includes" ? "Choose what to include" : "Choose a hotel";
  return (
    <div className="cl-board" role="group" aria-label={title} data-reel-target={`board-${board.kind}`}>
      <div className="cl-board-title">{title}</div>
      <div className="cl-board-list">
        {board.candidates.map((c) => {
          const reelActor = pickedActor(selectedCandidate, c.id);
          const picked = board.resolvedId === c.id || reelActor != null;
          const detail = safeHttpUrl(c.detailUrl);
          const hasLegs = !!c.legs && c.legs.length > 0;
          const open = c.id in expanded ? expanded[c.id] : (picked && hasLegs);
          return (
            <div key={c.id} className={`cl-option-wrap ${picked ? "picked" : ""} ${picked && reelActor ? actorClass(reelActor) : ""} ${locked && !picked ? "dimmed" : ""}`}>
              <button
                type="button"
                className="cl-option"
                disabled={locked || busy}
                onClick={() => onPick(board, c)}
              >
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
                </span>
                <span className="cl-option-mark" aria-hidden={reelActor ? undefined : "true"}>
                  {picked ? (reelActor ? `✓ ${actorLabel(reelActor)} chose this` : "✓") : ""}
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
                    <a className="cl-option-detail" href={detail} target="_blank" rel="noopener noreferrer">details ↗</a>
                  )}
                </div>
              )}
              {open && hasLegs && <FlightLegs legs={c.legs!} />}
            </div>
          );
        })}
      </div>
      {!locked && <div className="cl-board-hint">Tap an option, or just tell me what you prefer.</div>}
    </div>
  );
}
