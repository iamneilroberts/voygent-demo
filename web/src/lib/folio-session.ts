import type { FolioData } from "../../../shared/events";
import type { ReelClientSession, ReelFolioSession } from "./recording";

// End-of-reel bridge (spec Decision 6): ch1/ch2 screenplays drive the compact
// ReelClientSession pricing window during playback; their ended phase renders the full
// folio surface (ReelFolioView interactive) instead of the retired ReelExplore panel.
// Combines the canonical chat folio (content) with the client session (pricing state).
// Always opens the window — ch2's last snapshot closes it, but the end state shows it.
export function folioSessionFromClient(view: ReelClientSession, folio: FolioData): ReelFolioSession {
  return {
    open: true,
    url: view.url,
    folio,
    flightsPrice: view.flightsPrice,
    activitiesPrice: view.activitiesPrice,
    hotels: view.hotels,
    pickedHotelId: view.pickedHotelId,
    addons: view.addons,
    notes: [],
    status: "draft",
    advisorUpdating: false,
    focus: null,
    expandedDay: null,
  };
}
