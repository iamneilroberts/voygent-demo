import { screenplay } from "../lib/screenplay";
import type { ReelFolioSession, ReelEmailView } from "../lib/recording";
import { sentFolio, shortlistOptions } from "./dublin-collab.screenplay";

// Chapter 2 · "The client's view" (QA4 restructure, 2026-07-09). ALL client, no advisor
// surfaces: the advisor's send from chapter 1 lands in the Millers' inbox, they open
// the link, and the whole chapter lives in THEIR folio window — the advisor's note on
// top, the week to explore, the hotel choice repricing the trip live, a tour page one
// click deep, optional extras, and finally their note going back with one click.
// Chapter 3 picks that reply up at the advisor's desk.
//
// AUTHORED fixture; intro and end card carry the scripted framing. Prices reuse the
// ch1 lineage: flights $3,180, shortlist per-night × 7, activities $740 (incl. the
// Cliffs day trip the advisor sold in ch1).

// The email that lands with the Millers (the ch1 send, seen from their side).
const inviteEmail: ReelEmailView = {
  sceneLabel: "The Millers' inbox",
  from: "Sarah Whelan (your travel advisor)",
  subject: "Your Dublin trip is ready to look over",
  body: `Hi Mark, hi Julie,

Your week in Dublin is ready to look at. Everything is on one live page,
including three hotels I picked for you to choose between.

    View your trip:  voygent.app/t/dublin

Pick your hotel and tell me what you think. No rush.

Sarah`,
};

const ADVISOR_NOTE = "Pick your hotel and tell me what you think. The extras on the day cards are optional. No rush.";

const base: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/dublin",
  folio: sentFolio,
  flightsPrice: 3180,
  activitiesPrice: 740, // itinerary incl. the Cliffs day trip ($142 pp × 2) from ch1
  hotels: shortlistOptions,
  pickedHotelId: null,
  addons: [
    {
      id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: false, day: 4,
      detail: {
        blurb: "A small-group guided walk through Kilmainham Gaol — the prison at the centre of Ireland's road to independence — then the museum galleries at your own pace. Moving, unhurried, and one of Dublin's most-booked afternoons.",
        bullets: ["Day 4 · 2h 30m · small group", "Museum entry included", "Step-free route available", "Popular — sells out most weeks"],
      },
    },
    {
      id: "tour:whiskey", label: "Dublin whiskey tasting walk", price: 95 * 2, on: false, day: 4,
      detail: {
        blurb: "An easy evening stroll between three Dublin tasting rooms with a guide who knows their pours — a relaxed way to close out a day.",
        bullets: ["Day 4 evening · 3h", "Three tastings included", "Small group"],
      },
    },
    { id: "transfers", label: "Private airport transfers", price: 120, on: false },
    { id: "insurance", label: "Travel insurance (2 travellers)", price: 210, on: false },
  ],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: null,
  expandedDay: null,
  advisorNote: ADVISOR_NOTE,
  feedbackSent: false,
};

const toggle = (s: ReelFolioSession, id: string, on: boolean): ReelFolioSession =>
  ({ ...s, addons: s.addons.map((a) => (a.id === id ? { ...a, on } : a)) });
const pick = (s: ReelFolioSession, id: string | null): ReelFolioSession => ({ ...s, pickedHotelId: id });

// Beat 1 — it arrives (inbox → the page, advisor note on top).
const fvArrive: ReelFolioSession = { ...base, focus: "folio-hero" };
// Beat 2 — explore: section cuts through the week and the extras.
const fvDays: ReelFolioSession = { ...base, focus: "folio-days" };
const fvDay3: ReelFolioSession = { ...base, focus: "folio-day-3", expandedDay: 3 };
const fvIncludes: ReelFolioSession = { ...base, focus: "folio-includes", expandedDay: null };
// Beat 3 — the hotel choice reprices the trip live (flip, flip back).
const fvDean: ReelFolioSession = { ...pick(base, "serp:h1"), focus: "folio-hotel-choice" };
const fvBeckett: ReelFolioSession = pick(fvDean, "serp:h2");
const fvDean2: ReelFolioSession = pick(fvBeckett, "serp:h1");
// Beat 4 — the tour drill-down (N5): Julie opens the gaol tour's own page, reads it,
// adds it from the page; back on the folio the total has moved.
const fvTourPage: ReelFolioSession = { ...fvDean2, url: "voygent.app/t/dublin/tours/kilmainham-gaol", openDetailId: "tour:kilmainham", focus: "tour-detail" };
const fvTourCta: ReelFolioSession = { ...fvTourPage, focus: "tour-detail-cta" };
const fvKilmainham: ReelFolioSession = { ...toggle({ ...fvDean2, url: "voygent.app/t/dublin" }, "tour:kilmainham", true), focus: "folio-total" };
// Beat 5 — they play with the extras (on, off — the total follows).
const fvWhiskeyOn: ReelFolioSession = toggle(fvKilmainham, "tour:whiskey", true);
const fvWhiskeyOff: ReelFolioSession = toggle(fvWhiskeyOn, "tour:whiskey", false);
const fvTransfers: ReelFolioSession = toggle(fvWhiskeyOff, "transfers", true);
// Beat 6 — their note, on the last evening itself.
const lisbonNote = { anchor: "folio-day-6", author: "client" as const, text: "Could we add a food tour our last evening? We loved the one in Lisbon." };
const fvNote: ReelFolioSession = { ...fvTransfers, notes: [lisbonNote], focus: "folio-day-6", expandedDay: 6 };
// Beat 7 — send it back.
const fvSent: ReelFolioSession = { ...fvNote, feedbackSent: true };

