import { useEffect, useRef, useState } from "react";
import type { ReelFolioSession } from "./lib/recording";
import type { NextChapterCta } from "./ReelEndCard";
import { computeTripTotal, usd } from "./lib/reel-pricing";

// Full-screen client folio window (ch3): the production-faithful folio the Millers see,
// rendered from a ReelFolioSession snapshot. Mode-aware (spec Decision 4): "scripted"
// renders snapshots verbatim with input disabled (the screenplay drives it);
// "interactive" seeds local state from the snapshot so the viewer can toggle add-ons
// and expand days (the chapter end-state). Visual contract:
// docs/reference/2026-07-08-alaska-warm-folio-staging.png — client-facing surface, so
// commission fields on the fixture are NEVER rendered here.
export function ReelFolioView({ view, mode, cta }: {
  view: ReelFolioSession;
  mode: "scripted" | "interactive";
  cta?: { nextChapter?: NextChapterCta; onTryYourself: () => void; onReplay: () => void };
}) {
  const interactive = mode === "interactive";
  const [localAddons, setLocalAddons] = useState(view.addons);
  const [localDay, setLocalDay] = useState<number | null>(view.expandedDay);
  const addons = interactive ? localAddons : view.addons;
  const expandedDay = interactive ? localDay : view.expandedDay;
  const total = computeTripTotal({ ...view, addons });
  const rootRef = useRef<HTMLDivElement>(null);

  // Scripted section cuts: bring the focused anchor into view (smooth unless reduced).
  useEffect(() => {
    if (!view.focus || !rootRef.current) return;
    const el = rootRef.current.querySelector<HTMLElement>(`[data-reel-target="${view.focus}"]`);
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [view.focus]);

  const days = view.folio.days ?? [];
  return (
    <div className="cl-fv-scrim" role="dialog" aria-modal="true" aria-label="The client's folio window">
      <div className="cl-fv-window">
        <div className="cl-fv-bar" aria-hidden="true"><span className="cl-fv-dots">● ● ●</span><span className="cl-fv-url">{view.url}</span></div>
        <div className="cl-fv-scroll" ref={rootRef}>
          <header className="cl-fv-hero" data-reel-target="folio-hero">
            <span className={`cl-fv-status ${view.status}`} data-reel-target="folio-status">{view.status === "final" ? "✓ Final" : "Draft"}</span>
            <h2 className="cl-fv-title">{view.folio.title}</h2>
            <p className="cl-fv-sub">Prepared for Mark &amp; Julie Miller · Oct 4–11</p>
          </header>

          {view.folio.flights.map((f) => (
            <div key={f.label} className="cl-fv-line"><span>✈ {f.label}{f.date ? ` · ${f.date}` : ""}</span><b>{f.price}</b></div>
          ))}
          {view.folio.hotels.map((h) => (
            <div key={h.name} className="cl-fv-line"><span>🏨 {h.name}{h.area ? ` · ${h.area}` : ""}{h.nights ? ` · ${h.nights} nights` : ""}</span><b>{h.perNight}/night</b></div>
          ))}

          <section className="cl-fv-days" data-reel-target="folio-days">
            {days.map((d, i) => {
              const n = i + 1;
              const openDay = expandedDay === n;
              const dayAddons = addons.filter((a) => a.day === n);
              const dayNotes = view.notes.filter((nt) => nt.anchor === `folio-day-${n}`);
              return (
                <article key={d.title} className={`cl-fv-day ${openDay ? "open" : ""}`} data-reel-target={`folio-day-${n}`}
                  onClick={interactive ? () => setLocalDay(openDay ? null : n) : undefined}>
                  <div className="cl-fv-day-h"><span className="cl-fv-day-num" aria-hidden="true">{n}</span><span className="cl-fv-day-title">{d.title}</span><span className="cl-fv-day-date">{d.date}</span></div>
                  {openDay && (
                    <div className="cl-fv-day-body">
                      {d.activities.map((a) => <div key={a.name} className="cl-fv-act">{a.name}</div>)}
                      {d.dining.map((x) => <div key={x.name} className="cl-fv-dine">🍽 {x.name}{x.cuisine ? ` · ${x.cuisine}` : ""}</div>)}
                    </div>
                  )}
                  {dayAddons.length > 0 && (
                    <div className="cl-fv-addons">
                      {dayAddons.map((a) => (
                        <button key={a.id} type="button" className={`cl-fv-addon ${a.on ? "on" : ""}`} disabled={!interactive} aria-pressed={a.on}
                          onClick={interactive ? (e) => { e.stopPropagation(); setLocalAddons((xs) => xs.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x))); } : undefined}>
                          <span className="cl-fv-check" aria-hidden="true">{a.on ? "☑" : "☐"}</span>
                          <span className="cl-fv-addon-label">{a.label}<i>recommended · add it if it fits</i></span>
                          <span className="cl-fv-addon-price">+{usd(a.price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {dayNotes.length > 0 && (
                    <div className="cl-fv-notes" data-reel-target="folio-note">
                      {dayNotes.map((nt, k) => (
                        <p key={k} className={`cl-fv-note ${nt.author}`}><b>{nt.author === "client" ? "Julie" : "Your advisor"}</b> {nt.text}</p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          {(view.folio.includes ?? []).length > 0 && (
            <section className="cl-fv-includes" data-reel-target="folio-includes">
              <h3 className="cl-fv-includes-h">Good to know</h3>
              {view.folio.includes!.map((inc) => (
                <details key={inc.key} open={view.focus === "folio-includes"}>
                  <summary>{inc.title}</summary><p>{inc.body}</p>
                </details>
              ))}
            </section>
          )}
        </div>

        {view.advisorUpdating && <div className="cl-fv-updating" role="status"><span className="cl-fv-pulse" aria-hidden="true" />Advisor is updating…</div>}
        <div className="cl-fv-total" data-reel-target="folio-total"><span>Trip total · two travellers</span><b key={total}>{usd(total)}</b></div>
        {cta && (
          <div className="cl-fv-cta">
            {cta.nextChapter && <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={cta.nextChapter.onClick}>{cta.nextChapter.label}</button>}
            <button type="button" className={`cl-reel-btn ${cta.nextChapter ? "cl-reel-btn-secondary" : "cl-reel-btn-primary"}`} onClick={cta.onTryYourself}>Build your own trip →</button>
            <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={cta.onReplay}>↺ Replay the chapter</button>
          </div>
        )}
      </div>
    </div>
  );
}
