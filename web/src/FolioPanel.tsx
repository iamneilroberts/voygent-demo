import type { FolioData, FolioFlight, FolioHotel } from "../../shared/events";
import { SplitFlap } from "./SplitFlap";

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

function HotelCard({ h }: { h: FolioHotel }) {
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
      </div>
    </div>
  );
}

export function FolioPanel({ folio }: { folio: FolioData | null }) {
  if (!folio) return <aside className="folio empty">Your trip-folio will build here as the agent works…</aside>;
  return (
    <aside className="folio">
      <h2 className="folio-title"><SplitFlap text={folio.title} as="span" /></h2>
      <section>
        <h3>Flights</h3>
        {folio.flights.length === 0 ? <p>—</p> : folio.flights.map((f, i) => <FlightCard key={i} f={f} />)}
      </section>
      <section>
        <h3>Hotels</h3>
        {folio.hotels.length === 0 ? <p>—</p> : folio.hotels.map((h, i) => <HotelCard key={i} h={h} />)}
      </section>
    </aside>
  );
}
