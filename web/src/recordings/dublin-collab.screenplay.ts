import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData, FolioDay } from "../../../shared/events";

// "Dublin, built together" — the full multi-act collaboration reel (P4). One honest
// story of advisor + traveler + agent shaping a week in Dublin in a single thread:
// intake → flights → hotels → itinerary → an advisor refinement → sent to the client
// and back → the client's note lands and the trip is done. The flights, hotels and
// day plan are AUTHORED fixtures (a scripted walk-through of the collaboration
// workflow) — the intro/end card say so; a real Voygent run pulls live data.
//
// Cast: agent (prose), advisor (terracotta), client/traveler (slate-teal). The
// traveler picks both flight and hotel; the advisor curates (edit) and routes (send).

const flights: BoardCandidate[] = [
  { id: "serp:70wngy", title: "Aer Lingus · MOB→DUB", price: "$3,180", meta: "1 stop · Economy · 12h 05m", summary: "Aer Lingus MOB→DUB $3,180" },
  { id: "serp:u1",     title: "United · MOB→DUB",      price: "$3,426", meta: "1 stop · Economy · 11h 20m", summary: "United MOB→DUB $3,426" },
  { id: "serp:d1",     title: "Delta · MOB→DUB",       price: "$2,980", meta: "2 stops · Economy · 14h 40m", summary: "Delta MOB→DUB $2,980" },
];

const hotels: BoardCandidate[] = [
  { id: "serp:h1", title: "The Dean Dublin",  price: "$168/night", meta: "Camden St · 4★ · boutique",   summary: "The Dean Dublin $168/night" },
  { id: "serp:h2", title: "Beckett Locke",    price: "$137/night", meta: "Docklands · aparthotel",       summary: "Beckett Locke $137/night" },
  { id: "serp:h3", title: "The Mayson",       price: "$159/night", meta: "North Quays · waterfront",      summary: "The Mayson $159/night" },
];

const days: FolioDay[] = [
  { title: "Day 1 · Arrive in Dublin", date: "Sat Oct 4", activities: [{ name: "Evening stroll along the Liffey" }], dining: [{ name: "The Woollen Mills", cuisine: "Irish" }] },
  { title: "Day 2 · City wander",      date: "Sun Oct 5", activities: [{ name: "Trinity College & the Book of Kells" }, { name: "Kilmainham Gaol tour" }], dining: [{ name: "Fade Street Social", cuisine: "Modern Irish" }] },
  { title: "Day 3 · Day trip",         date: "Mon Oct 6", activities: [{ name: "Free morning in Temple Bar" }], dining: [{ name: "Klaw", cuisine: "Seafood" }] },
  { title: "Day 4 · Coast",            date: "Tue Oct 7", activities: [{ name: "Howth cliff walk" }], dining: [{ name: "Octopussys Seafood Tapas", cuisine: "Seafood" }] },
  { title: "Day 6 · Temple Bar",       date: "Thu Oct 9", activities: [], dining: [{ name: "The Boxty House", cuisine: "Irish" }] },
];

