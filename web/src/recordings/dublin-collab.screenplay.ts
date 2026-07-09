import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioDay, FolioInclude } from "../../../shared/events";
import type { ReelHotelOption } from "../lib/recording";

// Chapter 1 · "Plan the trip" (QA4 restructure, 2026-07-09). The advisor and Voygent
// build the whole Dublin week INSIDE the chat: a loose brief that firms up, flights the
// advisor picks, a hotel shortlist for the travellers to choose from later, the
// day-by-day plan, Voygent flagging the open day and selling a tour into it, an
// in-place advisor edit, the "what's included" pass, the advisor's PROJECTED commission
// itemized on the folio, and the send. What the travellers do with it is chapter 2
// (client window only); the reply, the booking and the earned commission are chapter 3.
//
// Everything here is an AUTHORED fixture — a scripted walk-through of the workflow. The
// intro and end card say so; a real Voygent run pulls live flights and hotels.
//
// Cast: Voygent = s.agent (prose / tools / boards / folio). Advisor = s.advisor
// (terracotta) — drives the chat, curates, refines, sends.

// ── Flights: six options, MOB→DUB, Oct 4-11. Each carries full routing (legs +
//    layovers + aircraft) that expands on the board, and a Voygent editorial badge. ────
const flights: BoardCandidate[] = [
  {
    id: "serp:70wngy", title: "Aer Lingus · MOB→DUB", price: "$3,180", badge: "Best value",
    meta: "1 stop (JFK) · Economy · 12h 05m", summary: "Aer Lingus MOB→DUB $3,180",
    legs: [
      { from: "MOB", to: "JFK", depart: "3:30p", arrive: "6:45p", carrier: "JetBlue", flightNo: "B6 1402", aircraft: "A220-300", duration: "3h 15m", layoverAfter: "2h 10m" },
      { from: "JFK", to: "DUB", depart: "8:55p", arrive: "8:35a +1", carrier: "Aer Lingus", flightNo: "EI 106", aircraft: "A330-300", duration: "6h 40m" },
    ],
  },
  {
    id: "serp:d1", title: "Delta · MOB→DUB", price: "$2,980", badge: "Cheapest",
    meta: "2 stops (ATL, JFK) · Economy · 14h 40m", summary: "Delta MOB→DUB $2,980",
    legs: [
      { from: "MOB", to: "ATL", depart: "5:55a", arrive: "7:00a", carrier: "Delta", flightNo: "DL 1533", aircraft: "717-200", duration: "1h 05m", layoverAfter: "1h 30m" },
      { from: "ATL", to: "JFK", depart: "8:30a", arrive: "10:50a", carrier: "Delta", flightNo: "DL 2210", aircraft: "757-200", duration: "2h 20m", layoverAfter: "3h 45m" },
      { from: "JFK", to: "DUB", depart: "2:35p", arrive: "3:25a +1", carrier: "Delta", flightNo: "DL 410", aircraft: "A330-200", duration: "6h 50m" },
    ],
  },
  {
    id: "serp:u1", title: "United · MOB→DUB", price: "$3,426", badge: "Quickest",
    meta: "1 stop (EWR) · Economy · 11h 20m", summary: "United MOB→DUB $3,426",
    legs: [
      { from: "MOB", to: "EWR", depart: "12:40p", arrive: "4:30p", carrier: "United", flightNo: "UA 1623", aircraft: "737-800", duration: "2h 50m", layoverAfter: "1h 25m" },
      { from: "EWR", to: "DUB", depart: "5:55p", arrive: "6:00a +1", carrier: "United", flightNo: "UA 23", aircraft: "757-200", duration: "6h 30m" },
    ],
  },
  {
    id: "serp:af1", title: "Air France · MOB→DUB", price: "$3,290",
    meta: "2 stops (ATL, CDG) · Economy · 14h 05m", summary: "Air France MOB→DUB $3,290",
    legs: [
      { from: "MOB", to: "ATL", depart: "5:55a", arrive: "7:00a", carrier: "Delta", flightNo: "AF 8501", aircraft: "717-200", duration: "1h 05m", layoverAfter: "2h 00m" },
      { from: "ATL", to: "CDG", depart: "9:00a", arrive: "11:30p", carrier: "Air France", flightNo: "AF 685", aircraft: "A350-900", duration: "8h 30m", layoverAfter: "1h 40m" },
      { from: "CDG", to: "DUB", depart: "1:10p +1", arrive: "2:45p +1", carrier: "Air France", flightNo: "AF 1216", aircraft: "A320", duration: "1h 35m" },
    ],
  },
  {
    id: "serp:aa1", title: "American · MOB→DUB", price: "$3,540",
    meta: "1 stop (PHL) · Economy · 12h 45m", summary: "American MOB→DUB $3,540",
    legs: [
      { from: "MOB", to: "PHL", depart: "1:05p", arrive: "5:25p", carrier: "American", flightNo: "AA 1622", aircraft: "A319", duration: "2h 40m", layoverAfter: "1h 50m" },
      { from: "PHL", to: "DUB", depart: "7:15p", arrive: "6:50a +1", carrier: "American", flightNo: "AA 722", aircraft: "A330-200", duration: "6h 35m" },
    ],
  },
  {
    id: "serp:ba1", title: "British Airways · MOB→DUB", price: "$3,610",
    meta: "2 stops (CLT, LHR) · Economy · 13h 10m", summary: "British Airways MOB→DUB $3,610",
    legs: [
      { from: "MOB", to: "CLT", depart: "2:15p", arrive: "4:55p", carrier: "American", flightNo: "BA 6128", aircraft: "A320", duration: "1h 40m", layoverAfter: "1h 30m" },
      { from: "CLT", to: "LHR", depart: "6:25p", arrive: "7:50a +1", carrier: "British Airways", flightNo: "BA 216", aircraft: "777-200", duration: "7h 25m", layoverAfter: "2h 05m" },
      { from: "LHR", to: "DUB", depart: "9:55a +1", arrive: "11:20a +1", carrier: "British Airways", flightNo: "BA 832", aircraft: "A320", duration: "1h 25m" },
    ],
  },
];

