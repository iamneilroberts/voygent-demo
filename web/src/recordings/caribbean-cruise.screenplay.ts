import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioDay, FolioInclude } from "../../../shared/events";
import type { ReelFolioSession, ReelHotelOption, ReelAddon, ReelComponent } from "../lib/recording";

// "A family cruise, planned in one chat" (DIY reel, 2026-07-10). Traveller-only: a
// family of four plans a 7-night Caribbean cruise themselves, no advisor anywhere.
// Cast: Voygent = s.agent (prose / tools / boards / folio). The traveller = s.client
// (the Rivera family, two parents, Maya 14, Sam 5, out of Orlando).
//
// Everything here is an AUTHORED fixture, a scripted walk-through of the free tier.
// The intro and end card say so; a real run pulls live sailings, hotels and excursions.
//
// Money mapping note (read before touching numbers): FolioData has no "cruise" field,
// only flights/hotels/days/includes. ReelFolioView renders a literal flight/hotel
// section straight off those arrays, so a cruise fare forced into `flights` would read
// as a plane ticket. Instead the cruise fare and the two excursions are fixed
// `ReelComponent` line items in the finale's folio window ("In this trip") — they are
// committed, not optional, so they don't belong under "Optional extras". Only the ship
// wifi package stays a toggleable `ReelAddon` (the total-pop beat). The one-night
// pre-cruise hotel uses the real hotel slot, since "Hotel · one night" reads honestly.
// flightsPrice/activitiesPrice stay 0 so nothing invisible sneaks into the total.

const CRUISE_LIST_PRICE = 3464;      // Symphony of the Seas, quad ocean view, as boarded
const CONNECTING_CABIN_SAVINGS = 284; // two connecting interior cabins vs. the one quad
const CRUISE_FARE = CRUISE_LIST_PRICE - CONNECTING_CABIN_SAVINGS; // 3180
const LATER_WEEK_SAVINGS = 412;       // declined: school keeps them on March 29

// ── Cruises: three sailings, all sourced from Widgety, all fit a party of four. ───────
const cruises: BoardCandidate[] = [
  {
    id: "cruise:symphony", title: "Symphony of the Seas · Royal Caribbean", price: `$${CRUISE_LIST_PRICE.toLocaleString("en-US")} total`,
    meta: "Western Caribbean · Cozumel, George Town, Falmouth + 3 sea days · quad ocean view",
    summary: "Symphony of the Seas, quad ocean view, $3,464 total", source: "Widgety", badge: "Kids club 3 to 17",
  },
  {
    id: "cruise:celebration", title: "Carnival Celebration · Carnival Cruise Line", price: "$2,980 total",
    meta: "Eastern Caribbean · San Juan, St Thomas, Amber Cove + 2 sea days · interior stateroom · kids club 2 to 17",
    summary: "Carnival Celebration, interior stateroom, $2,980 total", source: "Widgety", badge: "Best teen spaces",
  },
  {
    id: "cruise:seascape", title: "MSC Seascape · MSC Cruises", price: "$2,410 total",
    meta: "Western Caribbean · Cozumel, Costa Maya, Roatan + 2 sea days · interior stateroom · kids club 0 to 17",
    summary: "MSC Seascape, interior stateroom, $2,410 total", source: "Widgety", badge: "Cheapest",
  },
];

// ── Excursions: one idea per port, three different suppliers. ─────────────────────────
const excursions: BoardCandidate[] = [
  {
    id: "exc:chankanaab", title: "Chankanaab beach and snorkel day", price: "$39/adult",
    meta: "Cozumel · full day · kids half price", summary: "Chankanaab beach and snorkel day, Cozumel",
    source: "Viator", badge: "Good for age 5",
  },
  {
    id: "exc:stingray", title: "Stingray City sandbar", price: "$52/person",
    meta: "Grand Cayman · half day · shallow water", summary: "Stingray City sandbar, Grand Cayman",
    source: "Shore Excursions Group", badge: "Shallow water",
  },
  {
    id: "exc:dunns", title: "Dunn's River Falls climb", price: "$45/person",
    meta: "Falmouth · half day · guided climb", summary: "Dunn's River Falls climb, Falmouth",
    source: "GetYourGuide", badge: "Teens love it",
  },
];
const EXCURSION_PICKS = ["exc:chankanaab", "exc:dunns"]; // Cozumel for Sam, Falmouth for Maya

