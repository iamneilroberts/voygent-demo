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

// NOTE: no new import line — replayChat resolves the track internally.
// Strengthened per Codex review: prove playback PAUSES on a highlight (not just that it fires),
// and prove speed() is read per frame.
describe("replayChat highlights + speed", () => {
  it("pauses at the matching frame until onHighlight resolves, then continues", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 1, kind: "event", event: { type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] } as ServerEvent },
      { delayMs: 1, kind: "event", event: { type: "text", delta: "after" } as ServerEvent },
      { delayMs: 1, kind: "turn-end" },
    ] };
    const applied: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const done = replayChat(rec, {
      applyEvent: (e) => applied.push(e.type),
      pushUser: () => {},
      setBusy: () => {},
      onHighlight: async () => { await gate; },   // block until we release
    }, {
      wait: async () => {},
      highlights: [{ match: { eventType: "board", kind: "flight" }, anchor: "chat", eyebrow: "E", title: "Real fares", body: "B" }],
    });
    await Promise.resolve(); await Promise.resolve();   // let the loop run up to the paused callout
    expect(applied).toEqual(["board"]);                 // paused: the "text" frame has NOT applied yet
    release();
    await done;
    expect(applied).toEqual(["board", "text"]);         // resumed after the callout
  });

  it("reads speed() per frame (lower speed => longer waits)", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 0, kind: "event", event: { type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] } as ServerEvent },
    ] };
    const waits: number[] = [];
    let speed = 2;
    await replayChat(rec, { applyEvent: () => {}, pushUser: () => {}, setBusy: () => {} },
      { wait: async (ms) => { waits.push(ms); }, speed: () => speed });
    const fast = waits[0];
    waits.length = 0; speed = 1;
    await replayChat(rec, { applyEvent: () => {}, pushUser: () => {}, setBusy: () => {} },
      { wait: async (ms) => { waits.push(ms); }, speed: () => speed });
    expect(waits[0]).toBeGreaterThan(fast);             // 1x waits longer than 2x
  });
});
