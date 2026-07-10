import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioDay, FolioInclude, FolioBooking } from "../../../shared/events";
import type { ReelFolioSession, ReelAddon, ReelHotelOption } from "../lib/recording";

// "A week in Ireland, planned in one chat" — the DIY reel. Two travellers, no advisor
// anywhere: every human turn is s.client. Voygent searches real sources, names them on
// every option, and the travellers pick their own flight, two hotels, a car and a couple
// of tours. Voygent also proactively finds a cheaper travel window and builds some free
// extras (a walking tour, free things to do, practical tips) into the plan.
//
// AUTHORED fixture — a scripted walk-through of the free tier. The intro and end card say
// so; a real Voygent run pulls live flights, hotels, cars and tours.

// ── Flights: BOS→DUB, three fares, two suppliers. ─────────────────────────────────────
const flights: BoardCandidate[] = [
  { id: "flight:aerlingus-ns", title: "Aer Lingus · BOS→DUB nonstop", price: "$612", perPerson: 612,
    meta: "Nonstop · 6h 10m · Economy", badge: "Nonstop", source: "Travelpayouts",
    summary: "Aer Lingus nonstop BOS-DUB $612 per person" },
  { id: "flight:delta-klm", title: "Delta + KLM · BOS→DUB via AMS", price: "$489", perPerson: 489,
    meta: "1 stop (AMS) · 11h 40m", badge: "Cheapest", source: "Kiwi.com",
    summary: "Delta + KLM one stop AMS $489 per person" },
  { id: "flight:jetblue-aerlingus", title: "JetBlue + Aer Lingus · BOS→DUB via JFK", price: "$534", perPerson: 534,
    meta: "1 stop (JFK) · 9h 55m", source: "Travelpayouts",
    summary: "JetBlue + Aer Lingus one stop JFK $534 per person" },
];

// ── Dublin hotels: three central, walkable options, one supplier. ─────────────────────
const hotelsDub: BoardCandidate[] = [
  { id: "hotel:alex", title: "The Alex", price: "$164/night", meta: "Merrion Square, a short walk to Temple Bar", source: "wise-travel.com", summary: "The Alex $164/night" },
  { id: "hotel:wren", title: "Wren Urban Nest", price: "$139/night", meta: "Custom House Quay, compact and central", badge: "Walkable", source: "wise-travel.com", summary: "Wren Urban Nest $139/night" },
  { id: "hotel:clayton-cardiff", title: "Clayton Hotel Cardiff Lane", price: "$151/night", meta: "Grand Canal Dock", source: "wise-travel.com", summary: "Clayton Cardiff Lane $151/night" },
];

// ── Killarney hotels: three near the National Park, a different supplier. ─────────────
const hotelsKil: BoardCandidate[] = [
  { id: "hotel:killarney-plaza", title: "Killarney Plaza Hotel & Spa", price: "$148/night", meta: "Town centre, on the square", source: "LiteAPI", summary: "Killarney Plaza $148/night" },
  { id: "hotel:brehon", title: "The Brehon", price: "$172/night", meta: "Beside the National Park", badge: "Spa", source: "LiteAPI", summary: "The Brehon $172/night" },
  { id: "hotel:arbutus", title: "Arbutus Hotel", price: "$119/night", meta: "Family-run, on High Street", badge: "Family run", source: "LiteAPI", summary: "Arbutus Hotel $119/night" },
];

// ── Rental car: Dublin Airport, one supplier, three trims. ────────────────────────────
const cars: BoardCandidate[] = [
  { id: "car:yaris-manual", title: "Toyota Yaris, compact, manual", price: "$31/day", badge: "Cheapest", source: "Travelpayouts", summary: "Toyota Yaris manual $31/day" },
  { id: "car:corolla-auto", title: "Toyota Corolla, compact, automatic", price: "$44/day", badge: "Automatic", source: "Travelpayouts", summary: "Corolla automatic $44/day" },
  { id: "car:suv-auto", title: "Small SUV, automatic", price: "$58/day", source: "Travelpayouts", summary: "Small SUV automatic $58/day" },
];

