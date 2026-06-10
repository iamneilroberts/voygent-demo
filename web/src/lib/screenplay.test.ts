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
    expect(inter.interaction).toMatchObject({ kind: "pick", boardId: "b1", candidateIds: ["serp:70wngy"] });
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

  it("picksMany lowers a multi-select pick (no folio required) and validates every id", () => {
    const hotels: BoardCandidate[] = [
      { id: "serp:h1", title: "The Dean", summary: "The Dean" }, { id: "serp:h2", title: "Beckett Locke", summary: "Beckett Locke" }, { id: "serp:h3", title: "The Mayson", summary: "The Mayson" },
    ];
    const { recording } = screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("hotel", "b-hotel", hotels);
      s.advisor.picksMany("b-hotel", ["serp:h1", "serp:h2", "serp:h3"], "Shortlisted 3");
    });
    const inter = recording.frames.find((f) => f.kind === "interaction") as any;
    expect(inter.actor).toBe("advisor");
    expect(inter.interaction).toMatchObject({ kind: "pick", boardId: "b-hotel", candidateIds: ["serp:h1", "serp:h2", "serp:h3"] });
    // no folio passed → no folio event emitted by the pick
    expect(recording.frames.some((f) => f.kind === "event" && (f as any).event.type === "folio")).toBe(false);
  });

  it("picksMany throws if ANY selected id is not on the board", () => {
    expect(() => screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("includes", "b-inc", [{ id: "packing", title: "Packing tips", summary: "Packing tips" }, { id: "weather", title: "Typical weather", summary: "Typical weather" }]);
      s.advisor.picksMany("b-inc", ["packing", "nope"], "x");
    })).toThrow(/candidate "nope"/);
  });

  it("supports an includes chooser board kind", () => {
    const { recording } = screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.agent.board("includes", "b-inc", [{ id: "packing", title: "Packing tips", summary: "Packing tips" }, { id: "apps", title: "Handy apps", summary: "Handy apps" }]);
      s.advisor.picksMany("b-inc", ["packing", "apps"], "Added 2");
    });
    const board = recording.frames.find((f) => f.kind === "event" && (f as any).event.type === "board") as any;
    expect(board.event.kind).toBe("includes");
  });

  it("client.view lowers a clientview interaction frame (snapshot, attributed to the client)", () => {
    const snap = { open: true, url: "voygent.app/t/d", tripTitle: "Dublin", flightsPrice: 3180, activitiesPrice: 420, hotels: [], pickedHotelId: null, addons: [], question: null, progress: 0.6 };
    const { recording } = screenplay({ trip: "Dublin", skin: "claude" }, (s) => {
      s.client.view(snap);
      s.client.view(null); // close
    });
    const inters = recording.frames.filter((f) => f.kind === "interaction") as any[];
    expect(inters).toHaveLength(2);
    expect(inters[0].actor).toBe("client");
    expect(inters[0].interaction).toMatchObject({ kind: "clientview", view: { open: true } });
    expect(inters[1].interaction).toEqual({ kind: "clientview", view: null });
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
