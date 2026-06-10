import { useState, useEffect } from "react";
import type { ReelHandoff } from "./lib/interaction";

// Generic email-style notification for the send-to-client round-trip. NO Gmail
// branding (neutral mail icon) and a "simulated" tag ON each notification, per the
// honesty decision (Codex flag + Neil): this conveys the email channel AND the
// reply routing back into the agent, fully simulated client-side. A single
// sendsToClient beat sets both `sent` and `routedBack`, so both notifications and
// the routing chip appear together (staggered in CSS). Self-dismisses after the
// handoff dwell so it doesn't hang over the comment beats that follow; the timer is
// cleared on unmount (reel reset empties reelView.handoff and unmounts this).
export function ReelHandoffNotice({ handoff }: { handoff: ReelHandoff }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Cosmetic dwell-and-tuck (just past the 5.2s handoff dwell). Reduced-motion only
    // drops the entrance animation (handled in CSS); the timing is preserved.
    const t = setTimeout(() => setVisible(false), 5600);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="cl-handoff" role="status" aria-live="polite" data-reel-target="handoff-notice">
      <div className="cl-handoff-card">
        <span className="cl-handoff-icon" aria-hidden="true">✉</span>
        <span className="cl-handoff-txt">
          <span className="cl-handoff-meta">Email · to client <span className="cl-handoff-sim">simulated</span></span>
          <span className="cl-handoff-title">{handoff.subject ?? "Your trip is ready to review"}</span>
          <span className="cl-handoff-sub">Voygent sent the folio. The client can pick options and comment.</span>
        </span>
      </div>
      {handoff.routedBack && (
        <>
          <div className="cl-handoff-card cl-handoff-card-2">
            <span className="cl-handoff-icon" aria-hidden="true">✉</span>
            <span className="cl-handoff-txt">
              <span className="cl-handoff-meta">Email · new reply from client <span className="cl-handoff-sim">simulated</span></span>
              <span className="cl-handoff-title">{handoff.reply ? `“${handoff.reply}”` : "The client replied."}</span>
            </span>
          </div>
          <div className="cl-handoff-route">
            <span className="cl-handoff-dot" aria-hidden="true" /> client&#39;s note
            <span className="cl-handoff-arrow" aria-hidden="true"> → </span> routed back to the agent
          </div>
        </>
      )}
    </div>
  );
}