// ── Tours: Dublin and Kerry, two suppliers. ────────────────────────────────────────────
const tours: BoardCandidate[] = [
  { id: "tour:guinness", title: "Guinness Storehouse", price: "$42 pp", source: "Viator", summary: "Guinness Storehouse $42 per person" },
  { id: "tour:gap-of-dunloe", title: "Gap of Dunloe boat and walk", price: "$38 pp", source: "GetYourGuide", summary: "Gap of Dunloe boat and walk $38 per person" },
  { id: "tour:kilmainham", title: "Kilmainham Gaol", price: "$9 pp", badge: "Book ahead", source: "Viator", summary: "Kilmainham Gaol $9 per person" },
];
const TOURS_PICKED = ["tour:guinness", "tour:gap-of-dunloe"];

// ── Practical tips: Voygent's own curation, not a supplier search, so no `source`. ─────
const tipCandidates: BoardCandidate[] = [
  { id: "inc:left", title: "Driving on the left", meta: "Roundabouts run clockwise", summary: "Driving on the left" },
  { id: "inc:weather", title: "Weather and layers", meta: "Low 50s to low 60s F, pack a rain shell", summary: "Weather and layers" },
  { id: "inc:plug", title: "Plug type G", meta: "Same as the UK, one adapter covers you", summary: "Plug type G" },
  { id: "inc:tipping", title: "Card fees and tipping", meta: "Most cards work fee-free, round up at pubs", summary: "Card fees and tipping" },
];
const TIPS_KEPT = ["inc:left", "inc:weather", "inc:plug", "inc:tipping"];
const chosenTips: FolioInclude[] = [
  { key: "inc:left", title: "Driving on the left", body: "Roundabouts run clockwise, and you give way to traffic already in the circle. Take the first few miles slow, it clicks fast." },
  { key: "inc:weather", title: "Weather and layers", body: "Expect the low 50s to low 60s F with a shower or two most days. A light rain shell covers it, no need for a heavy coat." },
  { key: "inc:plug", title: "Plug type G", body: "Same three-pin plug as the UK. One adapter between the two of you covers phones and cameras." },
  { key: "inc:tipping", title: "Card fees and tipping", body: "Most cards work with no foreign transaction fee. Round up at pubs and cafes, restaurants don't expect much beyond that." },
];

// ── The week, day by day. Days 2/3/6 get the free extras folded in once Voygent builds
//    them (the walking tour, the National Museum, Muckross House). ───────────────────────
const daysBase: FolioDay[] = [
  { title: "Day 1 · Arrive in Dublin", date: "Wed", activities: [{ name: "Evening walk along the Liffey" }], dining: [{ name: "The Church", cuisine: "Irish" }] },
  { title: "Day 2 · Dublin on foot", date: "Thu", activities: [{ name: "Free morning to explore" }], dining: [{ name: "The Long Hall", cuisine: "Pub" }] },
  { title: "Day 3 · Guinness Storehouse", date: "Fri", activities: [{ name: "Guinness Storehouse tour" }], dining: [{ name: "Klaw", cuisine: "Seafood" }] },
  { title: "Day 4 · Dublin to Killarney", date: "Sat", activities: [{ name: "Pick up the rental car and drive to Killarney" }], dining: [{ name: "Treyvaud's", cuisine: "Irish" }] },
  { title: "Day 5 · Gap of Dunloe", date: "Sun", activities: [{ name: "Gap of Dunloe boat and walk" }], dining: [{ name: "Bricin", cuisine: "Irish" }] },
  { title: "Day 6 · Killarney, free and easy", date: "Mon", activities: [{ name: "Open morning" }], dining: [{ name: "The Blue Door", cuisine: "Irish" }] },
  { title: "Day 7 · Fly home", date: "Tue", activities: [{ name: "Return the car and head to the airport" }], dining: [] },
];
const daysWithFreeExtras: FolioDay[] = daysBase.map((d, i) => {
  if (i === 1) return { ...d, activities: [{ name: "Self-guided walking tour: Trinity Library, Dublin Castle, St Patrick's Cathedral, ending at the Long Hall" }] };
  if (i === 2) return { ...d, activities: [{ name: "Guinness Storehouse tour" }, { name: "Free afternoon at the National Museum" }] };
  if (i === 5) return { ...d, activities: [{ name: "Free morning at Muckross House gardens" }, { name: "An afternoon by the Killarney lakeshore" }] };
  return d;
});

