import { useState } from "react";
import type { ToolChipItem } from "./timeline";

// claude.ai-style MCP tool-use block: a collapsible pill reading
// "Using Voygent — <tool>" with a spinner while running and a checkmark when
// done. Expanding reveals the short result summary (the friendly view — the
// Engineering Inspector holds the full args/result).
export function ClaudeToolChip({ item }: { item: ToolChipItem }) {
  const [open, setOpen] = useState(false);
  const running = item.status === "running";
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
        <span className="cl-tool-state">{running ? "Running…" : "Done"}</span>
        <span className="cl-tool-chev" aria-hidden="true">{open ? "⌄" : "›"}</span>
      </button>
      {open && (
        <div className="cl-tool-body">
          {item.summary ? <code>{item.summary}</code> : <span className="cl-tool-pending">Waiting for the result…</span>}
        </div>
      )}
    </div>
  );
}
