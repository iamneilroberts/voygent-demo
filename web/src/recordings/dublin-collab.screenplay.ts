import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioDay, FolioInclude } from "../../../shared/events";
import type { ReelClientSession } from "../lib/recording";

// "Dublin, built together" — the full collaboration reel (R5). One honest thread that
// walks an advisor, a traveler, and Voygent through a whole trip: a loose brief that
// firms up, flights the traveler picks, a hotel shortlist the advisor curates, a
// day-by-day plan, an advisor refinement, a "what's included" pass, then the folio sent
// to the traveler. The traveler opens it in their own window, picks one of the three
// hotels, toggles an add-on (the price recalcs live), and asks for one change. That
// routes back, Voygent makes it, and the trip is done.
//
// Everything here is an AUTHORED fixture — a scripted walk-through of the workflow. The
// intro and end card say so; a real Voygent run pulls live flights and hotels.
//
// Cast: Voygent = s.agent (prose / tools / boards / folio). Advisor = s.advisor
// (terracotta) — drives the chat, curates, refines, sends. Traveler = s.client
// (slate-teal) — picks the flight, then acts in their own client window + leaves a note.

// ── Flights: six real-looking options, MOB→DUB, Oct 4-11. ────────────────────────────
const flights: BoardCandidate[] = [
  { id: "serp:70wngy", title: "Aer Lingus · MOB→DUB", price: "$3,180", meta: "1 stop · Economy · 12h 05m",  summary: "Aer Lingus MOB→DUB $3,180" },
  { id: "serp:d1",     title: "Delta · MOB→DUB",      price: "$2,980", meta: "2 stops · Economy · 14h 40m", summary: "Delta MOB→DUB $2,980" },
  { id: "serp:u1",     title: "United · MOB→DUB",      price: "$3,426", meta: "1 stop · Economy · 11h 20m",  summary: "United MOB→DUB $3,426" },
  { id: "serp:af1",    title: "Air France · MOB→DUB",  price: "$3,290", meta: "1 stop (CDG) · Economy · 13h 30m", summary: "Air France MOB→DUB $3,290" },
  { id: "serp:aa1",    title: "American · MOB→DUB",    price: "$3,540", meta: "1 stop · Economy · 12h 45m",  summary: "American MOB→DUB $3,540" },
  { id: "serp:ba1",    title: "British Airways · MOB→DUB", price: "$3,610", meta: "1 stop (LHR) · Economy · 13h 10m", summary: "British Airways MOB→DUB $3,610" },
];

// ── Hotels: four mid-range options; the advisor shortlists the three non-chain ones. ──
const hotels: BoardCandidate[] = [
  { id: "serp:h1", title: "The Dean Dublin", price: "$168/night", meta: "Camden St · 4★ · boutique",   summary: "The Dean Dublin $168/night" },
  { id: "serp:h2", title: "Beckett Locke",   price: "$137/night", meta: "Docklands · aparthotel",       summary: "Beckett Locke $137/night" },
  { id: "serp:h3", title: "The Mayson",       price: "$159/night", meta: "North Quays · waterfront",      summary: "The Mayson $159/night" },
  { id: "serp:h4", title: "Hilton Garden Inn", price: "$182/night", meta: "O'Connell St · chain",         summary: "Hilton Garden Inn $182/night" },
];
const HOTEL_SHORTLIST = ["serp:h1", "serp:h2", "serp:h3"]; // the three the advisor sends the traveler

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

// ── The week, day by day. Activities favour history and stay step-free per the brief. ──
const days: FolioDay[] = [
  { title: "Day 1 · Arrive in Dublin", date: "Sat Oct 4", activities: [{ name: "Evening stroll along the Liffey" }], dining: [{ name: "The Woollen Mills", cuisine: "Irish" }] },
  { title: "Day 2 · History in the old city", date: "Sun Oct 5", activities: [{ name: "Trinity College & the Book of Kells" }, { name: "EPIC: the Irish emigration museum" }], dining: [{ name: "Fade Street Social", cuisine: "Modern Irish" }] },
  { title: "Day 3 · Open day", date: "Mon Oct 6", activities: [{ name: "Free morning in Temple Bar" }], dining: [{ name: "Klaw", cuisine: "Seafood" }] },
  { title: "Day 4 · The coast, gently", date: "Tue Oct 7", activities: [{ name: "Howth village & harbour stroll" }], dining: [{ name: "Octopussys Seafood Tapas", cuisine: "Seafood" }] },
  { title: "Day 5 · Temple Bar evening", date: "Wed Oct 8", activities: [{ name: "Chester Beatty Library (step-free)" }], dining: [{ name: "The Boxty House", cuisine: "Irish" }] },
  { title: "Day 6 · Easy last day", date: "Thu Oct 9", activities: [{ name: "National Museum of Ireland" }], dining: [{ name: "Glovers Alley", cuisine: "Modern Irish" }] },
];

