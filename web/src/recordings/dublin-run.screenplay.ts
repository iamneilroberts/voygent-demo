import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioBooking } from "../../../shared/events";
import type { ReelClientSession, ReelFolioSession } from "../lib/recording";

// "Dublin, run the trip" (chapter 2). The trip from chapter 1 is sold; this reel is the
// week after: a confirmation email gets pasted and filed, Voygent flags two open days and
// sells a tour into them, the travellers make a change in their own window, and the
// advisor confirms it with one click. AUTHORED fixture; intro and end card say so.

// The folio as chapter 1 left it (re-declared locally; values match dublin-collab's
// finalFolio: title, the Aer Lingus flight, The Dean hotel, six days incl. Cliffs of
// Moher on day 3 and the Temple Bar food tour on day 5, and the four kept includes).
export const days = [
  { title: "Day 1 · Arrive in Dublin", date: "Sat Oct 4", activities: [{ name: "Evening stroll along the Liffey" }], dining: [{ name: "The Woollen Mills", cuisine: "Irish" }] },
  { title: "Day 2 · History in the old city", date: "Sun Oct 5", activities: [{ name: "Trinity College & the Book of Kells" }, { name: "EPIC: the Irish emigration museum" }], dining: [{ name: "Fade Street Social", cuisine: "Modern Irish" }] },
  { title: "Day 3 · Open day", date: "Mon Oct 6", activities: [{ name: "Cliffs of Moher day trip" }], dining: [{ name: "Klaw", cuisine: "Seafood" }] },
  { title: "Day 4 · The coast, gently", date: "Tue Oct 7", activities: [{ name: "Howth village & harbour stroll" }], dining: [{ name: "Octopussys Seafood Tapas", cuisine: "Seafood" }] },
  { title: "Day 5 · Temple Bar evening", date: "Wed Oct 8", activities: [{ name: "Chester Beatty Library (step-free)" }, { name: "Temple Bar food tour" }], dining: [{ name: "The Boxty House", cuisine: "Irish" }] },
  { title: "Day 6 · Easy last day", date: "Thu Oct 9", activities: [{ name: "National Museum of Ireland" }], dining: [{ name: "Glovers Alley", cuisine: "Modern Irish" }] },
];
export const soldFolio: FolioData = {
  tripId: "dublin",
  title: "A week in Dublin",
  flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180", date: "Oct 4-11", stops: 1 }],
  hotels: [{ name: "The Dean Dublin", area: "Camden St", stars: 4, nights: 7, perNight: "$168", commission: 176, commissionPct: 15 }],
  days,
  includes: [
    { key: "inc:weather", title: "Typical October weather", body: "Highs around 55°F, a few showers most days. Layers and a light rain shell cover it." },
    { key: "inc:transit", title: "Getting around Dublin", body: "The centre is walkable. A Leap Card covers buses and the Luas tram for anything further out." },
    { key: "inc:customs", title: "Local customs & tipping", body: "About 10% in restaurants if service isn't already added; no need to tip at the bar." },
    { key: "inc:apps", title: "Handy apps", body: "Free Now for taxis, Dublin Bus for live times, Revolut if they'd rather not carry cash." },
  ],
};

// Beat 1 fixture: the messy confirmation email (pasted verbatim by the advisor).
const CONF_EMAIL = `FW: Your booking is confirmed - EI 106 04OCT
*** DO NOT REPLY TO THIS EMAIL ***
BOOKING REF: 6XKPTR   TICKET: 053-4471182286
PASSENGER/S: HENDERSON/MARK MR  HENDERSON/JULIE MRS
EI 106 J 04OCT JFKDUB HK2 2055 0835+1 /E
FARE USD 3180.00 TOTAL INC TAXES/FEES
Baggage allowance 1PC per passenger. Check-in opens 24hrs before departure.`;

const filedBooking: FolioBooking = {
  label: "Aer Lingus EI 106 · JFK→DUB",
  conf: "6XKPTR",
  detail: "Oct 4 · 8:55p → 8:35a +1 · Mark & Julie Miller · $3,180 incl. taxes",
  status: "confirmed",
};
const withBooking: FolioData = { ...soldFolio, bookings: [filedBooking] };