// ── Hotels: four mid-range options with Voygent badges; the advisor shortlists the
//    three non-chain ones (drops the Hilton). ──────────────────────────────────────────
const hotels: BoardCandidate[] = [
  { id: "serp:h1", title: "The Dean Dublin", price: "$168/night", badge: "Best location", meta: "Camden St · 4★ · boutique",   summary: "The Dean Dublin $168/night", commission: 176, commissionPct: 15 },
  { id: "serp:h2", title: "Beckett Locke",   price: "$137/night", badge: "Best value",    meta: "Docklands · aparthotel",       summary: "Beckett Locke $137/night", commission: 144, commissionPct: 15 },
  { id: "serp:h3", title: "The Mayson",       price: "$159/night", badge: "Waterfront",    meta: "North Quays · waterfront",      summary: "The Mayson $159/night", commission: 167, commissionPct: 15 },
  { id: "serp:h4", title: "Hilton Garden Inn", price: "$182/night",                        meta: "O'Connell St · chain",         summary: "Hilton Garden Inn $182/night" },
];
const HOTEL_SHORTLIST = ["serp:h1", "serp:h2", "serp:h3"]; // the three the advisor sends the travellers

// The shortlist as the CLIENT's choice (chapter 2's folio window options): per-night ×
// 7 nights, so the prices reconcile with the hotel board above. Exported for ch2.
export const shortlistOptions: ReelHotelOption[] = [
  { id: "serp:h1", name: "The Dean Dublin", price: 168 * 7, meta: "$168/night · Camden St" },
  { id: "serp:h2", name: "Beckett Locke",   price: 137 * 7, meta: "$137/night · Docklands" },
  { id: "serp:h3", name: "The Mayson",       price: 159 * 7, meta: "$159/night · North Quays" },
];

// ── Tours for the open day (QA4: the gap-fill beat lives in ch1 now — planning is
//    where the advisor sells the empty day). Commission is on the board, advisor view. ─
const tours: BoardCandidate[] = [
  { id: "tour:cliffs", title: "Cliffs of Moher & Galway day trip", price: "$142 pp", badge: "Best fit",
    meta: "Day 3 · 8h · coach + easy walking", summary: "Cliffs of Moher day trip $142", commission: 43, commissionPct: 15 },
  { id: "tour:kilmainham", title: "Kilmainham Gaol & Museum tour", price: "$58 pp", badge: "Sells out",
    meta: "2h 30m · small group", summary: "Kilmainham Gaol $58", commission: 17, commissionPct: 15 },
  { id: "tour:whiskey", title: "Dublin whiskey tasting walk", price: "$95 pp",
    meta: "Evening · 3h", summary: "Whiskey walk $95", commission: 23, commissionPct: 12 },
];

