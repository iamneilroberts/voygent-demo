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
