import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData } from "../../../shared/events";

// The "built together" reel: one short, honest walk-through of advisor + traveler +
// agent shaping a Dublin trip in a single thread. The flights and the day plan are
// authored fixtures (a scripted demo of the COLLABORATION workflow) — the end card
// says so. A real Voygent run pulls live flights/hotels; that is the dublin-oct reel.
const flights: BoardCandidate[] = [
  { id: "serp:70wngy", title: "Aer Lingus · MOB→DUB", price: "$3,180", meta: "1 stop · Economy · 12h 05m", summary: "Aer Lingus MOB→DUB $3,180" },
  { id: "serp:u1",     title: "United · MOB→DUB",      price: "$3,426", meta: "1 stop · Economy · 11h 20m", summary: "United MOB→DUB $3,426" },
  { id: "serp:d1",     title: "Delta · MOB→DUB",       price: "$2,980", meta: "2 stops · Economy · 14h 40m", summary: "Delta MOB→DUB $2,980" },
];

const draft: FolioData = { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [], days: [
  { title: "Day 1 · Arrive in Dublin", date: "Sat Oct 4", activities: [], dining: [] },
  { title: "Day 3 · Day trip",         date: "Mon Oct 6", activities: [{ name: "Free morning in Temple Bar" }], dining: [] },
  { title: "Day 6 · Temple Bar",       date: "Thu Oct 9", activities: [], dining: [] },
] };
const withFlight: FolioData = { ...draft, flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180" }] };
const edited: FolioData = { ...withFlight, days: withFlight.days!.map((d, i) => i === 1 ? { ...d, activities: [{ name: "Cliffs of Moher day trip" }] } : d) };
const withTour: FolioData = { ...edited, days: edited.days!.map((d, i) => i === 2 ? { ...d, activities: [{ name: "Temple Bar food tour" }] } : d) };

export const dublinCollab = screenplay({ trip: "Dublin · collab", skin: "claude" }, (s) => {
  s.advisor.says("Plan a week in Dublin in October, two people, mid-range.");
  s.agent.tool("flight_search", { summary: "MOB→DUB · Oct 4-11" });
  s.agent.says("Three flights that fit your dates, Mobile to Dublin, October 4 to 11.");
  s.agent.board("flight", "b-flight", flights);
  // picks() emits the folio (withFlight) itself, so the picked flight stays on the
  // board AND in the folio with no flicker. No separate folio(draft) re-emit.
  s.client.picks("b-flight", "serp:70wngy", "Aer Lingus · MOB→DUB · $3,180", withFlight);
  s.agent.says("Good call. Added it and locked the dates around it.");
  s.advisor.edits("days[1].activities[0]", { was: "Free morning in Temple Bar", now: "Cliffs of Moher day trip", tag: "Advisor edited" }, edited);
  s.agent.says("Updated Day 3. I moved the Temple Bar morning later in the week so the day trip has a full day.");
  s.advisor.sendsToClient({ subject: "Your Dublin trip is ready to review", reply: "Can we add a food tour on Day 6?" });
  s.client.comments("days[2]", "Can we add a food tour on Day 6? We loved the one in Lisbon.", "thread-day6");
  s.advisor.comments("days[2]", "Done. Added a Temple Bar food tour that evening.", "thread-day6");
  s.agent.says("Picking up the note. Added a Temple Bar food tour to Day 6 and checked it against the evening, no conflicts.");
  s.agent.folio(withTour);
  s.spotlight({ interactionKind: "pick" }, { target: "board-flight", eyebrow: "The traveler picks", title: "Their choice, locked in", body: "The traveler makes the call and the agent builds the trip around it." });
});