// ── Folio progression. Hotels are NOT committed until the traveler picks one in their
//    window (R2 shortlist model), so a single hotel only lands in the FINAL folio — which
//    keeps the chat folio honest and the "no flicker" invariant intact. ────────────────
const base: FolioData     = { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [] };
const withFlight: FolioData = { ...base, flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180", date: "Oct 4-11", stops: 1 }] };
const withDays: FolioData   = { ...withFlight, days };
const edited: FolioData     = { ...withDays, days: days.map((d, i) => i === 2 ? { ...d, activities: [{ name: "Cliffs of Moher day trip" }] } : d) };
const withIncludes: FolioData = { ...edited, includes: chosenIncludes };
const finalFolio: FolioData = {
  ...withIncludes,
  hotels: [{ name: "The Dean Dublin", area: "Camden St", stars: 4, nights: 7, perNight: "$168" }],
  days: withIncludes.days!.map((d, i) => i === 4 ? { ...d, activities: [...d.activities, { name: "Temple Bar food tour" }] } : d),
};

// ── The traveler's window (R4). Hotel prices are the shortlist × 7 nights, so they match
//    the hotel board the advisor sent. The total = flights + chosen hotel + activities +
//    toggled add-ons; consecutive snapshots animate the recalc. ─────────────────────────
const cvHotels = [
  { id: "serp:h1", name: "The Dean Dublin", price: 168 * 7, meta: "$168/night · Camden St" },
  { id: "serp:h2", name: "Beckett Locke",   price: 137 * 7, meta: "$137/night · Docklands" },
  { id: "serp:h3", name: "The Mayson",       price: 159 * 7, meta: "$159/night · North Quays" },
];
const cvBase: ReelClientSession = {
  open: true,
  url: "voygent.app/t/dublin",
  tripTitle: "A week in Dublin · for two",
  flightsPrice: 3180,
  activitiesPrice: 740,
  hotels: cvHotels,
  pickedHotelId: null,
  addons: [
    { id: "transfers", label: "Private airport transfers", price: 120, on: false },
    { id: "insurance", label: "Travel insurance (2 travellers)", price: 210, on: false },
  ],
  question: null,
  progress: 0.45,
};
const cvPicked: ReelClientSession  = { ...cvBase, pickedHotelId: "serp:h1", progress: 0.8 };
const cvAddon: ReelClientSession   = { ...cvPicked, addons: cvBase.addons.map((a) => a.id === "transfers" ? { ...a, on: true } : a), progress: 0.92 };
const cvNote: ReelClientSession    = { ...cvAddon, question: "Could we add a food tour our last evening? We loved the one in Lisbon.", progress: 1 };
const cvClosed: ReelClientSession  = { ...cvNote, open: false };

export const dublinCollab = screenplay({ trip: "Dublin · collab", skin: "claude" }, (s) => {
  // Act 1 — Intake: a loose brief that firms up. The advisor forgets the dates; Voygent
  // asks; the advisor adds one more requirement on the way back.
  s.advisor.says("I've got clients who want to do Dublin this fall. Can you help me put a week together?");
  s.agent.tool("start_trip_interview", { summary: "New trip · Dublin · gathering the brief" });
  s.agent.says("Happy to. Who's travelling, and roughly when?");
  s.advisor.says("Two of them, a couple. Mid-range budget, and they love food and a bit of coastline.");
  s.agent.says("Got it. What dates are we working with?");
  s.advisor.says("October 4 to 11. One more thing — keep them central, they don't want to be commuting in and out.");
  s.agent.tool("save_trip", { summary: "Dublin · Oct 4-11 · 2 travelers · central, mid-range" });
  s.agent.says("Perfect. Dublin, October 4 to 11, two travellers, mid-range, central, food and coast. Setting that up now.");
  s.spotlight({ eventType: "tool", where: { tool: "save_trip" }, nth: 1 }, { target: "tool-save_trip", eyebrow: "The brief", title: "A loose ask, made concrete", body: "The advisor starts with a sentence and a missing date. Voygent asks for what it needs, then opens a trip to work in." });

  // Act 2 — Flights: search, a brief rec, the traveler picks their own flight.
  s.agent.tool("flight_search", { summary: "MOB→DUB · Oct 4-11 · 2 travelers" });
  s.agent.says("Six that fit the dates, Mobile to Dublin. Delta is cheapest but it's two stops and a long day. The Aer Lingus is the best value: one stop, shortest of the one-stop options, and only $200 over the floor.");
  s.agent.board("flight", "b-flight", flights);
  s.client.picks("b-flight", "serp:70wngy", "Aer Lingus · MOB→DUB · $3,180", withFlight);
  s.agent.says("Good call. Added it and locked the dates around it.");
  s.spotlight({ interactionKind: "pick", nth: 1 }, { target: "board-flight", eyebrow: "The traveller picks", title: "Their flight, their call", body: "Voygent lays out six and says which it would take and why. The traveller weighs them and chooses; the trip builds around it." });

  // Act 3 — Hotels: the advisor curates a shortlist for the traveler to choose from later.
  s.agent.tool("hotel_search", { summary: "Dublin · 7 nights · central · mid-range" });
  s.agent.says("And places to stay, all central and in range. The Hilton is the only big chain in the set.");
  s.agent.board("hotel", "b-hotel", hotels);
  s.advisor.picksMany("b-hotel", HOTEL_SHORTLIST, "Shortlisted the Dean, Beckett Locke and the Mayson for them");
  s.agent.says("Three good ones, no chains. I'll put all three in front of the travellers so they can pick the feel they want.");
  s.spotlight({ interactionKind: "pick", nth: 2 }, { target: "board-hotel", eyebrow: "The advisor curates", title: "A shortlist, not a single pick", body: "The advisor keeps three and drops the chain. The traveller will choose between them in their own view, with live pricing." });

  // Act 4 — Itinerary: Voygent assembles the week and validates it against the brief.
  s.agent.tool("excursion_search", { summary: "Dublin + day trips · history-leaning" });
  s.agent.tool("validate_trip", { summary: "Goals met · pacing · step-free checks" });
  s.agent.says("Here's the week, day by day, with food worked in. I kept it history-leaning and stayed away from anything strenuous.");
  s.agent.folio(withDays);
  s.spotlight({ eventType: "folio", nth: 2 }, { target: "folio-days", eyebrow: "The build", title: "Day by day", body: "Voygent assembles the week — sights, food, and the down moments — into one living folio, then validates it against the brief." });

  // Act 5 — Refine: the advisor edits a single day in place, with a note on why.
  s.advisor.edits("days[2].activities[0]", { was: "Free morning in Temple Bar", now: "Cliffs of Moher day trip", tag: "Advisor edited" }, edited);
  s.advisor.comments("days[3]", "Swapped the Howth cliff path for the village and harbour walk — keeping it step-free for them.", "thread-access");
  s.agent.says("Updated Day 3 with the Cliffs of Moher day trip, and noted the Day 4 swap. The coach handles the driving so it stays easy.");
  s.spotlight({ interactionKind: "edit", nth: 1 }, { target: "folio-day-2", eyebrow: "The advisor's touch", title: "Refined, not regenerated", body: "The advisor changes one day in place and leaves a note. The edit is attributed; the rest of the week is untouched." });

  // Act 6 — What's included: a quick chooser the advisor curates into the folio.
  s.agent.tool("get_help", { summary: "Trip extras · tips, customs, weather" });
  s.agent.says("Before it goes out, a few extras I can fold in — weather, getting around, customs, apps. Pick what's useful.");
  s.agent.board("includes", "b-incl", includeCandidates);
  s.advisor.picksMany("b-incl", INCLUDE_KEEP, "Keep weather, transit, customs and apps");
  s.agent.folio(withIncludes);
  s.spotlight({ interactionKind: "pick", nth: 3 }, { target: "board-includes", eyebrow: "The finishing pass", title: "What to include", body: "The advisor folds the useful extras into the folio so the travellers get the practical stuff, not boilerplate." });

  // Act 7 — Send: the advisor writes a line and sends the folio to the travelers.
  s.advisor.sendsToClient({ subject: "Your Dublin trip is ready to look over", reply: "Pick your hotel and tell me what you think — no rush." });
  s.spotlight({ interactionKind: "handoff", nth: 1 }, { target: "handoff-notice", eyebrow: "Out to the travellers", title: "Sent for review", body: "The advisor adds a personal line and sends. The folio goes to the travellers by email; their reply routes straight back to Voygent. Simulated here." });

  // Act 8 — The traveler's window: they pick a hotel and toggle an add-on; the price
  // recalcs live; then they leave a note and send it back.
  s.client.view(cvBase);
  s.client.view(cvPicked);
  s.client.view(cvAddon);
  s.client.view(cvNote);
  s.client.view(cvClosed);
  s.spotlight({ interactionKind: "clientview", nth: 1 }, { target: "client-view", eyebrow: "What the traveller sees", title: "Their view, their price", body: "The travellers open the folio in their own window, pick one of the three hotels, and toggle an add-on. The total recalculates live as they go." });

  // Act 9 — Back in the thread: the note lands, Voygent makes the change, the trip is done.
  s.advisor.says("They wrote back — they picked the Dean, and they'd love a food tour the last evening, like the one they did in Lisbon.");
  s.client.comments("days[4]", "Could we add a food tour our last evening? We loved the one in Lisbon.", "thread-food");
  s.agent.tool("excursion_search", { summary: "Temple Bar food tour · evening" });
  s.agent.says("Picking up the note. The Dean is locked in, and I've added a Temple Bar food tour to the last evening — checked against dinner, no conflict.");
  s.agent.folio(finalFolio);
  s.spotlight({ interactionKind: "comment", nth: 2 }, { target: "comment-thread-food", eyebrow: "Shaped together", title: "The traveller's note becomes the plan", body: "Their choice and their one request route back into the same thread. Voygent makes the change and the trip is done — built by all three." });
});
