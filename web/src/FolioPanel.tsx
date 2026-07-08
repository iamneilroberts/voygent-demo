import type { FolioData, FolioFlight, FolioHotel } from "../../shared/events";
import { SplitFlap } from "./SplitFlap";
import { commissionLabel, commissionTotal, fmtUsd } from "./lib/advisor";
import { safeHttpUrl } from "./lib/url";

function stopsLabel(stops?: number): string | null {
  if (stops == null) return null;
  return stops === 0 ? "nonstop" : stops === 1 ? "1 stop" : `${stops} stops`;
}

function FlightCard({ f }: { f: FolioFlight }) {
  const meta = [f.carrier, f.date, stopsLabel(f.stops), f.cabin].filter(Boolean).join(" · ");
  const code = f.route ?? f.label;
  return (
    <div className="card fade-in">
      <div className="card-main">
        <div className="card-title"><SplitFlap text={code} /></div>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
      {f.price && <div className="card-price">{f.price}</div>}
    </div>
  );
}

function HotelCard({ h, advisor }: { h: FolioHotel; advisor: boolean }) {
  const meta = [
    h.area,
    typeof h.stars === "number" ? `${h.stars}★` : null,
    h.allInclusive ? "All-inclusive" : null,
    typeof h.nights === "number" ? `${h.nights} nights` : null,
    typeof h.travelers === "number" ? `${h.travelers} travelers` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="card fade-in">
      {h.image && (
        <img className="card-thumb" src={h.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
      )}
      <div className="card-main">
        <div className="card-title">{h.name}</div>
        {meta && <div className="card-meta">{meta}</div>}
        {h.quoteUrl && (
          <a className="card-link" href={h.quoteUrl} target="_blank" rel="noopener noreferrer">view rooms ↗</a>
        )}
      </div>
      <div className="card-price">
        {h.price ?? ""}
        {h.perNight && <span className="card-sub">{h.perNight}/night</span>}
        {advisor && typeof h.commission === "number" && (
          <span className="card-comm">{commissionLabel(h.commission, h.commissionPct)}</span>
        )}
      </div>
    </div>
  );
}

export function FolioPanel({ folio, advisor, onRequestAccess }: { folio: FolioData | null; advisor: boolean; onRequestAccess?: () => void }) {
  if (!folio) return <aside className="folio empty">Your trip-folio will build here as Voygent works…</aside>;
  const commTotal = advisor ? commissionTotal(folio.hotels) : null;
  const built = folio.flights.length > 0 || folio.hotels.length > 0;
  return (
    <aside className="folio">
      <h2 className="folio-title"><SplitFlap text={folio.title} as="span" /></h2>
      <section>
        <h3>Flights</h3>
        {folio.flights.length === 0 ? <p>—</p> : folio.flights.map((f, i) => <FlightCard key={i} f={f} />)}
      </section>
      <section>
        <h3>Hotels</h3>
        {folio.hotels.length === 0 ? <p>—</p> : folio.hotels.map((h, i) => <HotelCard key={i} h={h} advisor={advisor} />)}
        {commTotal != null && (
          <div className="folio-comm-total">Trip commission: <strong>{fmtUsd(commTotal)}</strong></div>
        )}
      </section>
      {folio.days && folio.days.length > 0 && (
        <section>
          <h3>Day by day</h3>
          {folio.days.map((d, i) => (
            <div key={i} className="folio-day">
              <div className="folio-day-title">{d.title}{d.date ? ` · ${d.date}` : ""}</div>
              {d.activities.map((a, j) => {
                const au = safeHttpUrl(a.url);
                return (
                  <div key={j} className="folio-day-act">
                    {au ? <a href={au} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}
                    {a.description ? <span className="card-sub"> {a.description}</span> : null}
                  </div>
                );
              })}
              {d.dining.length > 0 && (
                <div className="folio-day-dining">Local picks: {d.dining.map((m) => m.name + (m.cuisine ? ` (${m.cuisine})` : "")).join(", ")}</div>
              )}
              {d.stay && <div className="folio-day-stay">Stay: {d.stay}</div>}
            </div>
          ))}
        </section>
      )}
      {folio.bookings && folio.bookings.length > 0 && (
        <section>
          <h3>Confirmed</h3>
          {folio.bookings.map((b, i) => (
            <div key={i} className="folio-booking">
              <strong>{b.label}</strong>
              {b.detail ? <span className="card-sub"> {b.detail}</span> : null}
              <span className="folio-booking-conf">{b.conf}</span>
            </div>
          ))}
        </section>
      )}
      {folio.includes && folio.includes.length > 0 && (
        <section>
          <h3>What&#39;s included &amp; good to know</h3>
          {folio.includes.map((inc) => (
            <div key={inc.key} className="folio-include">
              <strong>{inc.title}:</strong> {inc.body}
            </div>
          ))}
        </section>
      )}
      {onRequestAccess && built && (
        <section className="folio-cta">
          <p className="folio-cta-lead">This folio is your proposal, built live. Want to build real trips with live supplier data?</p>
          <button type="button" className="folio-cta-btn" onClick={onRequestAccess}>Get an auth code for a live demo →</button>
        </section>
      )}
    </aside>
  );
}
