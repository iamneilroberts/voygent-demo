import { describe, it, expect } from "vitest";
import { emptyReelViewState, applyInteraction } from "./interaction";

describe("applyInteraction", () => {
  it("pick records the selected candidate with its actor, never touching folio", () => {
    const s = applyInteraction(emptyReelViewState(), { kind: "pick", boardId: "b1", candidateIds: ["serp:70wngy"], echo: "Aer Lingus" }, "client");
    expect(s.selected.b1).toEqual({ candidateIds: ["serp:70wngy"], actor: "client" });
    expect("folio" in s).toBe(false); // reducer owns NO folio data
  });

  it("pick records ALL candidate ids for a multi-select board (e.g. an advisor hotel shortlist)", () => {
    const s = applyInteraction(emptyReelViewState(), { kind: "pick", boardId: "b-hotel", candidateIds: ["serp:h1", "serp:h2", "serp:h3"], echo: "Shortlisted 3" }, "advisor");
    expect(s.selected["b-hotel"]).toEqual({ candidateIds: ["serp:h1", "serp:h2", "serp:h3"], actor: "advisor" });
  });

  it("edit appends an unreconciled overlay marker (no folio mutation)", () => {
    const s = applyInteraction(emptyReelViewState(), { kind: "edit", path: "days[2].activities[0]", was: "Free morning", now: "Cliffs of Moher", tag: "Advisor edited" }, "advisor");
    expect(s.edits).toEqual([{ path: "days[2].activities[0]", was: "Free morning", now: "Cliffs of Moher", tag: "Advisor edited", actor: "advisor", reconciled: false }]);
  });

  it("comment appends to the thread keyed by threadId, in order", () => {
    let s = applyInteraction(emptyReelViewState(), { kind: "comment", anchor: "days[5]", threadId: "t6", text: "Add a food tour?" }, "client");
    s = applyInteraction(s, { kind: "comment", anchor: "days[5]", threadId: "t6", text: "Done." }, "advisor");
    expect(s.threads).toHaveLength(1);
    expect(s.threads[0]).toMatchObject({ threadId: "t6", anchor: "days[5]" });
    expect(s.threads[0].comments).toEqual([
      { actor: "client", text: "Add a food tour?" },
      { actor: "advisor", text: "Done." },
    ]);
  });

  it("handoff sets sent and routedBack when a reply is present", () => {
    const s = applyInteraction(emptyReelViewState(), { kind: "handoff", channel: "email", subject: "Your trip", reply: "Add a food tour?" }, "advisor");
    expect(s.handoff).toEqual({ sent: true, routedBack: true, subject: "Your trip", reply: "Add a food tour?" });
  });

  it("is pure — does not mutate the input state", () => {
    const s0 = emptyReelViewState();
    applyInteraction(s0, { kind: "pick", boardId: "b1", candidateIds: ["c1"], echo: "x" }, "client");
    expect(s0.selected).toEqual({});
  });
});
