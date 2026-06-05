import type { FolioData } from "../../shared/events";

export function FolioPanel({ folio }: { folio: FolioData | null }) {
  if (!folio) return <aside className="folio empty">Your trip-folio will build here…</aside>;
  return (
    <aside className="folio">
      <h2>{folio.title}</h2>
      <section><h3>Flights</h3>{folio.flights.length === 0 ? <p>—</p> :
        folio.flights.map((f, i) => <div key={i} className="card fade-in">{f.label} · {f.carrier ?? ""} · {f.price ?? ""}</div>)}</section>
      <section><h3>Hotels</h3>{folio.hotels.length === 0 ? <p>—</p> :
        folio.hotels.map((h, i) => <div key={i} className="card fade-in">{h.name} · {h.stars ?? ""}★ · {h.price ?? ""}</div>)}</section>
    </aside>
  );
}