// Beat 2 fixture: three commissionable tours for the still-open days (4 and 6).
const tours: BoardCandidate[] = [
  { id: "tour:kilmainham", title: "Kilmainham Gaol & Museum tour", price: "$58 pp", badge: "Sells out",
    meta: "Day 4 · 2h 30m · small group", summary: "Kilmainham Gaol $58", commission: 17, commissionPct: 15 },
  { id: "tour:wicklow", title: "Wicklow Mountains & Glendalough day trip", price: "$142 pp", badge: "Best fit",
    meta: "Day 6 · 8h · coach + walk", summary: "Wicklow day trip $142", commission: 43, commissionPct: 15 },
  { id: "tour:whiskey", title: "Dublin whiskey tasting walk", price: "$95 pp",
    meta: "Day 4 evening · 3h", summary: "Whiskey walk $95", commission: 23, commissionPct: 12 },
];
// Day 6 (index 5) gains the Wicklow day trip once the advisor picks it.
const withTour: FolioData = {
  ...withBooking,
  days: withBooking.days!.map((d, i) => i === 5 ? { ...d, activities: [...d.activities, { name: "Wicklow Mountains & Glendalough day trip" }] } : d),
};

// Beat 4 fixture: the final folio. The travellers move the whiskey walk to the evening
// they land back from Wicklow, so it joins the Wicklow trip on day 6 (index 5).
const finalFolio: FolioData = {
  ...withTour,
  days: withTour.days!.map((d, i) => i === 5 ? { ...d, activities: [...d.activities, { name: "Dublin whiskey tasting walk" }] } : d),
  // N12: itemized advisor breakdown — the tour board's own commission numbers, plus
  // the one tour still on offer as a "worth +$17 if they add it" row.
  commissions: [
    { label: "The Dean Dublin · 7 nights", amount: 176, pct: 15 },
    { label: "Wicklow Mountains day trip", amount: 43, pct: 15 },
    { label: "Dublin whiskey tasting walk", amount: 23, pct: 12 },
    { label: "Kilmainham Gaol & Museum tour", amount: 17, pct: 15, potential: true },
  ],
};

// Beat 3 fixture: the travellers' own window (mirror dublin-collab's client-view
// section). The hotel is already settled from chapter 1, so pickedHotelId is fixed
// throughout; the only thing that moves is the whiskey-walk add-on toggle and the note.
const cvBase: ReelClientSession = {
  open: true,
  url: "voygent.app/t/dublin",
  tripTitle: "A week in Dublin · for two",
  flightsPrice: 3180,
  activitiesPrice: 284, // the Wicklow day trip, already booked: $142 pp × 2
  hotels: [{ id: "serp:h1", name: "The Dean Dublin", price: 168 * 7, meta: "$168/night · Camden St" }],
  pickedHotelId: "serp:h1",
  addons: [
    { id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: false },
    { id: "tour:whiskey", label: "Dublin whiskey tasting walk", price: 95 * 2, on: false },
  ],
  question: null,
  progress: 0.6,
};
const cvAddon: ReelClientSession = { ...cvBase, addons: cvBase.addons.map((a) => a.id === "tour:whiskey" ? { ...a, on: true } : a), progress: 0.85 };
const cvNote: ReelClientSession = { ...cvAddon, question: "Can we do the whiskey walk the same night we land back from Wicklow?", progress: 1 };
const cvClosed: ReelClientSession = { ...cvNote, open: false };

// ── C9 cutaway (spec Decision 7): the Millers' folio page right after the Wicklow pick —
//    day 6 already carries the tour. The two remaining tours are NOT here: beat 3 is
//    where the advisor offers them, so showing them as toggles now would be dishonest.
//    Total = 3180 + Dean 1176 + Wicklow 284 = $4,640 (ch3's opening total, same fixture
//    lineage). Draft status matches the ended surface's convention (folioSessionFromClient).
//    folio-day-6 is ReelFolioView's 1-based anchor; the chat folio's 0-based anchors stop
//    at folio-day-5 for this six-day trip, so the spotlight can't collide (guarded).
const fvDay6: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/dublin",
  folio: withTour,
  flightsPrice: 3180,
  activitiesPrice: 284,
  hotels: cvBase.hotels,
  pickedHotelId: "serp:h1",
  addons: [],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: "folio-day-6",
  expandedDay: 6,
};

