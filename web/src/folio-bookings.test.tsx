import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FolioPanel } from "./FolioPanel";
import type { FolioData } from "../../shared/events";

describe("folio bookings section", () => {
  it("renders confirmed bookings with conf numbers", () => {
    const folio: FolioData = {
      tripId: "t", title: "A week in Dublin", flights: [], hotels: [],
      bookings: [{ label: "Aer Lingus EI 106 · MOB→DUB", conf: "6XKPTR", status: "confirmed" }],
    };
    const html = renderToStaticMarkup(<FolioPanel folio={folio} advisor={false} />);
    expect(html).toContain("6XKPTR");
    expect(html).toContain("Aer Lingus EI 106");
  });
});