const carBooking: FolioBooking = { label: "Compact automatic · Dublin Airport", conf: "TP-88214", detail: "7 days, picked up when you leave Dublin", status: "confirmed" };
const wrenHotel = { name: "Wren Urban Nest", price: "$417", area: "Dublin, Docklands", nights: 3, perNight: "$139" };
const arbutusHotel = { name: "Arbutus Hotel", price: "$476", area: "Killarney, High Street", nights: 4, perNight: "$119" };

// ── Folio progression. No commissions anywhere — nobody here is an advisor. ────────────
const base: FolioData = { tripId: "ireland", title: "A week in Ireland", flights: [], hotels: [] };
const withFlight: FolioData = { ...base, flights: [{ label: "Aer Lingus · BOS→DUB nonstop", carrier: "Aer Lingus", route: "BOS→DUB", date: "Sep 19-26", stops: 0, travelers: 2, perPerson: "$612", price: "$1,224" }] };
const withNewDates: FolioData = { ...withFlight, flights: [{ ...withFlight.flights[0], date: "Sep 22-29", perPerson: "$498", price: "$996" }] };
const withDubHotel: FolioData = { ...withNewDates, hotels: [wrenHotel] };
const withKilHotel: FolioData = { ...withDubHotel, hotels: [wrenHotel, arbutusHotel] };
const withCar: FolioData = { ...withKilHotel, bookings: [carBooking] };
const withDays: FolioData = { ...withCar, days: daysBase };
const withFreeExtras: FolioData = { ...withDays, days: daysWithFreeExtras, includes: chosenTips };

export const irelandFolio: FolioData = withFreeExtras;

// ── The finale cutaway: the traveller's own folio, live total. ────────────────────────
const finaleBase: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/ireland",
  folio: irelandFolio,
  flightsPrice: 996,
  activitiesPrice: 160, // Guinness + Gap of Dunloe, two travellers: (42 + 38) * 2
  hotels: [{ id: "trip-hotels", name: "Dublin & Killarney hotels", price: 893, meta: "3 nights Dublin + 4 nights Killarney" } as ReelHotelOption],
  pickedHotelId: "trip-hotels",
  addons: [
    { id: "car", label: "Rental car · 7 days, automatic", price: 308, on: true } as ReelAddon,
    { id: "insurance", label: "Travel insurance · two travellers", price: 128, on: false } as ReelAddon,
  ],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: "folio-hero",
  expandedDay: null,
  audienceLine: "Prepared for Anna and Chris · Sep 22 to 29",
  sceneLabel: "Your trip, your window",
  totalLabel: "Trip total · two travellers",
};
const finaleWithInsurance: ReelFolioSession = {
  ...finaleBase,
  focus: "folio-total",
  addons: finaleBase.addons.map((a) => (a.id === "insurance" ? { ...a, on: true } : a)),
};