export const dublinRun = screenplay({ trip: "Dublin · run", skin: "claude" }, (s) => {
  // Beat 1: the paste. A messy airline email becomes a filed, structured booking.
  // N15: a scene-setting callout BEFORE the paste prepares the viewer for what's about
  // to happen (the paste otherwise reads as noise). It binds to the framing line's
  // beatId — the first frame of the reel, so "b0" is stable while this line stays first.
  s.advisor.says("The airline just sent the Millers' confirmation. I'll paste it straight in.");
  s.spotlight({ beatId: "b0" }, {
    target: "none", eyebrow: "Watch this",
    title: "Copy an email, paste it in",
    body: "Next, the advisor pastes the airline's confirmation email exactly as it landed in her inbox — messy formatting and all. Voygent figures out what it is and applies it to the trip.",
    variant: "hero", dwellMs: 5200,
  });
  s.advisor.says(CONF_EMAIL);
  s.agent.says("That's the Millers' flight confirmation. Filing it.");
  s.agent.tool("add_booking", { summary: "Booking filed · EI 106 · conf 6XKPTR" });
  s.agent.folio(withBooking);
  s.spotlight({ eventType: "folio", nth: 1 }, {
    target: "folio-bookings", eyebrow: "Paste it, it's filed",
    title: "Paste it as messy as it comes",
    body: "You can paste the confirmation exactly as it arrives in your email, no matter how messy it is. The confirmation number, times and total land in the right places in the proposal. Nothing retyped.",
  });

  // Beat 2: the gap. Voygent notices the open days and pulls real tours into them.
  s.agent.says("Two days are still open, day 4 and day 6. Here are three tours that fit the pace and the season.");
  s.agent.board("tour", "b-tours", tours);
  s.advisor.picks("b-tours", "tour:wicklow", "Wicklow day trip on day 6.", withTour);
  s.agent.says("Added. Day 6 is the Wicklow Mountains and Glendalough trip, $142 a person, $43 commission on this booking.");
  s.spotlight({ interactionKind: "pick", nth: 1 }, {
    target: "board-tour", eyebrow: "Empty days are money",
    title: "Voygent sees the empty days and suggests profitable tours",
    body: "Days 4 and 6 had nothing sold into them. Voygent flags them and pulls real, commissionable tours that fit. The advisor clicks one and it is in the plan.",
  });

  // Beat 2.5 — cutaway (C9): meanwhile, on the Millers' page, day 6 is already current.
  s.client.folioView(fvDay6);
  s.spotlight({ interactionKind: "folioview", nth: 1 }, {
    target: "folio-day-6", eyebrow: "Meanwhile, in their window",
    title: "Their page updates automatically",
    body: "The advisor clicked once in chat, and day 6 on the Millers' page already shows the Wicklow trip. Voygent keeps the client's copy current by itself — and the advisor stays in control of what ends up on the proposal.",
  });
  s.client.folioView(null);

  // Beat 3: the travellers' window. The other two tours go to them as add-on options
  // on the trip the advisor already sent; they toggle one on and the total recalcs live.
  s.advisor.says("The other two tours stay on the board as options. I'll send them over and let them choose.");
  s.advisor.sendsToClient({ subject: "One more evening in Dublin, your call" });
  s.client.view(cvBase);
  s.client.view(cvAddon);
  s.client.view(cvNote);
  s.client.view(cvClosed);
  s.spotlight({ interactionKind: "clientview", nth: 1 }, {
    target: "client-view", eyebrow: "Their evening, their call",
    title: "The travellers do it themselves",
    body: "The Millers open their own window, turn on the whiskey walk, and watch the price update. No email back and forth to get there.",
  });

  // Beat 4: the relay. The note lands, Voygent proposes the fit, one click confirms it.
  s.agent.says("The Millers added the whiskey tasting walk and asked to do it the evening they return from Wicklow. Day 6 works. Confirm?");
  s.advisor.says("Confirm it.");
  s.agent.tool("patch_trip", { summary: "day 6 evening + whiskey walk" });
  s.agent.folio(finalFolio);
  s.spotlight({ eventType: "folio", nth: 3 }, {
    target: "folio-days", eyebrow: "You didn't sell that tour",
    title: "The folio did",
    body: "The travellers browsed the extras on their own, added one, and left a note. It came back as a one-click confirmation, not a phone call.",
  });
});
