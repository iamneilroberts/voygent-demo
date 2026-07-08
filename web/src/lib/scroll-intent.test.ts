import { describe, it, expect, vi, afterEach } from "vitest";
import { markProgrammaticScroll, consumeProgrammaticScroll } from "./scroll-intent";

// The A2 follow-scroll contract: exactly the app's own scrolls are absorbed — one mark
// per scroll event, marks expire when the scroll they cover never fired an event, and
// an unmarked event (a real user gesture) is never consumed.
describe("scroll-intent mark/consume", () => {
  afterEach(() => {
    // drain any leftover marks so tests stay independent
    vi.useRealTimers();
    while (consumeProgrammaticScroll()) { /* drain */ }
  });

  it("consumes one mark per scroll event, then treats further events as the user's", () => {
    markProgrammaticScroll();
    expect(consumeProgrammaticScroll()).toBe(true);   // our scrollIntoView's event
    expect(consumeProgrammaticScroll()).toBe(false);  // the user's next gesture
  });

  it("expires a mark whose scroll never emitted an event (no-movement scrollIntoView)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    markProgrammaticScroll();
    vi.setSystemTime(1_000_000 + 400); // past the TTL
    expect(consumeProgrammaticScroll()).toBe(false);
  });

  it("caps pending marks so a burst can't swallow a whole user gesture", () => {
    for (let i = 0; i < 10; i++) markProgrammaticScroll();
    let consumed = 0;
    while (consumeProgrammaticScroll()) consumed++;
    expect(consumed).toBeLessThanOrEqual(4);
  });
});
