import { screenplay } from "../lib/screenplay";
import type { FolioData, FolioBooking } from "../../../shared/events";
import type { ReelEmailView } from "../lib/recording";
import { sentFolio } from "./dublin-collab.screenplay";

// Chapter 3 · "Book the trip" (QA4 restructure, 2026-07-09). Advisor POV only — no
// client windows (that was chapter 2). The Millers' reply lands as a notification in
// the advisor's thread; Voygent folds their picks and their note into the trip; the
// advisor books the flight and pastes the airline's MESSY confirmation email straight
// in (shown first as the email it really is); the folio takes the ticketed corrections;
// and the advisor's commission is itemized, earned this time, not projected.
//
// AUTHORED fixture; intro and end card carry the scripted framing. Fixture lineage
// continues ch1/ch2: Dean $168×7, Cliffs $284 for two, Kilmainham $116, transfers $120,
// a Temple Bar food tour at $85 pp.

// ── What the Millers sent back (ch2's closing click, seen from the advisor's side). ───
const MILLERS_REPLY = "We picked The Dean. Added the gaol tour and airport transfers. One ask: could we add a food tour our last evening? We loved the one in Lisbon.";

// ── The trip with the Millers' picks and their food tour folded in. ───────────────────
const incorporated: FolioData = {
  ...sentFolio,
  hotels: [{ name: "The Dean Dublin", area: "Camden St", stars: 4, nights: 7, perNight: "$168", commission: 176, commissionPct: 15 }],
  days: sentFolio.days!.map((d, i) =>
    i === 3 ? { ...d, activities: [...d.activities, { name: "Kilmainham Gaol & Museum tour" }] }
    : i === 5 ? { ...d, activities: [...d.activities, { name: "Temple Bar food tour" }] }
    : d),
};

// ── The airline confirmation, exactly as it landed: sloppy, all-caps, DO NOT REPLY. ───
const CONF_EMAIL = `FW: Your booking is confirmed - EI 106 04OCT
*** DO NOT REPLY TO THIS EMAIL ***
BOOKING REF: 6XKPTR   TICKET: 053-4471182286
PASSENGER/S: MILLER/MARK MR  MILLER/JULIE MRS
EI 106 J 04OCT JFKDUB HK2 2055 0835+1 /E
FARE USD 3206.00 TOTAL INC TAXES/FEES
Baggage allowance 1PC per passenger. Check-in opens 24hrs before departure.`;

const confEmailView: ReelEmailView = {
  sceneLabel: "The advisor's inbox",
  from: "Aer Lingus <noreply@aerlingus.com>",
  subject: "FW: Your booking is confirmed - EI 106 04OCT",
  body: CONF_EMAIL,
};

const filedBooking: FolioBooking = {
  label: "Aer Lingus EI 106 · JFK→DUB",
  conf: "6XKPTR",
  detail: "Oct 4 · 8:55p → 8:35a +1 · Mark & Julie Miller · $3,206 incl. taxes",
  status: "confirmed",
};
// The paste corrects the folio against the TICKET: the ticketed total is $3,206 with
// taxes, $26 over the quote — the flight line updates, the booking row files the ref.
const withBooking: FolioData = {
  ...incorporated,
  flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,206", date: "Oct 4-11", stops: 1 }],
  bookings: [filedBooking],
};

// ── The advisor's ledger: earned commission, itemized per component. ──────────────────
// Dean 1176×15%=176 · Cliffs 284×15%=43 · Kilmainham 116×15%=17 · transfers 120×15%=18
// · food tour 170×15%=26 → $280 booked. Insurance stays potential (they didn't take it).
const finalFolio: FolioData = {
  ...withBooking,
  commissionsKind: "booked",
  commissions: [
    { label: "The Dean Dublin · 7 nights", amount: 176, pct: 15 },
    { label: "Cliffs of Moher & Galway day trip", amount: 43, pct: 15 },
    { label: "Kilmainham Gaol & Museum tour", amount: 17, pct: 15 },
    { label: "Private airport transfers", amount: 18, pct: 15 },
    { label: "Temple Bar food tour", amount: 26, pct: 15 },
    { label: "Travel insurance", amount: 63, pct: 30, potential: true },
  ],
};

