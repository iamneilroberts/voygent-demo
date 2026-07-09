import { describe, it, expect } from "vitest";
import { dublinRun } from "./dublin-run.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import type { FolioData } from "../../../shared/events";

// Grounding test for chapter 3 · "Book the trip" (QA4 arc): advisor POV only. The
// Millers' reply arrives as an INBOUND notification, Voygent folds their picks and
// their food-tour ask into the trip, the airline's messy confirmation shows as an
// email then gets pasted and filed with the ticketed corrections, and the chapter
// closes on the BOOKED commission, itemized.
describe("dublin-run chapter 3 (grounding)", () => {
  const frames = dublinRun.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const kinds = interactions.map((i) => i.kind);

  it("shows no client windows (that was chapter 2)", () => {
    expect(kinds).not.toContain("clientview");
    expect(kinds).not.toContain("folioview");
  });

  it("opens on the INBOUND reply notification carrying the Millers' answer", () => {
    expect(kinds[0]).toBe("handoff");
    const h = interactions[0] as { kind: "handoff"; reply?: string; inbound?: boolean };
    expect(h.inbound).toBe(true);
    expect(h.reply).toContain("The Dean");
    expect(h.reply).toContain("Lisbon");
  });

  it("anchors the Millers' ask as a client comment on the last evening (day 6)", () => {
    const c = interactions.find((i) => i.kind === "comment") as { anchor: string; text: string } | undefined;
    expect(c?.anchor).toBe("days[5]");
    expect(c?.text).toContain("Lisbon");
  });

  it("incorporates the feedback: Dean locked, gaol tour on day 4, food tour on day 6", () => {
    const inc = folios[1];
    expect(inc.hotels.map((h) => h.name).join()).toContain("The Dean");
    expect(inc.days?.[3].activities.map((a) => a.name).join()).toContain("Kilmainham");
    expect(inc.days?.[5].activities.map((a) => a.name).join()).toContain("food tour");
  });

  it("shows the messy confirmation as an email window, then closes it before the paste", () => {
    const emails = interactions.flatMap((i) => (i.kind === "emailview" ? [i.view] : []));
    expect(emails.length).toBe(2);
    expect(emails[0]?.from).toContain("aerlingus");
    expect(emails[0]?.body).toContain("DO NOT REPLY");
    expect(emails.at(-1)).toBeNull();
    // the paste itself: the raw email lands as an advisor message after the window closes
    const pasteIdx = frames.findIndex((f) => f.kind === "user" && f.text.includes("BOOKING REF: 6XKPTR"));
    expect(pasteIdx).toBeGreaterThan(0);
  });

  it("files the booking with the ticketed corrections and never drops it", () => {
    const firstBooking = folios.findIndex((f) => (f.bookings ?? []).length > 0);
    expect(firstBooking).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstBooking).every((f) => (f.bookings ?? []).length > 0)).toBe(true);
    const booked = folios[firstBooking];
    expect(booked.bookings![0].conf).toBe("6XKPTR");
    // the ticketed total ($3,206) corrects the quoted flight line ($3,180)
    expect(booked.flights[0].price).toBe("$3,206");
    expect(folios[firstBooking - 1].flights[0].price).toBe("$3,180");
  });

  it("closes on the BOOKED commission, itemized and reconciling to $280", () => {
    const last = folios.at(-1)!;
    expect(last.commissionsKind).toBe("booked");
    const rows = last.commissions ?? [];
    const booked = rows.filter((r) => !r.potential).reduce((n, r) => n + r.amount, 0);
    expect(booked).toBe(280); // Dean 176 + Cliffs 43 + Kilmainham 17 + transfers 18 + food tour 26
    expect(rows.some((r) => r.potential)).toBe(true);
  });

  it("resolves every callout, in ascending frame order", () => {
    expect(dublinRun.highlights.length).toBe(5);
    const resolved = resolveHighlightFrames(frames, dublinRun.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(dublinRun.highlights.length);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});
