import type { BoardCandidate } from "../../shared/events";
import type { BoardItem } from "./timeline";
import { commissionLabel } from "./lib/advisor";

// Inline chooser board — the claude.ai "MCP app" moment. Candidates render as
// clickable option cards; a click sends the selection back to the agent as the
// next user turn. Once resolved (clicked, or the agent promoted after a typed
// reply) the board locks: the pick stays highlighted, siblings dim.
export function BoardView(
  { board, busy, advisor, onPick }:
  { board: BoardItem; busy: boolean; advisor: boolean; onPick: (board: BoardItem, c: BoardCandidate) => void },
) {
  const locked = board.resolved || !!board.resolvedId;
  const title = board.kind === "flight" ? "Select a flight" : "Choose a hotel";
  return (
    <div className="cl-board" role="group" aria-label={title}>
      <div className="cl-board-title">{title}</div>
      <div className="cl-board-list">
        {board.candidates.map((c) => {
          const picked = board.resolvedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={`cl-option ${picked ? "picked" : ""} ${locked && !picked ? "dimmed" : ""}`}
              disabled={locked || busy}
              onClick={() => onPick(board, c)}
            >
              <span className="cl-option-main">
                <span className="cl-option-title">{c.title}</span>
                {c.meta && <span className="cl-option-meta">{c.meta}</span>}
              </span>
              <span className="cl-option-econ">
                {c.price && <span className="cl-option-price">{c.price}</span>}
                {advisor && typeof c.commission === "number" && (
                  <span className="cl-option-comm">{commissionLabel(c.commission, c.commissionPct)}</span>
                )}
              </span>
              <span className="cl-option-mark" aria-hidden="true">{picked ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      {!locked && <div className="cl-board-hint">Tap an option, or just tell me what you prefer.</div>}
    </div>
  );
}