// ── Pre-cruise Miami hotels: one night, so nobody drives down on embarkation morning. ──
const hotels: BoardCandidate[] = [
  {
    id: "hotel:holidayinn", title: "Holiday Inn Port of Miami", price: "$189/night",
    meta: "Downtown · walk to the terminal", summary: "Holiday Inn Port of Miami, $189/night",
    source: "Expedia", badge: "Walk to port",
  },
  {
    id: "hotel:aloft", title: "Aloft Brickell", price: "$172/night",
    meta: "Brickell · 10 min ride to the terminal", summary: "Aloft Brickell, $172/night",
    source: "Expedia",
  },
  {
    id: "hotel:intercontinental", title: "InterContinental Miami", price: "$246/night",
    meta: "Downtown · 10 min ride to the terminal", summary: "InterContinental Miami, $246/night",
    source: "Expedia",
  },
];

// ── Family tips: five ready-written notes, the client keeps all five. ─────────────────
const includeCandidates: BoardCandidate[] = [
  { id: "inc:docs", title: "Birth certificates or passports for the kids", meta: "Closed-loop sailing rules", summary: "Birth certificates or passports for the kids", source: "Widgety" },
  { id: "inc:muster", title: "The muster drill with a 5 year old", meta: "Everyone musters before sailaway", summary: "The muster drill with a 5 year old", source: "Widgety" },
  { id: "inc:teenapp", title: "Teen app and wristband rules", meta: "Messaging without a phone plan", summary: "Teen app and wristband rules", source: "Widgety" },
  { id: "inc:motion", title: "Motion sickness plan B", meta: "Interior cabins ride steadier", summary: "Motion sickness plan B", source: "Widgety" },
  { id: "inc:embarkday", title: "What goes in the embarkation day bag", meta: "Luggage takes a few hours to arrive", summary: "What goes in the embarkation day bag", source: "Widgety" },
];
const INCLUDE_KEEP = includeCandidates.map((c) => c.id); // the client keeps all five
const chosenIncludes: FolioInclude[] = [
  { key: "inc:docs", title: "Birth certificates or passports for the kids", body: "A certified birth certificate covers a U.S. citizen under 16 on a closed-loop sailing, but a passport clears every edge case, an expired ID, a missed connection, a changed itinerary. Bring one if you have it." },
  { key: "inc:muster", title: "The muster drill with a 5 year old", body: "Everyone musters before sailaway, life jacket included. Sam will be the smallest one there, and that is normal, the crew runs this drill every week and knows how to keep a 5 year old calm through it." },
  { key: "inc:teenapp", title: "Teen app and wristband rules", body: "Maya gets her own wristband and the ship's messaging app, so she can find you or the teen lounge without a phone plan. Set the check-in rules with her before you board, not on day one." },
  { key: "inc:motion", title: "Motion sickness plan B", body: "Interior cabins ride steadier than balconies do. Pack the wristbands or the tablets anyway, the first sea day is when you will want them, not after." },
  { key: "inc:embarkday", title: "What goes in the embarkation day bag", body: "Luggage will not reach your cabin for a few hours. Pack swimsuits, meds, chargers and a change of clothes for both kids in one bag you keep with you." },
];

// ── The week, day by day. Day 3 (Cozumel) and Day 5 (Falmouth) start generic and firm
//    up once the excursions are picked; Day 4 (George Town) stays the free port. ───────
const days: FolioDay[] = [
  { title: "Day 1 · Embark in Miami", date: "Sun Mar 29", activities: [{ name: "Board Symphony of the Seas at PortMiami" }], dining: [{ name: "Sail-away lunch on the pool deck" }] },
  { title: "Day 2 · Sea day", date: "Mon Mar 30", activities: [{ name: "Kids club drop-off, pool morning for the adults" }], dining: [] },
  { title: "Day 3 · Cozumel", date: "Tue Mar 31", activities: [{ name: "Explore Cozumel on your own" }], dining: [] },
  { title: "Day 4 · George Town, Grand Cayman", date: "Wed Apr 1", activities: [{ name: "Free morning at Seven Mile Beach" }], dining: [] },
  { title: "Day 5 · Falmouth, Jamaica", date: "Thu Apr 2", activities: [{ name: "Explore Falmouth on your own" }], dining: [] },
  { title: "Day 6 · Sea day", date: "Fri Apr 3", activities: [{ name: "Family game night" }], dining: [] },
  { title: "Day 7 · Final sea day, disembark Sunday morning", date: "Sat Apr 4", activities: [{ name: "Pack up before Sunday's early disembarkation in Miami" }], dining: [] },
];