const base: FolioData = { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [] };
const withFlight: FolioData = { ...base, flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180" }] };
const withHotel: FolioData = { ...withFlight, hotels: [{ name: "The Dean Dublin", area: "Camden St", stars: 4, nights: 7, perNight: "$168" }] };
const withDays: FolioData = { ...withHotel, days };
const edited: FolioData = { ...withDays, days: days.map((d, i) => i === 2 ? { ...d, activities: [{ name: "Cliffs of Moher day trip" }] } : d) };
const withFinal: FolioData = { ...edited, days: edited.days!.map((d, i) => i === 4 ? { ...d, activities: [{ name: "Temple Bar food tour" }] } : d) };

export const dublinCollab = screenplay({ trip: "Dublin · collab", skin: "claude" }, (s) => {
  // Act 1 — Intake: the advisor states the brief, the agent opens a trip.
  s.advisor.says("Plan a week in Dublin in October, two people, mid-range. They love food and a bit of coast.");
  s.agent.tool("save_trip", { summary: "Dublin · Oct 4-11 · 2 travelers" });
  s.agent.says("On it. A week in Dublin in October for two, mid-range, food and coast. Let me pull flights first.");
  s.spotlight({ eventType: "tool", nth: 1 }, { target: "tool-save_trip", eyebrow: "The brief", title: "It starts with intent", body: "The advisor says what the travelers want and the agent opens a trip to work in." });

  // Act 2 — Flights: search, the traveler picks.
  s.agent.tool("flight_search", { summary: "MOB→DUB · Oct 4-11" });
  s.agent.says("Three that fit your dates, Mobile to Dublin, October 4 to 11.");
  s.agent.board("flight", "b-flight", flights);
  s.client.picks("b-flight", "serp:70wngy", "Aer Lingus · MOB→DUB · $3,180", withFlight);
  s.agent.says("Good call. Added it and locked the dates around it.");
  s.spotlight({ interactionKind: "pick", nth: 1 }, { target: "board-flight", eyebrow: "The traveler picks", title: "Their flight, their call", body: "The traveler weighs the options and chooses; the agent builds the trip around it." });

  // Act 3 — Hotels: same flow for the stay.
  s.agent.tool("hotel_search", { summary: "Dublin · 7 nights · mid-range" });
  s.agent.says("And a few places to stay, all central and in your range.");
  s.agent.board("hotel", "b-hotel", hotels);
  s.client.picks("b-hotel", "serp:h1", "The Dean Dublin · $168/night", withHotel);
  s.agent.says("Nice pick. The Dean is a short walk from most of what you want to see.");
  s.spotlight({ interactionKind: "pick", nth: 2 }, { target: "board-hotel", eyebrow: "And the stay", title: "The traveler picks the hotel", body: "Same flow for lodging; the choice flows straight into the folio." });

  // Act 4 — Itinerary: the agent assembles the week.
  s.agent.tool("excursion_search", { summary: "Dublin + day trips" });
  s.agent.says("Here is the week, day by day, with food worked in.");
  s.agent.folio(withDays);
  s.spotlight({ eventType: "folio", nth: 3 }, { target: "folio-days", eyebrow: "The build", title: "Day by day", body: "The agent assembles the week, activities and dining, into one living folio." });

  // Act 5 — Refine: the advisor edits a single day in place.
  s.advisor.edits("days[2].activities[0]", { was: "Free morning in Temple Bar", now: "Cliffs of Moher day trip", tag: "Advisor edited" }, edited);
  s.agent.says("Updated Day 3. I moved the Temple Bar morning later in the week so the day trip has a full day.");
  s.spotlight({ interactionKind: "edit", nth: 1 }, { target: "folio-day-2", eyebrow: "The advisor's touch", title: "Refined, not regenerated", body: "The advisor edits a single day in place; the change is attributed and the rest is untouched." });

  // Act 6 — Review: out to the client, reply routed back.
  s.advisor.sendsToClient({ subject: "Your Dublin trip is ready to review", reply: "Can we add a food tour on the last evening?" });
  s.spotlight({ interactionKind: "handoff", nth: 1 }, { target: "handoff-notice", eyebrow: "The round trip", title: "Out to the client, back to the agent", body: "The folio goes to the traveler by email and their reply routes straight back to the agent. Simulated here." });

  // Act 7 — Finalize: the client's note lands and the trip is done.
  s.client.comments("days[4]", "Can we add a food tour on the last evening? We loved the one in Lisbon.", "thread-day6");
  s.advisor.comments("days[4]", "Done. Added a Temple Bar food tour that evening.", "thread-day6");
  s.agent.says("Picking up the note. Added a Temple Bar food tour to Day 6 and checked it against dinner, no conflict.");
  s.agent.folio(withFinal);
  s.spotlight({ interactionKind: "comment", nth: 1 }, { target: "comment-thread-day6", eyebrow: "Shaped together", title: "The client's note lands", body: "The traveler's comment becomes the agent's next action, and the trip is done." });
});
