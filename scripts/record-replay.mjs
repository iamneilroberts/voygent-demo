#!/usr/bin/env node
// Headless replay regenerator (task 11). Drives /chat over SSE in boards mode —
// exactly like scripts/smoke-enriched-run.mjs — but instead of just asserting,
// it emits a web/src/recordings/<trip>.json Recording ({skin,trip,frames[]})
// for the autoplay "▶ watch the demo" player. Supersedes manual D2 browser
// capture (web/src/lib/recorder.ts + window.__exportRecording).
//
// Delays are SYNTHESIZED per event type, not wall-clock: headless timing is
// bursty/instant, so we paint a smooth, gif-like cadence (typewriter text,
// brief pauses on tool/board/folio) deterministically.
//
//   node scripts/record-replay.mjs --trip dublin-oct \
//     --base https://voygent-demo.somotravel.workers.dev \
//     --prompt "Plan the Dublin in October trip for 2."
//
// Costs real LLM + MCP calls. Set VOYGENT_CAPTURE_MCP_URL (same var the smoke
// harness uses) to auto-clean the demo trip afterward.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
    return acc;
  }, []),
);
const BASE = argv.base ?? "http://localhost:8787";
const TRIP = argv.trip ?? "dublin-oct";
const PROMPT = argv.prompt ?? "Plan the Dublin in October trip for 2.";
const SESSION = `record-${TRIP}-${Date.now().toString(36)}`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "src", "recordings", `${TRIP}.json`);

// Synthesized cadence (ms). Tuned for a calm, readable autoplay.
const DELAY = {
  user: 700,          // pause before the user "types" the next message
  textFirst: 220,     // first text delta of a block (model "starts speaking")
  text: 22,           // subsequent text deltas (typewriter)
  toolStart: 180,
  toolDone: 240,
  board: 480,         // let the option cards land
  folio: 160,
  inspector: 10,      // side-channel Engineering events — near-instant so the panel
                      //   "ticks" live alongside the chat without adding visible dead time
  other: 120,
  turnEnd: 500,
};

function delayFor(ev, prevType) {
  if (ev.type === "text") return prevType === "text" ? DELAY.text : DELAY.textFirst;
  if (ev.type === "tool") return ev.phase === "start" ? DELAY.toolStart : DELAY.toolDone;
  if (ev.type === "board") return DELAY.board;
  if (ev.type === "folio") return DELAY.folio;
  if (ev.type === "inspector") return DELAY.inspector;
  return DELAY.other;
}

// Inspector "tool" events echo the full tool args + result; in autoplay nobody
// expands a tool row, so cap the result string to keep the bundled recording lean
// without losing the headline (name/latency/token) data the panel actually shows.
const MAX_INSPECTOR_RESULT = 600;
function trimInspector(ev) {
  if (ev.kind === "tool" && typeof ev.result === "string" && ev.result.length > MAX_INSPECTOR_RESULT) {
    return { ...ev, result: ev.result.slice(0, MAX_INSPECTOR_RESULT) + "…[trimmed for recording]" };
  }
  return ev;
}

const frames = [];

/** POST one message; push a user frame, then an event frame per SSE event, then turn-end. */
async function exchange(message) {
  frames.push({ delayMs: DELAY.user, kind: "user", text: message });
  const res = await fetch(`${BASE}/chat?session=${encodeURIComponent(SESSION)}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.DEMO_TEST_TOKEN ? { "x-demo-test": process.env.DEMO_TEST_TOKEN } : {}) },
    body: JSON.stringify({ message, mode: "boards" }),
  });
  if (!res.ok || !res.body) throw new Error(`POST /chat -> ${res.status}`);
  const seen = [];
  let buf = "";
  let prevType = null;
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      // Inspector events are a side channel that drives the Engineering panel.
      // Keep them (trimmed) so autoplay shows the live engineering flexes — but
      // do NOT advance prevType, so the text-typewriter run detection stays intact
      // across a side-channel event interleaved mid-stream.
      if (ev.type === "inspector") {
        frames.push({ delayMs: DELAY.inspector, kind: "event", event: trimInspector(ev) });
        seen.push(ev);
        continue;
      }
      frames.push({ delayMs: delayFor(ev, prevType), kind: "event", event: ev });
      prevType = ev.type;
      seen.push(ev);
    }
  }
  frames.push({ delayMs: DELAY.turnEnd, kind: "turn-end" });
  return seen;
}

function firstCandidate(events, kind) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "board" && ev.kind === kind && Array.isArray(ev.candidates) && ev.candidates.length) {
      return ev.candidates[0];
    }
  }
  return null;
}

const t0 = Date.now();
const r1 = await exchange(PROMPT);
const flight = firstCandidate(r1, "flight");
if (!flight) throw new Error("no flight board on turn 1 — cannot script the pick");

const r2 = await exchange(`I'll take the flight option ${flight.id} (${flight.summary ?? flight.title}).`);
const hotel = firstCandidate(r2, "hotel");
if (!hotel) throw new Error("no hotel board after the flight pick — sequencing changed?");

await exchange(`I'll take the hotel option ${hotel.id} (${hotel.summary ?? hotel.title}).`);

const recording = { skin: "claude", trip: TRIP, frames };
writeFileSync(OUT, JSON.stringify(recording, null, 2) + "\n");

const events = frames.filter((f) => f.kind === "event").length;
const runtimeMs = frames.reduce((a, f) => a + f.delayMs, 0);
console.log(`wrote ${OUT}`);
console.log(`${frames.length} frames (${events} events) · synthesized runtime ≈ ${(runtimeMs / 1000).toFixed(0)}s · captured in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// Self-cleanup (mirror smoke-enriched-run.mjs): the recorded trip persists under
// the MCP user; delete it if the capture URL is available.
const cleanupUrl = process.env.SMOKE_CLEANUP_MCP_URL ?? process.env.VOYGENT_CAPTURE_MCP_URL;
const tripId = frames.map((f) => f.kind === "event" && f.event.type === "folio" ? f.event.folio?.tripId : null).filter(Boolean).at(-1);
if (cleanupUrl && tripId) {
  try {
    await fetch(cleanupUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete_trip", arguments: { tripId, confirm: true } } }),
    });
    console.log(`cleaned up ${tripId}`);
  } catch (e) { console.log(`cleanup failed (delete ${tripId} manually): ${e.message}`); }
} else if (tripId) {
  console.log(`NOTE: ${tripId} persists under the MCP user — set VOYGENT_CAPTURE_MCP_URL to auto-clean.`);
}
