import { useEffect, useRef, useState } from "react";
import type { ReelAddon, ReelFolioSession } from "./lib/recording";
import type { NextChapterCta } from "./ReelEndCard";
import { computeTripTotal, usd } from "./lib/reel-pricing";
import { SIGNUP_URL } from "./lib/reel-render";

// Full-screen client folio window: the production-faithful folio the trip's clients see,
// rendered from a ReelFolioSession snapshot. Mode-aware (spec Decision 4): "scripted"
// renders snapshots verbatim with input disabled (the screenplay drives it);
// "interactive" seeds local state from the snapshot so the viewer can toggle add-ons,
// pick the hotel, and expand days (chapter end-states, ReelExplore's replacement —
// spec Decision 6). Visual contract:
// docs/reference/2026-07-08-alaska-warm-folio-staging.png — client-facing surface, so
// commission fields on the fixture are NEVER rendered here.
export function ReelFolioView({ view, mode, cta, signupUrl }: {
  view: ReelFolioSession;
  mode: "scripted" | "interactive";
  cta?: { nextChapter?: NextChapterCta; onTryYourself: () => void; onReplay: () => void; sendFunnel?: boolean };
  // Signup destination for the ctaLine anchor; DIY reels pass the traveller landing page.
  signupUrl?: string;
}) {
  const interactive = mode === "interactive";
  // N13: when a next chapter exists, the ended surface auto-advances after a visible
  // countdown. Any interaction with the folio window cancels it — the viewer chose to
  // explore, so the demo must not yank them forward.
  const AUTO_ADVANCE_S = 12;
  const [autoLeft, setAutoLeft] = useState<number | null>(
    mode === "interactive" && cta?.nextChapter ? AUTO_ADVANCE_S : null,
  );
  const nextChapterClick = cta?.nextChapter?.onClick;
  useEffect(() => {
    if (autoLeft == null || !nextChapterClick) return;
    if (autoLeft <= 0) { nextChapterClick(); return; }
    const t = setTimeout(() => setAutoLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [autoLeft, nextChapterClick]);
  const cancelAuto = () => setAutoLeft(null);
  const [localAddons, setLocalAddons] = useState(view.addons);
  const [localDay, setLocalDay] = useState<number | null>(view.expandedDay);
  // N5 drill-down: which addon's tour page is open. Scripted mode reads the snapshot;
  // interactive mode drives it from the row's "tour details" link.
  const [localDetail, setLocalDetail] = useState<string | null>(null);
  // Interactive seeding falls back to the first hotel (as ReelExplore did) so an
  // unpicked session never renders an empty selection with the hotel cost silently $0.
  const [localPicked, setLocalPicked] = useState<string | null>(view.pickedHotelId ?? view.hotels[0]?.id ?? null);
  const [sent, setSent] = useState(false);
  const addons = interactive ? localAddons : view.addons;
  const expandedDay = interactive ? localDay : view.expandedDay;
  const pickedHotelId = interactive ? localPicked : view.pickedHotelId;
  const openDetailId = interactive ? localDetail : (view.openDetailId ?? null);
  const openDetail = addons.find((a) => a.id === openDetailId && a.detail);
  const total = computeTripTotal({ flightsPrice: view.flightsPrice, activitiesPrice: view.activitiesPrice, hotels: view.hotels, pickedHotelId, addons, components: view.components });
  const rootRef = useRef<HTMLDivElement>(null);

  // Scripted section cuts: bring the focused anchor into view (smooth unless reduced).
  useEffect(() => {
    if (!view.focus || !rootRef.current) return;
    const el = rootRef.current.querySelector<HTMLElement>(`[data-reel-target="${view.focus}"]`);
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [view.focus]);

  // Interactive drill-down: opening/closing a tour page starts reading from its top.
  useEffect(() => {
    if (interactive && rootRef.current) rootRef.current.scrollTop = 0;
  }, [interactive, localDetail]);

  // The day-card hint is scheduling copy ("does it fit this day?"); undated extras
  // (transfers, insurance) get no hint — it would mislabel them.
  const renderAddon = (a: ReelAddon, hint?: string) => (
    <div key={a.id} className="cl-fv-addon-row">
      <button type="button" className={`cl-fv-addon ${a.on ? "on" : ""}`} disabled={!interactive} aria-pressed={a.on}
        onClick={interactive ? () => setLocalAddons((xs) => xs.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x))) : undefined}>
        <span className="cl-fv-check" aria-hidden="true">{a.on ? "☑" : "☐"}</span>
        <span className="cl-fv-addon-label">{a.label}{hint && <i>{hint}</i>}</span>
        <span className="cl-fv-addon-price">+{usd(a.price)}</span>
        {a.on && <span className="cl-fv-book" aria-hidden="true">Book ↗</span>}
      </button>
      {a.detail && (
        <button type="button" className="cl-fv-addon-more" disabled={!interactive}
          onClick={interactive ? () => setLocalDetail(a.id) : undefined}>
          tour details →
        </button>
      )}
    </div>
  );

  const days = view.folio.days ?? [];
  const looseAddons = addons.filter((a) => a.day == null);
  return (
    <div className="cl-fv-scrim cl-scene-client" role="dialog" aria-modal="true" aria-label="The client's folio window">
      {/* N18: scene shift — the blurred inbox backdrop + label make it unmistakable that
          we've left the advisor's chat and are looking over the clients' shoulder. */}
      <div className="cl-scene-label"><span aria-hidden="true">📥</span> {view.sceneLabel ?? "The clients' view — the Millers' window"}</div>
      <div className="cl-fv-window" onPointerDownCapture={interactive ? cancelAuto : undefined}>
        <div className="cl-fv-bar" aria-hidden="true"><span className="cl-fv-dots">● ● ●</span><span className="cl-fv-url">{view.url}</span></div>
        {view.advisorNote && (
          <div className="cl-fv-advisor-note" data-reel-target="folio-advisor-note">
            <span className="cl-fv-advisor-note-who" aria-hidden="true">A</span>
            <span><b>From your advisor</b> {view.advisorNote}</span>
          </div>
        )}
        <div className="cl-fv-scroll" ref={rootRef}>
          {openDetail ? (
            // N5: the tour page — what the client's "tour details" link opens. Replaces
            // the folio body (a page navigation); the trip-total bar below stays put so
            // the price moment reads when the tour is added. Fixture copy only.
            <div className="cl-fv-tour" data-reel-target="tour-detail">
              <button type="button" className="cl-fv-tour-back" disabled={!interactive}
                onClick={interactive ? () => setLocalDetail(null) : undefined}>← Back to your trip</button>
              <h3 className="cl-fv-tour-title">{openDetail.label}</h3>
              <p className="cl-fv-tour-price">{usd(openDetail.price / 2)} per person · {usd(openDetail.price)} for two</p>
              <p className="cl-fv-tour-blurb">{openDetail.detail!.blurb}</p>
              <ul className="cl-fv-tour-bullets">
                {openDetail.detail!.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
              <button type="button" className={`cl-fv-tour-add ${openDetail.on ? "on" : ""}`} data-reel-target="tour-detail-cta"
                disabled={!interactive} aria-pressed={openDetail.on}
                onClick={interactive ? () => {
                  setLocalAddons((xs) => xs.map((x) => (x.id === openDetail.id ? { ...x, on: true } : x)));
                  setLocalDetail(null);
                } : undefined}>
                {openDetail.on ? "✓ Added to your trip" : `Add to trip · +${usd(openDetail.price)}`}
              </button>
            </div>
          ) : (<>
          <header className="cl-fv-hero" data-reel-target="folio-hero">
            <span className={`cl-fv-status ${view.status}`} data-reel-target="folio-status">{view.status === "final" ? "✓ Final" : "Draft"}</span>
            <h2 className="cl-fv-title">{view.folio.title}</h2>
            <p className="cl-fv-sub">{view.audienceLine ?? "Prepared for Mark & Julie Miller · Oct 4–11"}</p>
          </header>

          {view.folio.flights.map((f) => (
            <div key={f.label} className="cl-fv-line"><span>✈ {f.label}{f.date ? ` · ${f.date}` : ""}</span><b>{f.price}</b></div>
          ))}
          {view.hotels.length > 1 ? (
            <section className="cl-fv-hotels" data-reel-target="folio-hotel-choice">
              <h3 className="cl-fv-sec-h">Choose your hotel</h3>
              {view.hotels.map((h) => {
                const on = h.id === pickedHotelId;
                return (
                  <button key={h.id} type="button" className={`cl-fv-hotel ${on ? "on" : ""}`} disabled={!interactive} aria-pressed={on}
                    onClick={interactive ? () => setLocalPicked(h.id) : undefined}>
                    <span className="cl-fv-radio" aria-hidden="true">{on ? "●" : "○"}</span>
                    <span className="cl-fv-addon-label">{h.name}{h.meta && <i>{h.meta}</i>}</span>
                    <span className="cl-fv-addon-price">{usd(h.price)}</span>
                  </button>
                );
              })}
            </section>
          ) : (
            view.folio.hotels.map((h) => (
              <div key={h.name} className="cl-fv-line"><span>🏨 {h.name}{h.area ? ` · ${h.area}` : ""}{h.nights ? ` · ${h.nights} nights` : ""}</span><b>{h.perNight}/night</b></div>
            ))
          )}

          {(view.components ?? []).length > 0 && (
            <section className="cl-fv-components" data-reel-target="folio-components">
              <h3 className="cl-fv-sec-h">In this trip</h3>
              {view.components!.map((c) => (
                <div key={c.id} className="cl-fv-component">
                  <span>{c.label}</span><b>{usd(c.price)}</b>
                  <span className="cl-fv-book" aria-hidden="true">Book ↗</span>
                </div>
              ))}
            </section>
          )}

          <section className="cl-fv-days" data-reel-target="folio-days">
            {days.map((d, i) => {
              const n = i + 1;
              const openDay = expandedDay === n;
              const dayAddons = addons.filter((a) => a.day === n);
              const dayNotes = view.notes.filter((nt) => nt.anchor === `folio-day-${n}`);
              return (
                <article key={d.title} className={`cl-fv-day ${openDay ? "open" : ""}`} data-reel-target={`folio-day-${n}`}>
                  {/* Toggle lives on the header only — clicks on the day body / notes must not collapse the card. */}
                  <div className="cl-fv-day-h" onClick={interactive ? () => setLocalDay(openDay ? null : n) : undefined}><span className="cl-fv-day-num" aria-hidden="true">{n}</span><span className="cl-fv-day-title">{d.title}</span><span className="cl-fv-day-date">{d.date}</span></div>
                  {openDay && (
                    <div className="cl-fv-day-body">
                      {d.activities.map((a) => <div key={a.name} className="cl-fv-act">{a.name}</div>)}
                      {d.dining.map((x) => <div key={x.name} className="cl-fv-dine">🍽 {x.name}{x.cuisine ? ` · ${x.cuisine}` : ""}</div>)}
                    </div>
                  )}
                  {dayAddons.length > 0 && <div className="cl-fv-addons">{dayAddons.map((a) => renderAddon(a, "recommended · add it if it fits"))}</div>}
                  {dayNotes.length > 0 && (
                    <div className="cl-fv-notes" data-reel-target="folio-note">
                      {dayNotes.map((nt, k) => (
                        <p key={k} className={`cl-fv-note ${nt.author}`}><b>{nt.authorLabel ?? (nt.author === "client" ? "Julie" : "Your advisor")}</b> {nt.text}</p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          {looseAddons.length > 0 && (
            <section className="cl-fv-extras" data-reel-target="folio-addons">
              <h3 className="cl-fv-sec-h">Optional extras</h3>
              <div className="cl-fv-addons">{looseAddons.map((a) => renderAddon(a))}</div>
            </section>
          )}

          {(view.folio.includes ?? []).length > 0 && (
            <section className="cl-fv-includes" data-reel-target="folio-includes">
              <h3 className="cl-fv-sec-h">Good to know</h3>
              {view.folio.includes!.map((inc) => (
                <details key={inc.key} open={view.focus === "folio-includes"}>
                  <summary>{inc.title}</summary><p>{inc.body}</p>
                </details>
              ))}
            </section>
          )}

          {view.ctaLine && (
            <a className="cl-fv-cta" href={signupUrl ?? SIGNUP_URL} target="_blank" rel="noopener noreferrer">{view.ctaLine} →</a>
          )}
          </>)}
        </div>

        {view.advisorUpdating && <div className="cl-fv-updating" role="status"><span className="cl-fv-pulse" aria-hidden="true" />Advisor is updating…</div>}
        <div className="cl-fv-total" data-reel-target="folio-total"><span>{view.totalLabel ?? "Trip total · two travellers"}</span><b key={total}>{usd(total)}</b></div>
        {/* QA4 ch2 closing beat: the scripted Send — button flips to sent + a
            confirmation line, so the "back to the advisor" moment is visible. */}
        {!interactive && view.feedbackSent != null && (
          <div className="cl-fv-cta" data-reel-target="folio-sendback">
            <button type="button" className={`cl-reel-btn cl-reel-btn-primary${view.feedbackSent ? " cl-fv-sent" : ""}`} aria-disabled="true">
              {view.feedbackSent ? "✓ Sent to your advisor" : "Send to your advisor →"}
            </button>
            {view.feedbackSent && <p className="cl-fv-sent-note">Their picks and their note land back in the advisor&#39;s thread instantly.</p>}
          </div>
        )}
        {/* N13: only the DIEGETIC action stays inside the folio window — everything
            about driving the demo lives in the margin rail below, so the folio reads
            as the client's page, not a menu of demo buttons. */}
        {cta?.sendFunnel && (
          <div className="cl-fv-cta">
            <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={() => setSent(true)}>{view.helperLine ?? "Send to your advisor →"}</button>
          </div>
        )}
      </div>

      {cta && (
        <aside className="cl-reel-nextrail" aria-label="Demo controls">
          <p className="cl-fv-disclosure">Scripted demo trip — the live demo pulls real flights and hotels.</p>
          {cta.nextChapter && (
            <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={cta.nextChapter.onClick}>
              {cta.nextChapter.label}
              {autoLeft != null && <span className="cl-reel-btn-meta">auto in {autoLeft}s</span>}
            </button>
          )}
          {autoLeft != null && (
            <button type="button" className="cl-reel-stay" onClick={cancelAuto}>Stay and explore this page</button>
          )}
          <div className="cl-reel-nextrail-links">
            <button type="button" onClick={cta.onTryYourself}>Build your own trip →</button>
            <button type="button" onClick={cta.onReplay}>↺ Replay the chapter</button>
          </div>
        </aside>
      )}

      {sent && (
        <div className="cl-fv-dialog-scrim" role="dialog" aria-modal="true" aria-label="Open the live demo">
          <div className="cl-fv-dialog">
            <div className="cl-fv-dialog-eyebrow">This one&#39;s a guided demo</div>
            <h4 className="cl-fv-dialog-h">Build a real one in the live demo</h4>
            <p className="cl-fv-dialog-p">You just priced a scripted trip. To plan a real one with live flights, hotels and your own travellers, open the interactive demo and drive it yourself.</p>
            <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={cta?.onTryYourself}>Open the interactive demo →</button>
            <button type="button" className="cl-fv-keep" onClick={() => setSent(false)}>Keep exploring</button>
          </div>
        </div>
      )}
    </div>
  );
}
