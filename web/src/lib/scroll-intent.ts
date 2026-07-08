// Distinguishes the app's own scrollIntoView calls from genuine user scrolling, so
// follow-scroll logic never mistakes one for the other (A2). Callers mark right before
// issuing a programmatic scroll; the scroll listener consumes one mark per scroll event
// and treats unmarked events as user intent. Marks expire quickly because a programmatic
// scroll that causes no movement emits no scroll event at all — without expiry a stale
// mark would swallow the first event of the user's next gesture. (A real gesture emits
// a stream of events, so even that worst case only loses the first one.)
const marks: number[] = [];
const TTL_MS = 350;
const MAX_PENDING = 4;

function prune(now: number): void {
  while (marks.length && marks[0] < now) marks.shift();
}

export function markProgrammaticScroll(): void {
  const now = Date.now();
  prune(now);
  if (marks.length < MAX_PENDING) marks.push(now + TTL_MS);
}

// True (and consumes one mark) if a programmatic scroll is pending — i.e. this scroll
// event is ours, not the user's.
export function consumeProgrammaticScroll(): boolean {
  prune(Date.now());
  if (!marks.length) return false;
  marks.shift();
  return true;
}
