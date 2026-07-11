import type { ReelPocketGuide as ReelPocketGuideData } from "./lib/recording";

// The Pocket Guide, drawn as a phone the traveller has saved to their home screen:
// an offline badge up top, the tickets and confirmations it holds, and the at-a-glance
// days. Non-interactive; the reel drives it via pocketGuide snapshots. Real feature —
// voygent-lite renders this as a self-contained PWA page (preview_folio pocket_guide).
export function ReelPocketGuide({ view }: { view: ReelPocketGuideData }) {
  return (
    <div className="cl-pg-scrim cl-scene-client" role="dialog" aria-modal="false" aria-label={view.sceneLabel ?? "Pocket Guide"}>
      <div className="cl-scene-label"><span aria-hidden="true">📱</span> {view.sceneLabel ?? "Saved to your phone"}</div>
      <div className="cl-pg-phone" data-reel-target="pocket-guide">
        <div className="cl-pg-head">
          <div className="cl-pg-titles">
            <span className="cl-pg-kicker">Pocket Guide</span>
            <span className="cl-pg-title">{view.tripName}</span>
            {view.subtitle && <span className="cl-pg-sub">{view.subtitle}</span>}
          </div>
          <span className="cl-pg-offline"><span className="cl-pg-dot" aria-hidden="true" /> Offline</span>
        </div>

        <div className="cl-pg-body">
          <div className="cl-pg-sec">
            <h4>Your tickets &amp; confirmations</h4>
            {view.tickets.map((t, i) => (
              <div key={i} className="cl-pg-ticket">
                <span className="cl-pg-tk" aria-hidden="true">🎟️</span>
                <span className="cl-pg-tmain">
                  <span className="cl-pg-tlabel">{t.label}</span>
                  {t.note && <span className="cl-pg-tnote">{t.note}</span>}
                </span>
                <span className="cl-pg-tconf">{t.conf}</span>
              </div>
            ))}
          </div>

          {view.days && view.days.length > 0 && (
            <div className="cl-pg-sec">
              <h4>The week at a glance</h4>
              <ol className="cl-pg-days">
                {view.days.map((d, i) => (
                  <li key={i}><b>{i + 1}</b> {d}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="cl-pg-foot">Saved to your home screen · opens with no signal</div>
      </div>
    </div>
  );
}