// ── "What's included" candidates; the advisor keeps four. ─────────────────────────────
const includeCandidates: BoardCandidate[] = [
  { id: "inc:weather", title: "Typical October weather", meta: "50-60°F · pack layers + a rain shell", summary: "October weather" },
  { id: "inc:transit", title: "Getting around Dublin",   meta: "Leap Card · the centre is walkable",    summary: "Getting around" },
  { id: "inc:customs", title: "Local customs & tipping", meta: "~10% in restaurants · rounds at the pub", summary: "Customs & tipping" },
  { id: "inc:apps",    title: "Handy apps",              meta: "Free Now · Dublin Bus · Revolut",         summary: "Handy apps" },
  { id: "inc:pack",    title: "Packing notes",           meta: "Comfortable shoes · a small umbrella",    summary: "Packing notes" },
];
const INCLUDE_KEEP = ["inc:weather", "inc:transit", "inc:customs", "inc:apps"];
const chosenIncludes: FolioInclude[] = [
  { key: "inc:weather", title: "Typical October weather", body: "Highs around 55°F, a few showers most days. Layers and a light rain shell cover it." },
  { key: "inc:transit", title: "Getting around Dublin",   body: "The centre is walkable. A Leap Card covers buses and the Luas tram for anything further out." },
  { key: "inc:customs", title: "Local customs & tipping", body: "About 10% in restaurants if service isn't already added; no need to tip at the bar." },
  { key: "inc:apps",    title: "Handy apps",              body: "Free Now for taxis, Dublin Bus for live times, Revolut if they'd rather not carry cash." },
];

// ── The week, day by day. Day 3 lands OPEN (Voygent flags it and offers tours); day 4's
//    first draft has the cliff path, which the advisor edits to the step-free walk. ─────
const days: FolioDay[] = [
  { title: "Day 1 · Arrive in Dublin", date: "Sat Oct 4", activities: [{ name: "Evening stroll along the Liffey" }], dining: [{ name: "The Woollen Mills", cuisine: "Irish" }] },
  { title: "Day 2 · History in the old city", date: "Sun Oct 5", activities: [{ name: "Trinity College & the Book of Kells" }, { name: "EPIC: the Irish emigration museum" }], dining: [{ name: "Fade Street Social", cuisine: "Modern Irish" }] },
  { title: "Day 3 · Open day", date: "Mon Oct 6", activities: [{ name: "Free morning in Temple Bar" }], dining: [{ name: "Klaw", cuisine: "Seafood" }] },
  { title: "Day 4 · The coast, gently", date: "Tue Oct 7", activities: [{ name: "Howth cliff path walk" }], dining: [{ name: "Octopussys Seafood Tapas", cuisine: "Seafood" }] },
  { title: "Day 5 · Temple Bar evening", date: "Wed Oct 8", activities: [{ name: "Chester Beatty Library (step-free)" }], dining: [{ name: "The Boxty House", cuisine: "Irish" }] },
  { title: "Day 6 · Easy last day", date: "Thu Oct 9", activities: [{ name: "National Museum of Ireland" }], dining: [{ name: "Glovers Alley", cuisine: "Modern Irish" }] },
];