// ── Folio progression: cruise itinerary lands with the pick, excursions firm up two
//    day cards, the pre-cruise hotel and the tips fold in last. Nothing is ever
//    removed once added, so every snapshot from that point on still carries it. ───────
const base: FolioData = { tripId: "cruise", title: "A family cruise to the Caribbean", flights: [], hotels: [] };
const withCruiseDays: FolioData = { ...base, days };
const withExcursions: FolioData = {
  ...withCruiseDays,
  days: days.map((d, i) =>
    i === 2 ? { ...d, activities: [{ name: "Chankanaab beach and snorkel day, Cozumel" }] } :
    i === 4 ? { ...d, activities: [{ name: "Dunn's River Falls climb, Falmouth" }] } : d),
};
const withHotel: FolioData = { ...withExcursions, hotels: [{ name: "Holiday Inn Port of Miami", price: "$189", area: "Near PortMiami", nights: 1, perNight: "$189" }] };
const withIncludes: FolioData = { ...withHotel, includes: chosenIncludes };
export const sentFolio: FolioData = { ...withIncludes };

// ── The finale cutaway: the whole trip, one page, priced. The cruise fare and the two
//    excursions are fixed components (see the mapping note up top); only the wifi
//    package stays a toggleable addon, since it's the one thing not already committed.
const finaleHotels: ReelHotelOption[] = [{ id: "hotel:holidayinn", name: "Holiday Inn Port of Miami", price: 189, meta: "$189 · one night, walk to the terminal" }];
const finaleComponents: ReelComponent[] = [
  { id: "comp-fare", label: "Cruise fare, 2 connecting cabins, 4 guests", price: CRUISE_FARE },
  { id: "comp-chankanaab", label: "Chankanaab beach and snorkel day, Cozumel", price: 39 * 2 + 19.5 * 2 },
  { id: "comp-dunns", label: "Dunn's River Falls climb, Falmouth", price: 45 * 4 },
];
const finaleAddons: ReelAddon[] = [
  { id: "addon-wifi", label: "Cruise wifi package, whole family", price: 89, on: false },
];
const fvBase: ReelFolioSession = {
  open: true, url: "voygent.app/t/cruise", folio: sentFolio,
  flightsPrice: 0, activitiesPrice: 0,
  hotels: finaleHotels, pickedHotelId: "hotel:holidayinn",
  addons: finaleAddons, components: finaleComponents, notes: [], status: "final", advisorUpdating: false,
  focus: "folio-hero", expandedDay: null,
  audienceLine: "Prepared for the Rivera family, Mar 29 to Apr 5",
  sceneLabel: "Your trip, your window",
  totalLabel: "Trip total, family of four",
};
const fvDays: ReelFolioSession = { ...fvBase, focus: "folio-days" };
const fvDay3: ReelFolioSession = { ...fvBase, focus: "folio-day-3", expandedDay: 3 };
const fvExtras: ReelFolioSession = { ...fvBase, focus: "folio-addons" };
const fvWifiOn: ReelFolioSession = { ...fvExtras, addons: fvExtras.addons.map((a) => (a.id === "addon-wifi" ? { ...a, on: true } : a)), ctaLine: "Plan yours free at voygent.ai" };

