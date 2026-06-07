import { describe, it, expect } from "vitest";
import { createRecorder } from "./recorder";
import type { Recording } from "./recording";

describe("recorder", () => {
  it("captures user, event, and turn-end frames with non-negative delays", () => {
    let now = 1000;
    const rec = createRecorder("dublin-oct", () => now);
    rec.recordUser("Plan Dublin");
    now += 50; rec.recordEvent({ type: "text", delta: "Hi" });
    now += 20; rec.recordEvent({ type: "folio", folio: { tripId: "t", title: "Dublin", flights: [], hotels: [] } });
    rec.recordTurnEnd();
    const out: Recording = rec.export();
    expect(out.trip).toBe("dublin-oct");
    expect(out.skin).toBe("claude");
    expect(out.frames[0]).toMatchObject({ kind: "user", text: "Plan Dublin" });
    expect(out.frames[1]).toMatchObject({ kind: "event" });
    expect(out.frames.at(-1)).toMatchObject({ kind: "turn-end" });
    for (const f of out.frames) expect(f.delayMs).toBeGreaterThanOrEqual(0);
  });
});

import { replayChat } from "./recording";
import type { ServerEvent } from "../../../shared/events";

describe("replayChat", () => {
  it("drives the reducer to the recorded end-state (instant in tests)", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 5, kind: "user", text: "Plan Dublin" },
      { delayMs: 5, kind: "event", event: { type: "text", delta: "On it!" } as ServerEvent },
      { delayMs: 5, kind: "event", event: { type: "folio", folio: { tripId: "t", title: "Dublin", flights: [], hotels: [], days: [{ title: "Day 1", activities: [], dining: [], stay: "Hotel" }] } } as ServerEvent },
      { delayMs: 5, kind: "turn-end" },
    ] };
    const events: ServerEvent[] = [];
    const users: string[] = [];
    const busy: boolean[] = [];
    await replayChat(rec, {
      applyEvent: (e) => events.push(e),
      pushUser: (t) => users.push(t),
      setBusy: (b) => busy.push(b),
    }, { wait: async () => {} }); // instant
    expect(users).toEqual(["Plan Dublin"]);
    expect(events.map((e) => e.type)).toEqual(["text", "folio"]);
    expect(busy).toEqual([true, false]);
  });
});