// ── Folio progression. Hotels are NOT committed in this chapter — the travellers pick
//    one of the shortlist in THEIR window (chapter 2), and the advisor locks it in
//    chapter 3. That keeps the chat folio honest (no flicker, nothing pre-empted). ─────
const base: FolioData     = { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [] };
const withFlight: FolioData = { ...base, flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180", date: "Oct 4-11", stops: 1 }] };
const withDays: FolioData   = { ...withFlight, days };
const withTour: FolioData   = { ...withDays, days: days.map((d, i) => i === 2 ? { ...d, activities: [{ name: "Cliffs of Moher day trip" }] } : d) };
const withEdit: FolioData   = { ...withTour, days: withTour.days!.map((d, i) => i === 3 ? { ...d, activities: [{ name: "Howth village & harbour stroll" }] } : d) };
const withIncludes: FolioData = { ...withEdit, includes: chosenIncludes };

// The folio as it goes OUT to the travellers (chapters 2 and 3 start from this).
export const sentFolio: FolioData = { ...withIncludes };

// The advisor's plan-stage review: the same folio with the PROJECTED commission
// itemized. Nothing is sold yet, so the kind is "projected", never "booked". Numbers
// reconcile with the boards: Dean $176 (15%), Cliffs $43 on $284 for two (15%); the
// optional extras are listed at what they are worth if the travellers add them.
const advisorReview: FolioData = {
  ...withIncludes,
  commissionsKind: "projected",
  commissions: [
    { label: "Hotel · 7 nights (their pick of 3)", amount: 176, pct: 15 },
    { label: "Cliffs of Moher & Galway day trip", amount: 43, pct: 15 },
    { label: "Private airport transfers", amount: 18, pct: 15, potential: true },
    { label: "Travel insurance", amount: 63, pct: 30, potential: true },
  ],
};

export const dublinCollab = screenplay({ trip: "Dublin · plan", skin: "claude" }, (s) => {
  // Act 0 — orientation. Binds to the very first frame ("b0" = the opening line) and
  // spotlights the navigation cluster: how Read/1x/2x work and where the chapters live.
  s.advisor.says("I've got clients who want to do Dublin this fall. Can you help me put a week together?");
  s.spotlight({ beatId: "b0" }, {
    target: "reel-controls", eyebrow: "How this demo works",
    title: "Three short demos, at your pace",
    body: "You are watching demo 1 of 3. In Read mode it stops at every note like this one until you click Continue. Want it to run on its own? Pick 1x or 2x up here. The numbered chips jump between the demos any time.",
    variant: "hero", dwellMs: 7000,
  });

  // Act 1 — Intake: a loose brief that firms up. The advisor forgets the dates; Voygent
  // asks; the advisor adds one more requirement on the way back.
  s.agent.tool("start_trip_interview", { summary: "New trip · Dublin · gathering the brief" });
  s.agent.says("Happy to. Who's travelling, and roughly when?");
  s.advisor.says("Two of them, a couple. Mid-range budget, and they love food and a bit of coastline.");
  s.agent.says("Got it. What dates are we working with?");
  s.advisor.says("October 4 to 11. One more thing, keep them central. They don't want to be commuting in and out.");
  s.agent.tool("save_trip", { summary: "Dublin · Oct 4-11 · 2 travelers · central, mid-range" });
  s.agent.says("Perfect. Dublin, October 4 to 11, two travellers, mid-range, central, food and coast. Setting that up now.");
  s.spotlight({ eventType: "tool", where: { tool: "save_trip" }, nth: 2 }, { target: "tool-save_trip", eyebrow: "The brief", title: "It starts with a rough idea", body: "The advisor gives a loose brief and forgets the dates. Voygent asks for what it needs and opens a trip to work in." });

  // Act 2 — Flights: search, a brief rec, the advisor picks.
  s.agent.tool("flight_search", { summary: "MOB→DUB · Oct 4-11 · 2 travelers" });
  s.agent.says("Six that fit the dates, Mobile to Dublin. Delta is the cheapest but it's two stops and a long day. United is the quickest at 11h 20. I'd flag the Aer Lingus as best value: one stop, and only $200 over the floor. Tap any of them for the full routing.");
  s.agent.board("flight", "b-flight", flights);
  s.advisor.picks("b-flight", "serp:70wngy", "Aer Lingus · MOB→DUB · $3,180", withFlight);
  s.agent.says("Good call. Added it and locked the dates around it.");
  s.spotlight({ interactionKind: "pick", nth: 1 }, { target: "board-flight", eyebrow: "Voygent recommends", title: "Options, with a recommendation", body: "Voygent tags each flight with why it stands out, like best value or quickest. Open any of them for the full routing and aircraft. The advisor makes the call." });

  // Act 3 — Hotels: the advisor curates a shortlist for the travellers to choose from later.
  s.agent.tool("hotel_search", { summary: "Dublin · 7 nights · central · mid-range" });
  s.agent.says("And places to stay, all central and in range. The Hilton is the only big chain in the set.");
  s.agent.board("hotel", "b-hotel", hotels);
  s.advisor.picksMany("b-hotel", HOTEL_SHORTLIST, "Shortlisted the Dean, Beckett Locke and the Mayson for them");
  s.agent.says("Three good ones, no chains. I'll put all three in front of the travellers so they can pick the feel they want.");
  s.spotlight({ interactionKind: "pick", nth: 2 }, { target: "board-hotel", eyebrow: "The advisor curates", title: "The advisor builds a shortlist", body: "The advisor keeps three hotels and drops the big chain. The travellers will choose the one they want later, in their own view, with live pricing. That's demo 2." });

  // Act 4 — Itinerary: Voygent assembles the week and validates it against the brief.
  s.agent.tool("excursion_search", { summary: "Dublin + day trips · history-leaning" });
  s.agent.tool("validate_trip", { summary: "Goals met · pacing · step-free checks" });
  s.agent.says("Here's the week, day by day, with food worked in. I kept it history-leaning and stayed away from anything strenuous.");
  s.agent.folio(withDays);
  s.spotlight({ eventType: "folio", nth: 2 }, { target: "folio-days", eyebrow: "The build", title: "The week, day by day", body: "Voygent lays out the whole week with sights, food and downtime, then checks it against the brief." });
  // Engineering peek: the real tool sequence PLUS representative run telemetry (QA4) —
  // cost, tokens, cache savings — sized like a real run and labelled as representative.
  s.agent.engPanel({
    open: true,
    tools: [
      { name: "start_trip_interview", status: "done" },
      { name: "save_trip", status: "done" },
      { name: "flight_search", status: "done" },
      { name: "hotel_search", status: "done" },
      { name: "excursion_search", status: "done" },
      { name: "validate_trip", status: "done" },
    ],
    metrics: [
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Tokens in / out", value: "48.2k / 3.9k" },
      { label: "Served from cache", value: "41.5k (86%)" },
      { label: "Saved by caching", value: "$0.11" },
      { label: "Cost so far", value: "$0.19", accent: true },
    ],
    footnote: "Representative numbers for a run like this one. The interactive demo meters your own run live.",
  });
  s.spotlight({ interactionKind: "engpanel", nth: 1 }, { target: "eng-panel", eyebrow: "Under the hood", title: "Real tool calls, metered", body: "Behind the chat, Voygent calls real search tools in order, and every run is metered: about 48k tokens in, 86% of them served from cache, 19 cents so far. Every price on the board has a source, not a guess." });
  s.agent.engPanel(null);

  // Act 4.5 — The open day (moved here from the old chapter 2: gaps belong in planning).
  s.agent.says("Day 3 is still open. Here are three tours that fit the brief and the season, with your commission on each.");
  s.agent.board("tour", "b-tours", tours);
  s.advisor.picks("b-tours", "tour:cliffs", "Cliffs of Moher and Galway on day 3.", withTour);
  s.agent.says("Added. Day 3 is the Cliffs of Moher and Galway day trip, $142 a person, $43 commission on this booking. The coach does the driving, so it stays easy.");
  s.spotlight({ interactionKind: "pick", nth: 3 }, { target: "board-tour", eyebrow: "Empty days are money", title: "Voygent sees the empty day and suggests profitable tours", body: "Day 3 had nothing sold into it. Voygent flags it and pulls real, commissionable tours that fit the brief. The advisor clicks one and it is in the plan." });

  // Act 5 — Refine: the advisor edits a single day in place, with a note on why.
  s.advisor.edits("days[3].activities[0]", { was: "Howth cliff path walk", now: "Howth village & harbour stroll", tag: "Advisor edited" }, withEdit);
  s.advisor.comments("days[3]", "Swapped the cliff path for the village and harbour walk, to keep day 4 step-free for them.", "thread-access");
  s.agent.says("Updated day 4 to the village and harbour walk, and kept your note on the day so the reason travels with the plan.");
  s.spotlight({ interactionKind: "edit", nth: 1 }, { target: "folio-day-3", eyebrow: "The advisor's touch", title: "The advisor edits one day", body: "The advisor just retyped the line, the way you'd fix a document. No prompt, no paragraph. The change is marked as hers and the rest of the week stays put." });

  // Act 6 — What's included: a quick chooser the advisor curates into the folio.
  s.agent.tool("get_help", { summary: "Trip extras · tips, customs, weather" });
  s.agent.says("Before it goes out, here are a few extras I can fold in: weather, getting around, customs, apps. Pick what's useful.");
  s.agent.board("includes", "b-incl", includeCandidates);
  s.advisor.picksMany("b-incl", INCLUDE_KEEP, "Keep weather, transit, customs and apps");
  s.agent.folio(withIncludes);
  s.spotlight({ interactionKind: "pick", nth: 4 }, { target: "board-includes", eyebrow: "The finishing pass", title: "What to include", body: "Weather, getting around, tipping, handy apps. The advisor typed none of it. She just chose which of the ready-written extras are worth sending." });

  // Act 7 — The advisor's review: projected commission, itemized on the folio.
  s.agent.says("Before you send it, here's where the trip stands for you.");
  s.agent.folio(advisorReview);
  s.spotlight({ eventType: "folio", nth: 6 }, { target: "trip-commission", eyebrow: "For the advisor", title: "Your commission, projected", body: "Every component shows its cut: the hotel, the Cliffs day trip, about $219 as proposed. Voygent also shows what the optional extras are worth if the travellers add them, and keeps it all current as the trip changes." });

  // Act 8 — Send: the advisor adds a note and sends the folio to the travellers.
  s.advisor.says("Looks right. I'll add a quick note for them: pick your hotel and tell me what you think, no rush.");
  s.advisor.sendsToClient({ subject: "Your Dublin trip is ready to look over" });
  s.spotlight({ interactionKind: "handoff", nth: 1 }, { target: "handoff-notice", eyebrow: "Out to the travellers", title: "Sent for review", body: "The advisor adds a note and sends the folio. The travellers get it by email and can reply straight back into Voygent. Simulated here. What they see when they open it is demo 2." });
});
