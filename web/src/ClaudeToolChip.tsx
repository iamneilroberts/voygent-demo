import { useEffect, useRef, useState } from "react";
import type { ToolChipItem } from "./timeline";

// claude.ai-style MCP tool-use block: a collapsible pill reading
// "Using Voygent — <tool>" with a spinner while running and a checkmark when
// done. Expanding reveals the short result summary (the friendly view — the
// Engineering Inspector holds the full args/result).
//
// While running, the chip shows live progress — an elapsed-seconds counter, an
// indeterminate sweep bar, and a reassurance line once a call runs long — so a
// slow real tool call never reads as a hung UI.
export function ClaudeToolChip({ item }: { item: ToolChipItem }) {
  const [open, setOpen] = useState(false);
  const running = item.status === "running";
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) { startRef.current = null; setElapsed(0); return; }
    startRef.current = performance.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startRef.current != null) setElapsed(Math.floor((performance.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const stateText = running ? (elapsed >= 1 ? `Working… ${elapsed}s` : "Working…") : "Done";
  return (
    <div className={`cl-tool ${running ? "running" : "done"}`} data-reel-target={`tool-${item.name}`}>
      <button
        type="button"
        className="cl-tool-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="cl-tool-status" aria-hidden="true">
          {running ? <span className="cl-spinner" /> : <span className="cl-check">✓</span>}
        </span>
        <span className="cl-tool-label">
          Using <strong>Voygent</strong> <code>{item.name}</code>
        </span>
        <span className="cl-tool-state" aria-live="polite">{stateText}</span>
        <span className="cl-tool-chev" aria-hidden="true">{open ? "⌄" : "›"}</span>
      </button>
      {running && (
        <div className="cl-tool-progress" aria-hidden="true"><i /></div>
      )}
      {running && elapsed >= 6 && (
        <div className="cl-tool-wait">Still working — live searches can take up to a minute.</div>
      )}
      {open && (
        <div className="cl-tool-body">
          {item.summary ? <code>{item.summary}</code> : <span className="cl-tool-pending">Waiting for the result…</span>}
        </div>
      )}
    </div>
  );
}
