import type { ReelClientSession } from "./lib/recording";
import { computeTripTotal, usd } from "./lib/reel-pricing";

// R4: the client's view of the trip, drawn as a simulated second browser window so it
// reads as the traveler's separate device (not the advisor's chat). Snapshot-driven:
// the screenplay emits clientview beats, and consecutive beats animate the live price
// recalc (the total has a CSS transition). Non-interactive — the reel drives it; the
// radios/toggles reflect the snapshot, the "simulated" tag keeps it honest.
export function ReelClientView({ view }: { view: ReelClientSession }) {
  const total = computeTripTotal(view);
  const pct = Math.round(Math.max(0, Math.min(1, view.progress)) * 100);
  return (
    <div className="cl-cv-scrim" role="dialog" aria-modal="false" aria-label="What the client sees">
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
          <div className="cl-cv-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
            <span className="cl-cv-progress-l">{pct >= 100 ? "Ready to book" : "Almost ready to book"}</span>
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
