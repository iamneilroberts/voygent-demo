import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReelFolioView } from "./ReelFolioView";
import type { ReelFolioSession } from "./lib/recording";

// The N5 tour drill-down surface: an addon carrying `detail` gets a details link on its
// row; `openDetailId` swaps the folio content for the tour page (blurb, bullets, CTA
// with the price delta); addons without detail get no link (ch1/ch2 end-states).
const base: ReelFolioSession = {
  open: true,
  url: "voygent.app/t/dublin",
  folio: { tripId: "t", title: "A week in Dublin", flights: [], hotels: [], days: [] },
  flightsPrice: 3180,
  activitiesPrice: 284,
  hotels: [{ id: "h1", name: "The Dean Dublin", price: 1176 }],
  pickedHotelId: "h1",
  addons: [
    {
      // undated so it renders in "Optional extras" (the fixture folio carries no days)
      id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 116, on: false,
      detail: { blurb: "Small-group guided tour of the historic gaol.", bullets: ["Guided small group · 2h 30m", "Museum entry included"] },
    },
    { id: "transfers", label: "Private airport transfers", price: 120, on: false },
  ],
  notes: [],
  status: "draft",
  advisorUpdating: false,
  focus: null,
  expandedDay: 4,
};

describe("ReelFolioView tour drill-down", () => {
  it("renders the tour page when openDetailId is set (scripted)", () => {
    const html = renderToStaticMarkup(<ReelFolioView view={{ ...base, openDetailId: "tour:kilmainham" }} mode="scripted" />);
    expect(html).toContain('data-reel-target="tour-detail"');
    expect(html).toContain("Small-group guided tour");
    expect(html).toContain("Museum entry included");
    expect(html).toContain('data-reel-target="tour-detail-cta"');
    expect(html).toContain("Add to trip");
    expect(html).toContain("$116");
    expect(html).not.toContain('data-reel-target="folio-days"'); // the page replaces the folio body
  });

  it("shows a details link only on addons that carry detail content", () => {
    const html = renderToStaticMarkup(<ReelFolioView view={base} mode="scripted" />);
    expect((html.match(/tour details/g) ?? []).length).toBe(1); // kilmainham yes, transfers no
  });

  it("marks an already-added tour on its page instead of re-offering it", () => {
    const added = { ...base, addons: base.addons.map((a) => ({ ...a, on: a.id === "tour:kilmainham" })), openDetailId: "tour:kilmainham" };
    const html = renderToStaticMarkup(<ReelFolioView view={added} mode="scripted" />);
    expect(html).toContain("Added to your trip");
  });
});