export const dublinClient = screenplay({ trip: "Dublin · client", skin: "claude" }, (s) => {
  // Beat 1: the email lands, they open the link, the advisor's note sits on top.
  s.client.email(inviteEmail);
  s.spotlight({ interactionKind: "emailview", nth: 1 }, {
    target: "email-window", eyebrow: "Demo 2 · the client's side",
    title: "It starts in their inbox",
    body: "This is the send from demo 1, landing with the Millers. The link opens their trip as a live page in their own browser. No app, no login, no PDF attachment.",
    variant: "hero", dwellMs: 6000,
  });
  s.client.email(null);
  s.client.folioView(fvArrive);
  s.spotlight({ interactionKind: "folioview", nth: 1 }, {
    target: "folio-advisor-note", eyebrow: "The proposal arrives",
    title: "Their advisor's note is pinned on top",
    body: "The Millers open to the whole trip on one page, with the advisor's own words first: pick your hotel, the extras are optional, no rush.",
  });

  // Beat 2: they explore the week.
  s.client.folioView(fvDays, { holdMs: 2000 });
  s.client.folioView(fvDay3, { holdMs: 2600 });
  s.spotlight({ interactionKind: "folioview", nth: 3 }, {
    target: "folio-day-3", eyebrow: "They explore",
    title: "Every day, already curated",
    body: "Six days the advisor shaped, with priced extras waiting on the day cards. One recommended plan packed with options to consider, not a week of back-and-forth emails.",
  });
  s.client.folioView(fvIncludes, { holdMs: 2000 });

  // Beat 3: the hotel choice. Click an option, the whole trip reprices, instantly.
  s.client.folioView(fvDean);
  s.spotlight({ interactionKind: "folioview", nth: 5 }, {
    target: "folio-hotel-choice", eyebrow: "Click around, the price follows",
    title: "Every option reprices the trip instantly",
    body: "Julie taps The Dean and the total updates. Beckett Locke? It drops. Back to The Dean? It's back. Everything on this page works that way: click it and the price answers. You can try it yourself when this demo ends.",
    dwellMs: 5200,
  });
  s.client.folioView(fvBeckett, { holdMs: 2200 });
  s.client.folioView(fvDean2, { holdMs: 2200 });

  // Beat 4: the tour page, one click deep.
  s.client.folioView(fvTourPage);
  s.spotlight({ interactionKind: "folioview", nth: 8 }, {
    target: "tour-detail", eyebrow: "They make it theirs",
    title: "The link answers their questions",
    body: "Does the gaol tour fit day 4? Is it worth it? Julie taps the tour and reads for herself. No “can you send more info?” email, no waiting on a reply.",
  });
  s.client.folioView(fvTourCta, { holdMs: 2200 });
  s.client.folioView(fvKilmainham);
  s.spotlight({ interactionKind: "folioview", nth: 10 }, {
    target: "folio-total", eyebrow: "The folio makes the upsell",
    title: "They add it, the total moves",
    body: "Julie adds the Kilmainham tour and watches the total move. No quote to ask for, no upsell call to make. The advisor pre-loaded the options and the price answers instantly.",
  });

  // Beat 5: they keep playing — on, off, on. The page keeps up.
  s.client.folioView(fvWhiskeyOn, { holdMs: 2000 });
  s.client.folioView(fvWhiskeyOff, { holdMs: 2000 });
  s.client.folioView(fvTransfers, { holdMs: 2200 });

  // Beat 6: their question, on the day itself.
  s.client.folioView(fvNote);
  s.spotlight({ interactionKind: "folioview", nth: 14 }, {
    target: "folio-note", eyebrow: "Their question, in place",
    title: "Notes live on the trip, not in a thread",
    body: "Julie asks for a food tour on the last evening, right on the day card. The advisor will see it in context. No reply-all chain to untangle.",
  });

  // Beat 7: one click sends the picks and the note back to the advisor.
  s.client.folioView(fvSent);
  s.spotlight({ interactionKind: "folioview", nth: 15 }, {
    target: "folio-sendback", eyebrow: "Back to the advisor",
    title: "One click and it's in the advisor's thread",
    body: "Their hotel pick, the tour, the transfers and the note land back with the advisor instantly. What the advisor does with it is demo 3.",
    dwellMs: 5200,
  });
  s.client.folioView(null);
});
