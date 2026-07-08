import { screenplay } from "../lib/screenplay";
import type { FolioData } from "../../../shared/events";
import type { ReelFolioSession } from "../lib/recording";
import { days as dublinDays, soldFolio } from "./dublin-run.screenplay";

// "Their trip, their window" (chapter 3). Client POV: the viewer watches the Millers'
// own folio window for the whole chapter — the proposal arrives, they explore it, make
// it theirs, and the advisor's answer lands in the same window. Fresh pre-trip slice;
// does NOT replay ch2's whiskey-walk beat. All prices reuse the ch1/ch2 Dublin fixture
// lineage (soldFolio). Honesty: scripted walk-through framing throughout, and beat 4
// stays capability-true to the shipped folio→advisor flow (M7) — the demo shows a
// scripted rendering of that loop, never claims to be live.

// The proposal as it lands: soldFolio content, pre-trip (no bookings yet).
const proposalFolio: FolioData = { ...soldFolio };

// Day 2 after the advisor's step-free swap (beat 4): the EPIC museum goes out.
const swappedDays = dublinDays.map((d, i) => i === 1
  ? { ...d, activities: [d.activities[0], { name: "National Gallery of Ireland (step-free)" }] }
  : d);
const finalFolio: FolioData = { ...soldFolio, days: swappedDays };

const base: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/dublin",
  folio: proposalFolio,
  flightsPrice: 3180,
  activitiesPrice: 284, // the Wicklow day trip in the proposal: $142 pp × 2
  hotels: [{ id: "serp:h1", name: "The Dean Dublin", price: 168 * 7, meta: "$168/night · Camden St" }],
  pickedHotelId: "serp:h1",
  addons: [
    { id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: false, day: 4 },
    { id: "tour:whiskey", label: "Dublin whiskey tasting walk", price: 95 * 2, on: false, day: 4 },
  ],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: null,
  expandedDay: null,
};

const toggle = (s: ReelFolioSession, id: string, on: boolean): ReelFolioSession =>
  ({ ...s, addons: s.addons.map((a) => (a.id === id ? { ...a, on } : a)) });

// Beat 1 — arrives.
const fvArrive: ReelFolioSession = { ...base, focus: "folio-hero" };
// Beat 2 — explore: section cuts (smooth scroll between anchors).
const fvDays: ReelFolioSession = { ...base, focus: "folio-days" };
const fvDay5: ReelFolioSession = { ...base, focus: "folio-day-5", expandedDay: 5 };
const fvIncludes: ReelFolioSession = { ...base, focus: "folio-includes", expandedDay: 5 };
// Beat 3 — make it theirs.
const fvKilmainham = { ...toggle(fvIncludes, "tour:kilmainham", true), focus: "folio-total" };
const fvWhiskeyOn = toggle(fvKilmainham, "tour:whiskey", true);
const fvWhiskeyOff = toggle(fvWhiskeyOn, "tour:whiskey", false);
const julieNote = { anchor: "folio-day-2", author: "client" as const, text: "Mark's ankle — can we keep this day light on walking?" };
const fvNote: ReelFolioSession = { ...fvWhiskeyOff, notes: [julieNote], focus: "folio-note" };
// Beat 4 — the 2-way moment.
const advisorReply = { anchor: "folio-day-2", author: "advisor" as const, text: "Swapped the EPIC museum for the National Gallery. Step-free, and it keeps the afternoon slow." };
const fvUpdating: ReelFolioSession = { ...fvNote, advisorUpdating: true, focus: "folio-day-2" };
const fvSwapped: ReelFolioSession = { ...fvUpdating, advisorUpdating: false, folio: finalFolio, notes: [julieNote, advisorReply] };
const fvFinal: ReelFolioSession = { ...fvSwapped, status: "final", focus: "folio-status" };

export const dublinClient = screenplay({ trip: "Dublin · their window", skin: "claude" }, (s) => {
  // Beat 1: the proposal arrives. One advisor framing line, then their window.
  s.advisor.says("The Dublin plan is ready. Sending the Millers their folio — a link, not a PDF.");
  s.advisor.sendsToClient({ subject: "Your week in Dublin — have a look" });
  s.client.folioView(fvArrive);                                          // folioview #1
  s.spotlight({ interactionKind: "folioview", nth: 1 }, {
    target: "folio-hero", eyebrow: "The proposal arrives",
    title: "A living page, not an attachment",
    body: "This is what lands in your client's inbox. The whole trip — flights, hotel, every day — on one page that stays current.",
  });

  // Beat 2: they explore.
  s.client.folioView(fvDays);                                            // folioview #2
  s.client.folioView(fvDay5);                                            // folioview #3
  s.spotlight({ interactionKind: "folioview", nth: 3 }, {
    target: "folio-day-5", eyebrow: "They explore",
    title: "Every day, already curated",
    body: "Six days the advisor shaped, with priced extras waiting on the day cards. One recommended plan packed with options to consider — not a week of back-and-forth emails.",
  });
  s.client.folioView(fvIncludes);                                        // folioview #4

  // Beat 3: they make it theirs.
  s.client.folioView(fvKilmainham);                                      // folioview #5
  s.spotlight({ interactionKind: "folioview", nth: 5 }, {
    target: "folio-total", eyebrow: "They make it theirs",
    title: "The folio makes the upsell",
    body: "Julie adds the Kilmainham tour and watches the total move. No quote to ask for, no upsell call to make — the advisor pre-loaded the options and the price answers instantly.",
  });
  s.client.folioView(fvWhiskeyOn);                                       // folioview #6
  s.client.folioView(fvWhiskeyOff);                                      // folioview #7
  s.client.folioView(fvNote);                                            // folioview #8
  s.spotlight({ interactionKind: "folioview", nth: 8 }, {
    target: "folio-note", eyebrow: "Their question, in place",
    title: "Notes live on the trip, not in a thread",
    body: "Julie's question sits on day 2 itself. The advisor sees it in context — no reply-all chain to untangle.",
  });

  // Beat 4: the 2-way moment.
  s.client.folioView(fvUpdating);                                        // folioview #9
  s.spotlight({ interactionKind: "folioview", nth: 9 }, {
    target: "folio-day-2", eyebrow: "The 2-way moment",
    title: "The advisor's answer lands in the same window",
    body: "Day 2 is reworked while the Millers watch. Voygent ships this loop — the folio tells the advisor what changed; this replay is a scripted rendering of it.",
  });
  s.client.folioView(fvSwapped);                                         // folioview #10
  s.client.folioView(fvFinal);                                           // folioview #11
  s.spotlight({ interactionKind: "folioview", nth: 11 }, {
    target: "folio-status", eyebrow: "Ready to book",
    title: "The trip comes back ready to book",
    body: "Step-free day 2, the tour they added, their note answered. The folio settles to Final — the advisor gets a booking, not a back-and-forth.",
  });
});