export const dublinRun = screenplay({ trip: "Dublin · advisor", skin: "claude" }, (s) => {
  // Beat 1: the reply arrives in the advisor's thread. Voygent lays the trip context in.
  s.client.sendsToClient({ subject: "Re: Your Dublin trip", reply: MILLERS_REPLY, inbound: true });
  s.spotlight({ interactionKind: "handoff", nth: 1 }, {
    target: "handoff-notice", eyebrow: "Demo 3 · back at the advisor's desk",
    title: "The clients replied",
    body: "The Millers' picks and their question from demo 2 land straight in the advisor's thread, already routed to the right trip. No inbox archaeology, no copy-paste.",
    variant: "hero", dwellMs: 6000,
  });
  s.agent.folio(sentFolio);
  s.agent.says("The Millers sent their trip back. They picked The Dean, added the Kilmainham Gaol tour and airport transfers, and asked for a food tour on their last evening, like the one they did in Lisbon.");
  s.client.comments("days[5]", "Could we add a food tour our last evening? We loved the one in Lisbon.", "thread-food");

  // Beat 2: Voygent folds the feedback in — the note becomes the plan.
  s.agent.tool("excursion_search", { summary: "Temple Bar food tour · evening · day 6" });
  s.agent.tool("patch_trip", { summary: "Dean locked · gaol tour day 4 · food tour day 6 · transfers" });
  s.agent.says("Done. The Dean is locked in, the gaol tour is on day 4, the transfers are on the trip, and I've added a Temple Bar food tour to the last evening, $85 a person. Checked it against their dinner booking, no conflict.");
  s.agent.folio(incorporated);
  s.spotlight({ interactionKind: "comment", nth: 1 }, {
    target: "comment-thread-food", eyebrow: "Feedback, incorporated",
    title: "Their note becomes the plan",
    body: "The question the Millers left on their page is answered in one pass: hotel locked, tours placed, the food tour they asked for found and slotted in. The advisor read one message and clicked nothing.",
  });

  // Beat 3: the booking. The airline's confirmation is a mess; the advisor pastes it
  // in exactly as it came, and the folio takes the ticketed corrections.
  s.advisor.says("Booked the flights with Aer Lingus this morning. The confirmation just landed. Look at the state of it.");
  s.advisor.email(confEmailView);
  s.spotlight({ interactionKind: "emailview", nth: 1 }, {
    target: "email-window", eyebrow: "Watch this",
    title: "The airline sends a mess",
    body: "All caps, booking codes, DO NOT REPLY. Next, the advisor copies this email and pastes it into the chat exactly as it is. Voygent works out what it is and files it against the trip.",
    variant: "hero", dwellMs: 6000,
  });
  s.advisor.email(null);
  s.advisor.says(CONF_EMAIL);
  s.agent.says("That's the Millers' flight confirmation. Filing it.");
  s.agent.tool("add_booking", { summary: "Booking filed · EI 106 · conf 6XKPTR" });
  s.agent.folio(withBooking);
  s.agent.says("Filed under confirmation 6XKPTR. One correction from the ticket: it came to $3,206 with taxes, $26 over the estimate, so the folio now shows the ticketed number.");
  s.spotlight({ eventType: "folio", nth: 3 }, {
    target: "folio-bookings", eyebrow: "Paste it as messy as it comes",
    title: "The confirmation files itself",
    body: "The confirmation number, times, passengers and ticketed total all land in the right places, and the small differences from the quote are corrected on the trip. Nothing retyped.",
  });

  // Beat 4: the ledger. Earned commission, itemized, current.
  s.agent.says("And here's where the trip stands for you now that it's booked.");
  s.agent.folio(finalFolio);
  s.spotlight({ eventType: "folio", nth: 4 }, {
    target: "trip-commission", eyebrow: "For the advisor",
    title: "Your commission, itemized",
    body: "The hotel, both tours, the transfers, the food tour: $280 booked on this trip, each component showing its cut. Voygent keeps the number current as the trip changes, and still shows what the untaken extras are worth.",
  });
});