export const irelandDiy = screenplay({ trip: "Ireland · DIY", skin: "claude" }, (s) => {
  // Act 0 — orientation, bound to the very first frame (the traveller's own request).
  s.client.says("Two of us, a week in Ireland late September. We fly out of Boston. Dublin, plus somewhere greener. We want a rental car and we don't want to overpay.");
  s.spotlight({ beatId: "b0" }, {
    target: "reel-controls", eyebrow: "DIY demo",
    title: "A week in Ireland, planned in one chat",
    body: "Two travellers, no advisor anywhere. Every search below is real, and every result names where it came from. In Read mode this stops at every note like this one. Pick 1x or 2x up here to let it run on its own.",
    variant: "hero", dwellMs: 6500,
  });

  // Act 1 — the shape of the week, then flights.
  s.agent.says("Nice, a full week and no rush. Let me pull together a shape before pricing anything, then we'll search real fares and hotels together.");
  s.agent.says("Three nights in Dublin, four in Killarney, with the car picked up when you leave the city. That keeps the driving to one long stretch instead of shuffling hotels every night.");
  s.agent.tool("flight_search", { summary: "Kiwi.com + Travelpayouts. 148 fares BOS to DUB, Sep 19 to 26" });
  s.agent.says("Three that stand out. The nonstop Aer Lingus is $612 a person. Delta and KLM through Amsterdam is cheaper at $489 but it's a longer day. JetBlue and Aer Lingus through JFK lands in between. Every fare here names its source.");
  s.agent.board("flight", "b-flight", flights);
  s.spotlight({ eventType: "board", where: { boardId: "b-flight" } }, {
    target: "board-flight", eyebrow: "Every result names its source",
    title: "One board, two suppliers",
    body: "The free tier searches real fare sources and shows you which one found each price, not a single guess dressed up as an answer.",
    dwellMs: 4500,
  });
  s.client.picks("b-flight", "flight:aerlingus-ns", "The nonstop Aer Lingus", withFlight);
  s.agent.says("Good, locked that in and set the dates around it. Only $200 over the floor for a straight shot instead of a layover.");

  // Act 2 — the proactive save: a flexible-date search finds a cheaper window unasked.
  s.agent.tool("search_flexible_flights", { summary: "Google Travel explore, same route, flexible dates" });
  s.agent.says("One more thing worth knowing: leaving Tuesday, September 22 instead of Saturday the 19th drops the same nonstop to $498 a person. That is $228 saved for the two of you. Want me to move the window?");
  s.client.says("Yes, Tuesday to Tuesday works.");
  s.agent.folio(withNewDates);
  s.spotlight({ eventType: "tool", where: { tool: "search_flexible_flights", phase: "done" } }, {
    target: "tool-search_flexible_flights", eyebrow: "It looks before you ask",
    title: "The cheaper window, offered unasked",
    body: "Nobody asked Voygent to check other dates. It ran the flexible search on its own and found $228 for two, sitting two days later.",
    dwellMs: 4500,
  });

  // Act 3 — Dublin hotels.
  s.agent.tool("hotel_search", { summary: "wise-travel.com, 62 stays, Temple Bar to the Docklands" });
  s.agent.says("For Dublin, three central options, all an easy walk to Temple Bar.");
  s.agent.board("hotel", "b-hotel-dub", hotelsDub);
  s.client.picks("b-hotel-dub", "hotel:wren", "Wren Urban Nest, the walkable one", withDubHotel);
  s.agent.says("Nice pick. Three nights at the Wren, right in the Docklands, an easy walk to everything in the old city.");

  // Act 4 — Killarney hotels, a different supplier.
  s.agent.tool("hotel_search", { summary: "LiteAPI, 38 stays near Killarney National Park" });
  s.agent.says("And in Killarney, three within a short walk of the National Park.");
  s.agent.board("hotel", "b-hotel-kil", hotelsKil);
  s.client.picks("b-hotel-kil", "hotel:arbutus", "The Arbutus, the family-run one", withKilHotel);
  s.agent.says("Four nights at the Arbutus, a few minutes from the lakes and the National Park entrance.");

  // Act 5 — the rental car, with an honest tip instead of an upsell.
  s.agent.tool("car_rental_search", { summary: "Travelpayouts, 24 cars at Dublin Airport" });
  s.agent.says("For the car: most Irish rentals are manual. If neither of you has driven on the left before, the automatic is worth the extra few dollars a day. The roads on the Ring of Kerry get narrow in places, so I'd skip the SUV.");
  s.agent.board("car", "b-car", cars);
  s.client.picks("b-car", "car:corolla-auto", "The automatic Corolla", withCar);
  s.agent.says("Good call. Seven days, picked up the day you leave Dublin and dropped back at the same counter when you fly out.");

  // Act 6 — tours in Dublin and Kerry.
  s.agent.tool("excursion_search", { summary: "Viator + GetYourGuide, Dublin and Kerry" });
  s.agent.says("A couple of things worth booking ahead rather than showing up and hoping: the Guinness Storehouse sells timed slots, and the Gap of Dunloe boat is a small group.");
  s.agent.board("tour", "b-tours", tours);
  s.client.picksMany("b-tours", TOURS_PICKED, "The Guinness Storehouse and the Gap of Dunloe", withDays);
  s.agent.says("Both booked. Day 3 in Dublin and day 5 in Killarney are spoken for, so neither one turns into a walk-up gamble.");

  // Act 7 — free extras: a walking tour, free things to do, and practical tips.
  s.agent.says("A few things that don't cost anything: a self-guided walking tour through the old city (Trinity Library, Dublin Castle, St Patrick's, ending at the Long Hall), a free afternoon at the National Museum, and Muckross House gardens and the lakeshore in Killarney. I've built all three straight into the days. A few practical notes too, pick what's useful.");
  s.agent.tool("get_help", { summary: "Voygent-built: walking tour, free things to do, practical tips" });
  s.agent.board("includes", "b-incl", tipCandidates);
  s.spotlight({ eventType: "board", where: { boardId: "b-incl" } }, {
    target: "board-includes", eyebrow: "Free extras, built by Voygent",
    title: "Nobody sold you these",
    body: "A walking tour, free museum time, a lakeshore afternoon and the practical notes for the week. No commission on any of it, because nobody here is selling anything.",
    dwellMs: 4500,
  });
  s.client.picksMany("b-incl", TIPS_KEPT, "Keep all four", withFreeExtras);
  s.agent.says("That's the whole week: two towns, a car, a couple of tours, and a few things built in for free. Here's the folio, with the total for both of you.");

  // Act 8 — the finale: the traveller's own folio, live total.
  s.client.folioView(finaleBase);
  s.client.folioView(finaleWithInsurance);
  s.spotlight({ interactionKind: "folioview", nth: 2 }, {
    target: "folio-total", eyebrow: "One folio, live total",
    title: "The price answers as you go",
    body: "Toggle travel insurance on and the total moves right there, the same way it will for the car, the hotels and the tours. This is the free tier. Your own run pulls live flights, hotels, cars and tours.",
    dwellMs: 5200,
  });
  s.client.folioView(null);
});

export const meta = {
  id: "ireland",
  title: "A week in Ireland, planned in one chat",
  blurb: "Two travellers plan a week in Ireland in one chat. Live searches across six real sources, a $228 date shift saving, a rental car, and free Voygent built extras.",
  intro: {
    eyebrow: "▶ DIY demo",
    note: "A scripted walk-through of the free tier. Your own run pulls live flights, hotels, cars and tours.",
  },
  endCard: {
    eyebrow: "✓ A week in Ireland, planned in one chat",
    title: "Build your own trip",
    blurb: "Everything here is the free tier. A free account takes about a minute: sign up at voygent.ai, add the Voygent custom connector in claude.ai, and start planning. This walk-through is scripted, a real run pulls live results.",
  },
  recap: [
    "148 fares, sources named",
    "$228 saved by leaving three days later",
    "two towns, one rental car",
    "a free walking tour, built for you",
    "one folio, live total",
  ],
} as const;
