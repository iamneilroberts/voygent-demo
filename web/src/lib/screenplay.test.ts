import { describe, it, expect } from "vitest";
import { screenplay } from "./screenplay";
import type { BoardCandidate, FolioData } from "../../../shared/events";

const cands: BoardCandidate[] = [
  { id: "serp:70wngy", title: "Aer Lingus MOB→DUB", summary: "Aer Lingus" },
  { id: "serp:abc", title: "United MOB→DUB", summary: "United" },
];
const draft: FolioData = { tripId: "t", title: "Dublin", flights: [], hotels: [], days: [
  { title: "Day 1", activities: [], dining: [] }, { title: "Day 2", activities: [], dining: [] },
] };
const withFlight: FolioData = { ...draft, flights: [{ label: "Aer Lingus MOB→DUB", price: "$3,180" }] };

describe("screenplay compiler", () => {
  it("lowers a pick into an interaction frame THEN a folio event, attributed", () => {
    const { recording } = screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("flight", "b1", cands);
      s.client.picks("b1", "serp:70wngy", "Aer Lingus", withFlight);
    });
    const kinds = recording.frames.filter((f) => f.kind !== "turn-end").map((f) => f.kind === "event" ? `event:${(f as any).event.type}` : f.kind);
    expect(kinds).toEqual(["event:board", "interaction", "event:folio"]);
    const inter = recording.frames.find((f) => f.kind === "interaction") as any;
    expect(inter.actor).toBe("client");
    expect(inter.interaction).toMatchObject({ kind: "pick", boardId: "b1", candidateId: "serp:70wngy" });
  });

  it("throws if a pick references a board that was never emitted", () => {
    expect(() => screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.client.picks("bX", "serp:70wngy", "x", withFlight);
    })).toThrow(/board "bX"/);
  });

  it("throws if the picked candidate is not on the board", () => {
    expect(() => screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("flight", "b1", cands);
      s.client.picks("b1", "serp:nope", "x", withFlight);
    })).toThrow(/candidate "serp:nope"/);
  });

  it("throws if an edit path does not exist in the current folio", () => {
    expect(() => screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.folio(draft);
      s.advisor.edits("days[9].activities[0]", { was: "a", now: "b", tag: "Advisor edited" });
    })).toThrow(/path "days\[9\]/);
  });

  it("throws if a comment anchor does not exist in the current folio", () => {
    expect(() => screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.folio(draft);
      s.advisor.comments("days[9]", "nice", "t9");
    })).toThrow(/anchor "days\[9\]/);
  });

  it("assigns stable beatIds and collects spotlights into the highlight track", () => {
    const { highlights } = screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("flight", "b1", cands);
      s.client.picks("b1", "serp:70wngy", "Aer Lingus", withFlight);
      s.spotlight({ interactionKind: "pick" }, { target: "board-flight", eyebrow: "Real pick", title: "Client chose", body: "From live fares." });
    });
    expect(highlights).toHaveLength(1);
    expect(highlights[0].match).toMatchObject({ interactionKind: "pick" });
  });
});
