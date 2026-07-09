import type { ReelEmailView as ReelEmailViewData } from "./lib/recording";

// QA4 ch3: the airline's confirmation email, drawn as a plain email window — sloppy
// monospace body, DO-NOT-REPLY header, exactly as it landed in the advisor's inbox.
// The point of the beat: THIS mess is what the advisor pastes into the chat, and
// Voygent files it. Non-interactive; the reel drives it via emailview snapshots.
export function ReelEmailView({ view }: { view: ReelEmailViewData }) {
  return (
    <div className="cl-email-scrim cl-scene-client" role="dialog" aria-modal="false" aria-label={view.sceneLabel ?? "Inbox"}>
      <div className="cl-scene-label"><span aria-hidden="true">📥</span> {view.sceneLabel ?? "Inbox"}</div>
      <div className="cl-email-window" data-reel-target="email-window">
        <div className="cl-email-head">
          <span className="cl-email-row"><b>From:</b> {view.from}</span>
          <span className="cl-email-row"><b>Subject:</b> {view.subject}</span>
        </div>
        <pre className="cl-email-body">{view.body}</pre>
      </div>
    </div>
  );
}
