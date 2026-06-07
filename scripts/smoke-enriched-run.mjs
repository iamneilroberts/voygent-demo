#!/usr/bin/env node
// Headless enriched-run smoke: drives /chat over SSE (no browser) and asserts
// the folio came back enriched (days + dining). Promoted from the 2026-06-07
// session's inline analyzer per the handoff + wild-wolf acceptance criteria.
//
// Default (auto-pick path, one exchange):
//   node scripts/smoke-enriched-run.mjs --base http://localhost:8787 \
//     --prompt "Plan the Cancún beach week trip end to end — round-trip flights from Atlanta (ATL) to Cancun for 2 travelers, Mar 13, 2027 to Mar 20, 2027, plus a few hotel options."
//
// Boards mode (claude skin: scripted picks, validates category sequencing):
//   node scripts/smoke-enriched-run.mjs --boards [--base ...] [--prompt ...]
//
// Costs real LLM + MCP calls — run against local dev unless you mean it.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
    return acc;
  }, []),
);
const BASE = args.base ?? "http://localhost:8787";
const BOARDS = !!args.boards;
const PROMPT = args.prompt ??
  "Plan the Cancún beach week trip end to end — round-trip flights from Atlanta (ATL) to Cancun for 2 travelers, Mar 13, 2027 to Mar 20, 2027, plus a few hotel options.";
const SESSION = `smoke-${Math.random().toString(36).slice(2, 10)}`;

/** POST one chat message; collect all SSE events until the stream closes. */
async function exchange(message) {
  const res = await fetch(`${BASE}/chat?session=${SESSION}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.DEMO_TEST_TOKEN ? { "x-demo-test": process.env.DEMO_TEST_TOKEN } : {}) },
    body: JSON.stringify(BOARDS ? { message, mode: "boards" } : { message }),
  });
  if (!res.ok || !res.body) throw new Error(`POST /chat -> ${res.status}`);
  const events = [];
  let buf = "";
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) { try { events.push(JSON.parse(line.slice(6))); } catch { /* tolerate */ } }
    }
  }
  return events;
}

const all = [];
function digest(events, label) {
  all.push(...events);
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  const tools = events.filter((e) => e.type === "tool" && e.phase === "done");
  const boards = events.filter((e) => e.type === "board");
  const errors = events.filter((e) => e.type === "error");
  const folios = events.filter((e) => e.type === "folio");
  console.log(`\n=== ${label} ===`);
  console.log(`tools: ${tools.map((t) => `${t.tool}${/error|ERROR/.test(t.summary ?? "") ? "(ERR)" : ""}`).join(", ") || "(none)"}`);
  for (const t of tools) console.log(`  ${t.tool}: ${t.summary ?? ""}`);
  if (boards.length) console.log(`boards: ${boards.map((b) => b.board?.kind ?? b.kind).join(", ")}`);
  if (errors.length) console.log(`ERRORS: ${errors.map((e) => e.message).join(" | ")}`);
  console.log(`assistant: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
  return { text, tools, boards, errors, folio: folios.at(-1)?.folio ?? null };
}

function pickFromBoard(boardEv, kind) {
  const b = boardEv.board ?? boardEv;
  const c = (b.candidates ?? b.options ?? [])[0];
  if (!c) throw new Error(`board ${kind} has no candidates: ${JSON.stringify(b).slice(0, 200)}`);
  return `I'll take the ${kind} option ${c.id} (${c.summary ?? c.label ?? ""}).`;
}

const t0 = Date.now();
let r1 = digest(await exchange(PROMPT), "turn 1: build request");
let finalFolio = r1.folio;

if (BOARDS) {
  // Sequencing assertion: turn 1 must present flights only.
  const kinds1 = r1.boards.map((b) => (b.board ?? b).kind);
  if (kinds1.includes("hotel")) console.log("SEQUENCING FAIL: hotel board emitted before a flight was picked");
  const flightBoard = r1.boards.find((b) => (b.board ?? b).kind === "flight");
  if (!flightBoard) throw new Error("no flight board on turn 1");

  const r2 = digest(await exchange(pickFromBoard(flightBoard, "flight")), "turn 2: flight pick");
  finalFolio = r2.folio ?? finalFolio;
  const hotelBoard = r2.boards.find((b) => (b.board ?? b).kind === "hotel");
  if (!hotelBoard) throw new Error("no hotel board after flight pick (sequencing expects hotels this turn)");

  const r3 = digest(await exchange(pickFromBoard(hotelBoard, "hotel")), "turn 3: hotel pick (enrichment turn)");
  finalFolio = r3.folio ?? finalFolio;
}

// ---- verdict ----
const f = finalFolio ?? {};
const days = Array.isArray(f.days) ? f.days : [];
const includes = Array.isArray(f.includes) ? f.includes : [];
const acts = days.reduce((a, d) => a + (Array.isArray(d.activities) ? d.activities.length : 0), 0);
const dining = days.flatMap((d) => (Array.isArray(d.dining) ? d.dining : []));
const enrichTools = ["excursion_search", "apply_gap_tour_picks", "tripadvisor_search"];
const calledEnrich = enrichTools.filter((n) => all.some((e) => e.type === "tool" && e.tool === n));

console.log("\n=== VERDICT ===");
console.log(`folio: ${days.length} days · ${acts} activities · ${dining.length} dining · ${includes.length} includes`);
console.log(`enrichment tools called: ${calledEnrich.join(", ") || "NONE"}`);
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s · session: ${SESSION}`);
const pass = days.length >= 1 && acts >= 1 && dining.length >= 1;
console.log(pass ? "PASS ✅" : "FAIL ❌ (expected ≥1 day with ≥1 activity and ≥1 dining pick)");

// Self-cleanup: smoke trips persist under the real MCP user's prefix. If the
// MCP URL is available (same env var the capture script uses), delete the trip.
const cleanupUrl = process.env.SMOKE_CLEANUP_MCP_URL ?? process.env.VOYGENT_CAPTURE_MCP_URL;
const tripId = f.tripId;
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
process.exit(pass ? 0 : 1);
