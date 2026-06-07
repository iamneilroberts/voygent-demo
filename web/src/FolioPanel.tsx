import type { FolioData, FolioFlight, FolioHotel } from "../../shared/events";
import { SplitFlap } from "./SplitFlap";
import { commissionLabel, commissionTotal, fmtUsd } from "./lib/advisor";

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
    typeof h.nights === "number" ? `${h.nights} nights` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="card fade-in">
      <div className="card-main">
        <div className="card-title">{h.name}</div>
        {meta && <div className="card-meta">{meta}</div>}
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

export function FolioPanel({ folio, advisor }: { folio: FolioData | null; advisor: boolean }) {
  if (!folio) return <aside className="folio empty">Your trip-folio will build here as the agent works…</aside>;
  const commTotal = advisor ? commissionTotal(folio.hotels) : null;
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
              {d.activities.map((a, j) => (
                <div key={j} className="folio-day-act">
                  {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}
                  {a.description ? <span className="card-sub"> {a.description}</span> : null}
                </div>
              ))}
              {d.dining.length > 0 && (
                <div className="folio-day-dining">Local picks: {d.dining.map((m) => m.name + (m.cuisine ? ` (${m.cuisine})` : "")).join(", ")}</div>
              )}
              {d.stay && <div className="folio-day-stay">Stay: {d.stay}</div>}
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
    </aside>
  );
}