export const caribbeanCruise = screenplay({ trip: "Caribbean cruise", skin: "claude" }, (s) => {
  // Beat 1 — the brief, straight from the family. No advisor anywhere in this reel.
  s.client.says("Two adults, a 14 year old and a 5 year old, out of Orlando. We want a 7 night Caribbean cruise from Miami, the last week of March, spring break. The kids need real kids programs, not just a pool.");
  s.spotlight({ beatId: "b0" }, {
    target: "reel-controls", eyebrow: "A family plans this one, no advisor",
    title: "A family cruise, planned in one chat",
    body: "Two parents, Maya (14) and Sam (5), out of Orlando. No advisor anywhere in this one, just the family and Voygent. Every result you'll see is a real search with its source named.",
    variant: "hero", dwellMs: 7000,
  });

  // Beat 2 — the cruise search: three sailings, sources named, kids club ages up front.
  s.agent.says("Got it. Two adults and two kids, ages 14 and 5, sailing out of Miami for 7 nights, the last week of March, spring break. Real kids programs matters here too, not every ship runs a full club for a 5 year old. Let me see what is actually sailing that specific week, not just anything Caribbean shaped.");
  s.agent.tool("cruise_search", { summary: "Widgety. 31 sailings from Miami, late March" });
  s.agent.says("Three that fit your dates and a party of four. All three run real kids clubs, and the age range is right on the card so you do not have to dig for it. Each one shows the itinerary and a rough cabin idea before you tap anything.");
  s.agent.board("cruise", "b-cruise", cruises);
  s.spotlight({ eventType: "board", kind: "cruise", nth: 1 }, {
    target: "board-cruise", eyebrow: "Real sailings, sources named",
    title: "Every price shows its source",
    body: "31 sailings pulled from Widgety, narrowed to three that fit a family of four the last week of March. The kids club age range sits right on the card, so Sam and Maya both fit before you click anything.",
    dwellMs: 7000,
  });

  // Beat 3 — the save-money beat: a cheaper week declined, then a real saving that
  // doesn't need to move the date at all.
  s.agent.says(`One thing worth knowing before you pick. If you can shift a week later to April 5, the same cabins run about $${LATER_WEEK_SAVINGS} less, spring break traffic eases off once school is back in session.`);
  s.client.says("School only lets us go the last week of March. We need to keep March 29.");
  s.agent.says(`Understood, keeping the date. There is still a way to save on this sailing. Two connecting interior cabins run $${CONNECTING_CABIN_SAVINGS} less than the one quad ocean view cabin, and you get two bathrooms instead of one. The kids stay right next door either way.`);
  s.client.picks("b-cruise", "cruise:symphony", "Symphony of the Seas, March 29, two connecting interior cabins instead of the quad ocean view.", withCruiseDays);
  s.spotlight({ interactionKind: "pick", nth: 1 }, {
    target: "board-cruise", eyebrow: "Fixed dates, real savings",
    title: "It saves you money even when your dates are fixed",
    body: "The later sailing was cheaper, but school said no. Voygent found a second way to save on the same date: two connecting cabins instead of one bigger cabin, $284 less, and an extra bathroom.",
    dwellMs: 7000,
  });

  // Beat 4 — excursions from three different suppliers, family filters on.
  s.agent.says("Three ports on this itinerary, one stop for snorkeling, one for open water, one with a climb. Let's find things Sam and Maya will both actually want to do, not just what's cheapest.");
  s.agent.tool("excursion_search", { summary: "Viator + GetYourGuide + Shore Excursions Group. Three ports, family filters on" });
  s.agent.says("One idea for each port, family filters on, so nothing here needs a waiver for a five year old, and nothing requires a swim test Sam hasn't passed yet.");
  s.agent.board("tour", "b-excursions", excursions);
  s.client.picksMany("b-excursions", EXCURSION_PICKS, "The snorkel beach in Cozumel for Sam, the falls climb in Falmouth for Maya.", withExcursions);
  s.agent.says("Good pairing. That leaves George Town open, and that is fine. Seven Mile Beach is a free public morning there, and every port has a no cost option if you would rather save the money, a walk through downtown Cozumel, or the crafts market in Falmouth.");
  s.spotlight({ interactionKind: "pick", nth: 2 }, {
    target: "board-tour", eyebrow: "Free options at every port",
    title: "Two paid excursions, the rest free",
    body: "Two excursions booked, one for each kid. George Town stays free on purpose, Seven Mile Beach costs nothing. Voygent shows a free option at every stop, not only the paid ones.",
    dwellMs: 7000,
  });

  // Beat 5 — the pre-cruise hotel: an honest tip, not a sales pitch.
  s.agent.says("One more honest tip. Do not try to drive down from Orlando the morning you sail. The Turnpike into PortMiami on an embarkation day is a bad gamble, one accident and you are chasing the ship to its next port. Stay the night before instead.");
  s.agent.tool("hotel_search", { summary: "Expedia. 41 stays near PortMiami" });
  s.agent.says("A few options here, all a short ride or a walk from the terminal, so the morning of embarkation stays boring, in a good way, which is exactly what you want with two kids and a pile of luggage.");
  s.agent.board("hotel", "b-hotel-mia", hotels);
  s.client.picks("b-hotel-mia", "hotel:holidayinn", "The Holiday Inn, we can walk to the terminal with the kids and the bags.", withHotel);
  s.spotlight({ interactionKind: "pick", nth: 3 }, {
    target: "board-hotel", eyebrow: "Advice, not a sales pitch",
    title: "Stay near the port the night before",
    body: "Voygent recommends this hotel to protect the sailing, not to earn anything on it. A short walk to the terminal beats a gamble on Turnpike traffic on embarkation morning.",
    dwellMs: 7000,
  });

  // Beat 6 — family tips, all free, all ready-written.
  s.agent.says("A few last things worth knowing before you pack, mostly stuff nobody tells you the first time you cruise with kids.");
  s.agent.tool("get_help", { summary: "Family cruise tips, docs, drills, wristbands" });
  s.agent.board("includes", "b-incl", includeCandidates);
  s.client.picksMany("b-incl", INCLUDE_KEEP, "Keep all five, we will want every one of these.", withIncludes);
  s.spotlight({ interactionKind: "pick", nth: 4 }, {
    target: "board-includes", eyebrow: "Free extras, built by Voygent",
    title: "Ready-made notes for this family",
    body: "None of this cost anything and none of it was typed by hand. The muster drill note, the kids' passport reminder, the motion sickness plan B: Voygent wrote them and the family kept the ones they wanted.",
    dwellMs: 7000,
  });

  // Beat 7 — the finale: the whole trip, one page, one honest total.
  s.agent.says("Here is the whole week and the whole cost, on one page you can keep for yourselves, and come back to any time before you sail.");
  s.client.folioView(fvBase);
  s.client.folioView(fvDays);
  s.client.folioView(fvDay3);
  s.client.folioView(fvExtras);
  s.client.folioView(fvWifiOn);
  s.spotlight({ interactionKind: "folioview", nth: 5 }, {
    target: "folio-total", eyebrow: "One number, no surprises",
    title: "The whole trip, one honest total",
    body: "Cruise fare with the connecting cabin saving, one night at the port hotel, both excursions. Add the wifi package and the total updates right away.",
    dwellMs: 7000,
  });
  // 8d: the wifi total-pop callout above already holds 7000ms so the total reads;
  // closing the window afterward has nothing new to show, so it only needs long
  // enough to register the close, not the folioview kind's full 4200ms floor.
  s.client.folioView(null, { holdMs: 2800 });

  // Beat 8 — the wrap.
  s.agent.says("This walkthrough was scripted, sources named the whole way. Sign up free and Voygent pulls live sailings, live hotels and live excursions for your own dates, no advisor required.");
});

export const meta = {
  id: "cruise",
  title: "A family cruise, planned in one chat",
  blurb: "A family of four plans a seven night Caribbean cruise from Miami, no travel advisor. Real searches, sources named.",
  intro: {
    eyebrow: "▶ DIY demo",
    note: "A scripted walk-through of the free tier. Your own run pulls live sailings, hotels and excursions.",
  },
  endCard: {
    eyebrow: "✓ A family cruise, planned in one chat",
    title: "Build your own trip",
    blurb: "Adding the Voygent connector in claude.ai is one click. This walk-through was scripted, a real run pulls live results.",
  },
  recap: ["31 sailings, sources named", "$284 saved with connecting cabins", "excursions from three suppliers", "free port mornings mapped", "one folio, family total"],
} as const;
