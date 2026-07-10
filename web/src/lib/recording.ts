import type { ServerEvent, FolioData } from "../../../shared/events";
import { computeDelay, interactionDwell } from "./pacing";
import { resolveHighlightFrames, type Highlight } from "./highlights";

export type Actor = "agent" | "advisor" | "client";

// The client-facing view of the trip (R4): a simulated browser window the traveler
// sees after the advisor sends the folio. Snapshot-based — each `clientview` beat
// carries the full state, so consecutive beats animate the live price recalc.
export interface ReelHotelOption { id: string; name: string; price: number; meta?: string }
// Optional drill-down content for an add-on: renders a "tour details" link on its row
// and a full tour page inside the folio window (N5 — the client researches the tour
// themselves before selecting it). Fixture copy only; prices stay on the addon.
export interface ReelAddonDetail { blurb: string; bullets: string[] }
export interface ReelAddon { id: string; label: string; price: number; on: boolean; day?: number; detail?: ReelAddonDetail }
export interface ReelClientSession {
  open: boolean;
  url: string;            // simulated address-bar URL, e.g. voygent.app/t/dublin
  tripTitle: string;
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];     // the advisor's shortlist, as the client's single-choice
  pickedHotelId: string | null;
  addons: ReelAddon[];           // optional upgrades the client can toggle
  question: string | null;       // the client's typed note (shown before Send)
  progress: number;              // 0..1, "ready to book"
  // Optional copy overrides for non-advisor-arc reels (e.g. a traveller-only DIY reel).
  // Omitted → the exact current hardcoded string, so existing reels are unchanged.
  sceneLabel?: string;   // the cutaway scene label (default "The clients' view — the Millers' window")
  readyLine?: string;    // the "ready to book" status line (default "✓ Ready to book — send it back to your advisor")
  noteLabel?: string;    // label above the client's typed note (default "A note for your advisor")
}

// authorLabel: optional display-name override for who left the note (default derives
// "Julie" / "Your advisor" from `author`) — a DIY reel's own traveller isn't Julie.
export interface ReelFolioNote { anchor: string; author: "client" | "advisor"; text: string; authorLabel?: string }

// The full client folio window (ch3): a simulated browser window showing the folio
// itself — production-faithful content (FolioData) plus the live-pricing fields the
// client plays with. Snapshot-based like ReelClientSession: each `folioview` beat
// replaces the snapshot; consecutive snapshots animate (total recalc, day swap,
// Draft→Final). `focus` names a data-reel-target anchor the surface scrolls into view
// (the spec's section-cut scroll driving). `expandedDay` is 1-based into folio.days.
export interface ReelFolioSession {
  open: boolean;
  url: string;
  folio: FolioData;
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
  notes: ReelFolioNote[];
  status: "draft" | "final";
  advisorUpdating: boolean;
  focus: string | null;
  expandedDay: number | null;
  // When set (to an addon id whose ReelAddon carries `detail`), the window shows that
  // tour's page instead of the folio body — the scripted "client clicks the link" beat.
  // Omitted/null → the folio. Interactive mode tracks this locally instead.
  openDetailId?: string | null;
  // QA4 ch2: a message from the advisor pinned at the top of the window ("pick your
  // hotel and tell me what you think") — orients the client the moment the folio opens.
  advisorNote?: string;
  // QA4 ch2: the client pressed Send — renders the button as sent + a confirmation
  // line ("your advisor sees this instantly"), the chapter's closing beat.
  feedbackSent?: boolean;
  // Optional copy overrides for non-advisor-arc reels (e.g. a traveller-only DIY reel).
  // Omitted → the exact current hardcoded string, so existing reels are unchanged.
  audienceLine?: string; // the "Prepared for …" line (default "Prepared for Mark & Julie Miller · Oct 4–11")
  sceneLabel?: string;   // the cutaway scene label (default "The clients' view — the Millers' window")
  totalLabel?: string;   // the trip-total caption (default "Trip total · two travellers")
  helperLine?: string;   // the interactive end-state "send back" CTA label (default "Send to your advisor →")
}

// A brief peek at the engineering view (reel): a small panel that slides in to show
// the REAL tools the assistant has called so far, plus (QA4) a representative metrics
// block — cost, tokens, cache savings. The metrics are authored fixtures sized like a
// real run and labelled as representative; the live demo carries the real numbers.
export interface ReelEngTool { name: string; status: "done" | "running" }
export interface ReelEngMetric { label: string; value: string; accent?: boolean }
export interface ReelEngPanel {
  open: boolean;
  tools: ReelEngTool[];   // the real tool sequence so far
  metrics?: ReelEngMetric[]; // representative telemetry (cost / tokens / cache)
  footnote?: string;      // pointer to the live demo for the full metrics
}

// QA4: a raw email shown as an email window — ch2 opens on the advisor's send landing
// in the Millers' inbox; ch3 shows the airline's messy confirmation before the paste.
// sceneLabel names whose inbox we're looking at (defaults to "Inbox").
export interface ReelEmailView { from: string; subject: string; body: string; sceneLabel?: string }

// Reel-only interaction payloads. NEVER a ServerEvent — the worker/live app never sees these.
export type ReelInteraction =
  | { kind: "pick"; boardId: string; candidateIds: string[]; echo: string }
  | { kind: "edit"; path: string; was: string; now: string; tag: string }
  | { kind: "comment"; anchor: string; threadId: string; text: string }
  // inbound: the notification is the CLIENT's reply arriving (ch3's opening beat) —
  // the notice renders only the reply card + routing chip, no "folio sent" card.
  | { kind: "handoff"; channel: "email"; subject: string; reply?: string; inbound?: boolean }
  | { kind: "clientview"; view: ReelClientSession | null }
  | { kind: "folioview"; view: ReelFolioSession | null }
  | { kind: "engpanel"; view: ReelEngPanel | null }
  | { kind: "emailview"; view: ReelEmailView | null };

