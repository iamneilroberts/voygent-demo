import { useState } from "react";
import type { ReelClientSession } from "./lib/recording";
import type { NextChapterCta } from "./ReelEndCard";
import { computeTripTotal, usd } from "./lib/reel-pricing";

// Interactive end-state for the collab reel: instead of a static end card, the reel
// finishes on the trip folio the viewer can actually play with — swap the hotel, toggle
// add-ons, and watch the price update live. "Send to Voygent" and the CTA both point at
// the live interactive demo. Seeded from the final client-view snapshot (the same
// pricing data the reel already built), so the numbers stay consistent.
export function ReelExplore(
  { view, onLiveDemo, onReplay, nextChapter }:
  { view: ReelClientSession; onLiveDemo: () => void; onReplay: () => void;
    // Chapter 1 ends here (not on ReelEndCard), so the next-chapter CTA lives here too.
    nextChapter?: NextChapterCta },
) {
  const [pickedHotelId, setPicked] = useState<string | null>(view.pickedHotelId ?? view.hotels[0]?.id ?? null);
  const [addons, setAddons] = useState(view.addons);
  const [sent, setSent] = useState(false);
  const total = computeTripTotal({ ...view, pickedHotelId, addons });

  return (
    <div className="cl-explore-scrim" role="dialog" aria-modal="true" aria-label="Explore the trip">
      <div className="cl-explore">
        <div className="cl-explore-head">
          <span className="cl-explore-eyebrow">Your turn · explore the trip</span>
          <h3 className="cl-explore-title">{view.tripTitle}</h3>
        </div>
        <p className="cl-explore-note">Swap the hotel or toggle an add-on and watch the price update. This is the scripted demo trip; the live demo pulls real flights and hotels.</p>

        <div className="cl-explore-line"><span>Flights</span><span>{usd(view.flightsPrice)}</span></div>

        <div className="cl-explore-group">
          <div className="cl-explore-group-h">Choose the hotel</div>
          {view.hotels.map((h) => {
            const on = h.id === pickedHotelId;
            return (
              <button key={h.id} type="button" className={`cl-explore-opt ${on ? "on" : ""}`} onClick={() => setPicked(h.id)} aria-pressed={on}>
                <span className="cl-explore-radio" aria-hidden="true">{on ? "●" : "○"}</span>
                <span className="cl-explore-opt-main"><span className="cl-explore-opt-name">{h.name}</span>{h.meta && <span className="cl-explore-opt-meta">{h.meta}</span>}</span>
                <span className="cl-explore-opt-price">{usd(h.price)}</span>
              </button>
            );
          })}
        </div>

        <div className="cl-explore-line"><span>Activities</span><span>{usd(view.activitiesPrice)}</span></div>

        {addons.length > 0 && (
          <div className="cl-explore-group">
            <div className="cl-explore-group-h">Optional add-ons</div>
            {addons.map((a) => (
              <button key={a.id} type="button" className={`cl-explore-addon ${a.on ? "on" : ""}`} onClick={() => setAddons((xs) => xs.map((x) => x.id === a.id ? { ...x, on: !x.on } : x))} aria-pressed={a.on}>
                <span className="cl-explore-check" aria-hidden="true">{a.on ? "☑" : "☐"}</span>
                <span className="cl-explore-opt-main"><span className="cl-explore-opt-name">{a.label}</span></span>
                <span className="cl-explore-opt-price">+{usd(a.price)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="cl-explore-total"><span>Trip total</span><b key={total}>{usd(total)}</b></div>

        <div className="cl-explore-actions">
          <button type="button" className="cl-explore-send" onClick={() => setSent(true)}>Send to Voygent →</button>
          {nextChapter && <button type="button" className="cl-explore-cta" onClick={nextChapter.onClick}>{nextChapter.label}</button>}
          <button type="button" className="cl-explore-cta" onClick={onLiveDemo}>Open the interactive demo</button>
          <button type="button" className="cl-explore-replay" onClick={onReplay}>↺ Replay the reel</button>
        </div>
      </div>

      {sent && (
        <div className="cl-explore-dialog-scrim" role="dialog" aria-modal="true" aria-label="Open the live demo">
          <div className="cl-explore-dialog">
            <div className="cl-explore-dialog-eyebrow">This one&#39;s a guided demo</div>
            <h4 className="cl-explore-dialog-h">Build a real one in the live demo</h4>
            <p className="cl-explore-dialog-p">You just priced a scripted trip. To plan a real one with live flights, hotels and your own travellers, open the interactive demo and drive it yourself.</p>
            <button type="button" className="cl-explore-send" onClick={onLiveDemo}>Open the interactive demo →</button>
            <button type="button" className="cl-explore-keep" onClick={() => setSent(false)}>Keep exploring</button>
          </div>
        </div>
      )}
    </div>
  );
}
