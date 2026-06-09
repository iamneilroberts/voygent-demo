import { screenplay } from "../lib/screenplay";
import type { BoardCandidate, FolioData } from "../../../shared/events";

const flights: BoardCandidate[] = [
  { id: "serp:70wngy", title: "Aer Lingus · MOB→DUB", price: "$3,180", meta: "1 stop · Economy", summary: "Aer Lingus MOB→DUB $3,180" },
  { id: "serp:u1", title: "United · MOB→DUB", price: "$3,426", meta: "1 stop · Economy", summary: "United MOB→DUB $3,426" },
];
const draft: FolioData = { tripId: "dublin", title: "Five days in Dublin", flights: [], hotels: [], days: [
  { title: "Day 1 · Arrive", activities: [], dining: [] },
  { title: "Day 3 · Temple Bar", activities: [{ name: "Free morning in Temple Bar" }], dining: [] },
  { title: "Day 6 · West", activities: [], dining: [] },
] };
const withFlight: FolioData = { ...draft, flights: [{ label: "Aer Lingus · MOB→DUB", price: "$3,180" }] };
const edited: FolioData = { ...withFlight, days: withFlight.days!.map((d, i) => i === 1 ? { ...d, activities: [{ name: "Cliffs of Moher day trip" }] } : d) };
const withTour: FolioData = { ...edited, days: edited.days!.map((d, i) => i === 2 ? { ...d, activities: [{ name: "Temple Bar food tour" }] } : d) };

export const dublinCollab = screenplay({ trip: "Dublin · collab", skin: "claude" }, (s) => {
  s.advisor.says("Plan a week in Dublin in October, two people, mid-range.");
  s.agent.tool("flight_search", { summary: "MOB→DUB · Oct 4–11" });
  s.agent.board("flight", "b-flight", flights);
  s.client.picks("b-flight", "serp:70wngy", "Aer Lingus · MOB→DUB · $3,180", withFlight);
  // PROOF-REEL SIMPLIFICATION: re-emits `draft` (flights:[]) after the pick so the edit beat
  // has a folio to target. When rendering lands (P2.4), use `withFlight` here instead — emitting
  // `draft` would visibly drop the just-picked flight then re-add it (a flicker). Inert in P2.1 (no rendering).
  s.agent.folio(draft);
  s.advisor.edits("days[1].activities[0]", { was: "Free morning in Temple Bar", now: "Cliffs of Moher day trip", tag: "Advisor edited" }, edited);
  s.advisor.sendsToClient({ subject: "Your Dublin trip is ready to review", reply: "Can we add a food tour on Day 6?" });
  s.client.comments("days[2]", "Can we add a food tour this day? We loved the one in Lisbon.", "thread-day6");
  s.advisor.comments("days[2]", "Done, added the Temple Bar tasting.", "thread-day6");
  s.agent.folio(withTour);
  s.spotlight({ interactionKind: "pick" }, { target: "board-flight", eyebrow: "Real choice", title: "The client picked", body: "A real fare from the live search, chosen and locked in." });
});