export type Frame =
  | { delayMs: number; kind: "user"; text: string; actor?: Actor; beatId?: string }
  | { delayMs: number; kind: "event"; event: ServerEvent; beatId?: string }
  | { delayMs: number; kind: "turn-end" }
  // holdMs: authored post-apply dwell override (1× ms) for beats that should read
  // faster or slower than their kind's default — e.g. quick section flips in a cutaway.
  | { delayMs: number; kind: "interaction"; actor: Actor; interaction: ReelInteraction; beatId?: string; holdMs?: number };

export interface Recording {
  skin: "claude";
  trip: string;
  frames: Frame[];
}

export interface ReplayHandlers {
  applyEvent: (e: ServerEvent) => void;  // caller binds claude=true
  pushUser: (text: string) => void;      // user bubble + assistant placeholder
  setBusy: (b: boolean) => void;
  applyInteraction?: (i: ReelInteraction, actor: Actor) => void; // reel-only interaction frame
  onHighlight?: (h: Highlight) => Promise<void>; // paused callout; resolves to resume
}

export interface ReplayOpts {
  reducedMotion?: boolean;
  wait?: (ms: number) => Promise<void>;  // injected in tests for instant playback
  signal?: AbortSignal;
  speed?: () => number;                  // current speed multiplier (>=1); read each frame
  highlights?: Highlight[];              // sidecar callouts for this recording
  // Playback control: awaited before each frame; resolves immediately when not paused,
  // otherwise when the viewer resumes. Raced against abort so a restart never hangs.
  pauseGate?: () => Promise<void>;
  // Progress tick: (framesDone, framesTotal) before each frame and once at the end.
  onProgress?: (done: number, total: number) => void;
  // Seek: apply frames [0, seekTo) instantly (state rebuild), then play normally from
  // seekTo. Caller must reset state before re-invoking so the rebuild starts clean.
  seekTo?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

// Resolves when the signal aborts (or immediately if already aborted). Used to
// race a paused callout so an abort during a highlight never leaves the loop hanging.
function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise<void>(() => {}); // never resolves; only used inside Promise.race with onHighlight
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export async function replayChat(rec: Recording, h: ReplayHandlers, opts: ReplayOpts = {}): Promise<void> {
  const wait = opts.wait ?? ((ms: number) => sleep(ms, opts.signal));
  const getSpeed = opts.speed ?? (() => 1);
  const hlMap = opts.highlights ? resolveHighlightFrames(rec.frames, opts.highlights) : null;
  // Seek support: frames before `seekTo` are applied INSTANTLY (no delay, dwell, pause,
  // or callout) to rebuild the accumulated state, then normal playback resumes at seekTo.
  // The caller resets state first, so a seek is reset + fast-forward + play-on.
  const startFrom = opts.seekTo && opts.seekTo > 0 ? opts.seekTo : 0;
  let prev: Frame | null = null;
  // The viewer has stared at the current screen for a whole callout — after one
  // resolves, cap the next frame's pre-delay so the reel moves on instead of
  // holding a screen where nothing is changing.
  const POST_CALLOUT_CAP = 250;
  let afterCallout = false;
  for (let i = 0; i < rec.frames.length; i++) {
    const f = rec.frames[i];
    if (opts.signal?.aborted) return;
    const live = i >= startFrom;   // false while fast-forwarding to the seek target
    if (live) {
      // Hold here while paused (abort-safe). When not paused this resolves immediately.
      if (opts.pauseGate) { await Promise.race([opts.pauseGate(), waitForAbort(opts.signal)]); if (opts.signal?.aborted) return; }
      opts.onProgress?.(i, rec.frames.length);
      const delay = computeDelay(f, prev, { speed: getSpeed(), reducedMotion: opts.reducedMotion });
      await wait(afterCallout ? Math.min(delay, POST_CALLOUT_CAP) : delay);
      afterCallout = false;
      if (opts.signal?.aborted) return;
    }
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
    else if (f.kind === "interaction") h.applyInteraction?.(f.interaction, f.actor);
    prev = f;
    if (!live) continue;   // fast-forward: skip dwell + callouts
    const hits = hlMap?.get(i);
    // Interactions HOLD after applying (post-apply dwell) unless a spotlight on this
    // same frame provides the hold (handled below) — avoids double-dwell.
    if (f.kind === "interaction" && !(hits && hits.length)) {
      const speed = Math.max(1, getSpeed());
      const hold = f.holdMs != null && !opts.reducedMotion
        ? Math.round(f.holdMs / speed)
        : interactionDwell(f.interaction.kind, { speed: getSpeed(), reducedMotion: opts.reducedMotion });
      await wait(hold);
      if (opts.signal?.aborted) return;
    }
    if (hits && hits.length && h.onHighlight) {
      for (const hl of hits) {
        if (opts.signal?.aborted) return;
        // Race each callout against abort: if the reel is restarted / unmounted mid-callout,
        // this resolves instead of hanging on a promise App can no longer settle.
        await Promise.race([h.onHighlight(hl), waitForAbort(opts.signal)]);
        if (opts.signal?.aborted) return;
      }
      afterCallout = true;
    }
  }
  opts.onProgress?.(rec.frames.length, rec.frames.length);
}
