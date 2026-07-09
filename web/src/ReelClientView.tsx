import type { ReelClientSession } from "./lib/recording";
import { computeTripTotal, usd } from "./lib/reel-pricing";

// R4: the client's view of the trip, drawn as a simulated second browser window so it
// reads as the traveler's separate device (not the advisor's chat). Snapshot-driven:
// the screenplay emits clientview beats, and consecutive beats animate the live price
// recalc (the total has a CSS transition). Non-interactive — the reel drives it; the
// radios/toggles reflect the snapshot, the "simulated" tag keeps it honest.
export function ReelClientView({ view }: { view: ReelClientSession }) {
  const total = computeTripTotal(view);
  // N11: the status line is DERIVED from real state (is the hotel chosen?), not from
  // the authored `progress` number — a bar that crept up per snapshot read as movement
  // for no reason. One choice gates readiness; it flips exactly when they pick.
  const hasChoice = view.hotels.length > 1;
  const ready = !hasChoice || view.pickedHotelId != null;
  return (
    <div className="cl-cv-scrim cl-scene-client" role="dialog" aria-modal="false" aria-label="What the client sees">
      {/* N18: scene shift — blurred inbox backdrop + label say "we're in the clients' window now". */}
      <div className="cl-scene-label"><span aria-hidden="true">📥</span> The clients&#39; view — the Millers&#39; window</div>
      <div className="cl-cv-window" data-reel-target="client-view">
        <div className="cl-cv-chrome">
          <span className="cl-cv-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="cl-cv-url">🔒 {view.url}</span>
          <span className="cl-cv-sim">viewing as client · simulated</span>
        </div>
        <div className="cl-cv-body">
          <div className="cl-cv-head">
            <h3 className="cl-cv-title">{view.tripTitle}</h3>
            <span className="cl-cv-total" key={total}>{usd(total)}</span>
          </div>
          <div className={`cl-cv-progress ${ready ? "ready" : ""}`}>
            <span className="cl-cv-progress-l">{ready ? "✓ Ready to book — send it back to your advisor" : "Pick your hotel to finish"}</span>
          </div>

          <div className="cl-cv-line"><span>Flights</span><span>{usd(view.flightsPrice)}</span></div>

          <div className="cl-cv-group">
            <div className="cl-cv-group-h">Choose your hotel</div>
            {view.hotels.map((h) => {
              const picked = h.id === view.pickedHotelId;
              return (
                <label key={h.id} className={`cl-cv-opt ${picked ? "picked" : ""}`}>
                  <span className="cl-cv-radio" aria-hidden="true">{picked ? "●" : "○"}</span>
                  <span className="cl-cv-opt-main"><span className="cl-cv-opt-name">{h.name}</span>{h.meta && <span className="cl-cv-opt-meta">{h.meta}</span>}</span>
                  <span className="cl-cv-opt-price">{usd(h.price)}</span>
                </label>
              );
            })}
          </div>

          <div className="cl-cv-line"><span>Activities</span><span>{usd(view.activitiesPrice)}</span></div>

          {view.addons.length > 0 && (
            <div className="cl-cv-group">
              <div className="cl-cv-group-h">Optional</div>
              {view.addons.map((a) => (
                <label key={a.id} className={`cl-cv-addon ${a.on ? "on" : ""}`}>
                  <span className="cl-cv-check" aria-hidden="true">{a.on ? "☑" : "☐"}</span>
                  <span className="cl-cv-opt-main"><span className="cl-cv-opt-name">{a.label}</span></span>
                  <span className="cl-cv-opt-price">+{usd(a.price)}</span>
                </label>
              ))}
            </div>
          )}

          <div className="cl-cv-foot">
            <span className="cl-cv-grand">Total <b key={total}>{usd(total)}</b></span>
          </div>

          {view.question != null && (
            <div className="cl-cv-note">
              <div className="cl-cv-note-l">A note for your advisor</div>
              <div className="cl-cv-note-box">{view.question}</div>
            </div>
          )}

          <button type="button" className="cl-cv-send" aria-disabled="true">Send feedback ▸</button>
        </div>
      </div>
    </div>
  );
}
