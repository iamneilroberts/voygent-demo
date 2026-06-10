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
import type { ReelInteraction } from "./recording";
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
      highlights: [{ match: { eventType: "board", kind: "flight" }, target: "board-flight", eyebrow: "E", title: "Real fares", body: "B" }],
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

describe("replayChat interaction frames", () => {
  it("applies the interaction BEFORE the post-apply dwell wait", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "pick", boardId: "b1", candidateIds: ["c1"], echo: "x" } },
      { delayMs: 0, kind: "turn-end" },
    ] };
    const order: string[] = [];
    await replayChat(rec, {
      applyEvent: () => {},
      pushUser: () => {},
      setBusy: () => {},
      applyInteraction: (i: ReelInteraction, actor) => order.push(`apply:${i.kind}:${actor}`),
    }, { wait: async (ms) => { if (ms > 0) order.push(`wait:${ms}`); } });
    const applyIdx = order.indexOf("apply:pick:client");
    expect(applyIdx).toBeGreaterThanOrEqual(0);
    const dwellAfter = order.slice(applyIdx + 1).find((o) => o.startsWith("wait:"));
    expect(dwellAfter).toBeDefined();
    expect(parseInt(dwellAfter!.split(":")[1], 10)).toBeGreaterThanOrEqual(3000);
  });

  it("aborting during the post-apply dwell exits cleanly", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 0, kind: "interaction", actor: "advisor", interaction: { kind: "edit", path: "days[0]", was: "a", now: "b", tag: "Advisor edited" } },
      { delayMs: 0, kind: "event", event: { type: "text", delta: "after" } as ServerEvent },
    ] };
    const applied: string[] = [];
    const ac = new AbortController();
    await replayChat(rec, {
      applyEvent: (e) => applied.push(e.type),
      pushUser: () => {},
      setBusy: () => {},
      applyInteraction: () => { ac.abort(); },
    }, { signal: ac.signal, wait: async () => {} });
    expect(applied).toEqual([]);
  });

  it("does NOT fire the plain interaction dwell when the frame is spotlighted (no double-dwell)", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "pick", boardId: "b1", candidateIds: ["c1"], echo: "x" }, beatId: "pick1" },
      { delayMs: 0, kind: "turn-end" },
    ] };
    const waits: number[] = [];
    let highlighted = false;
    await replayChat(rec, {
      applyEvent: () => {},
      pushUser: () => {},
      setBusy: () => {},
      applyInteraction: () => {},
      onHighlight: async () => { highlighted = true; }, // resolves immediately = the spotlight provides the hold
    }, {
      wait: async (ms) => { if (ms > 0) waits.push(ms); },
      highlights: [{ match: { beatId: "pick1" }, target: "board-flight", eyebrow: "E", title: "Spot", body: "B" }],
    });
    expect(highlighted).toBe(true);                       // the spotlight fired on the interaction frame
    // No wait >= the interaction dwell floor (3000ms) — the plain dwell was skipped because the frame was spotlighted.
    expect(waits.some((w) => w >= 3000)).toBe(false);
  });
});

describe("replayChat transport (pause + progress)", () => {
  it("holds at the pause gate until it resolves, then continues", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 1, kind: "event", event: { type: "text", delta: "a" } as ServerEvent },
      { delayMs: 1, kind: "event", event: { type: "text", delta: "b" } as ServerEvent },
      { delayMs: 1, kind: "turn-end" },
    ] };
    const applied: string[] = [];
    let release!: () => void;
    let calls = 0;
    const done = replayChat(rec, {
      applyEvent: (e) => applied.push((e as { delta?: string }).delta ?? e.type),
      pushUser: () => {},
      setBusy: () => {},
    }, {
      wait: async () => {},
      // pause the gate on the 2nd frame; resolve immediately otherwise.
      pauseGate: () => { calls++; return calls === 2 ? new Promise<void>((r) => { release = r; }) : Promise.resolve(); },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(applied).toEqual(["a"]);   // held before the 2nd frame applies
    release();
    await done;
    expect(applied).toEqual(["a", "b"]);
  });

  it("reports progress per frame and a final tick at the total", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 1, kind: "event", event: { type: "text", delta: "a" } as ServerEvent },
      { delayMs: 1, kind: "turn-end" },
    ] };
    const prog: Array<[number, number]> = [];
    await replayChat(rec, { applyEvent: () => {}, pushUser: () => {}, setBusy: () => {} },
      { wait: async () => {}, onProgress: (d, t) => prog.push([d, t]) });
    expect(prog[0]).toEqual([0, 2]);
    expect(prog.at(-1)).toEqual([2, 2]);   // final tick at 100%
  });
});

describe("replayChat seek (fast-forward)", () => {
  it("applies frames before seekTo instantly (no waits), then plays from the target", async () => {
    const rec: Recording = { skin: "claude", trip: "t", frames: [
      { delayMs: 5, kind: "event", event: { type: "text", delta: "a" } as ServerEvent },
      { delayMs: 5, kind: "event", event: { type: "text", delta: "b" } as ServerEvent },
      { delayMs: 5, kind: "event", event: { type: "text", delta: "c" } as ServerEvent },
      { delayMs: 5, kind: "turn-end" },
    ] };
    const applied: string[] = [];
    const waits: number[] = [];
    const prog: number[] = [];
    await replayChat(rec, {
      applyEvent: (e) => applied.push((e as { delta?: string }).delta ?? e.type),
      pushUser: () => {},
      setBusy: () => {},
    }, { wait: async (ms) => { waits.push(ms); }, onProgress: (d) => prog.push(d), seekTo: 2 });
    expect(applied).toEqual(["a", "b", "c"]);   // ALL earlier frames applied (state rebuilt)
    expect(waits.length).toBe(2);               // only the live frames [2,3] waited; [0,1) fast-forwarded
    expect(prog[0]).toBe(2);                     // first progress tick is at the seek target
    expect(prog.at(-1)).toBe(4);                 // final tick at the total
  });
});
