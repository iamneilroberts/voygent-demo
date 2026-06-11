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
// Repeat mode (acceptance harness — Dublin build, phase machine on):
//   DEMO_TEST_TOKEN=<tok> node scripts/smoke-enriched-run.mjs --boards \
//     --base https://voygent-demo.somotravel.workers.dev \
//     --repeat 10 \
//     --fixture worker/fixtures/dublin-oct.json \
//     --prompt "Plan the Dublin in October trip for 2."
//   Runs the Dublin build N times; each run must pass ALL of:
//     • days.length >= 3
//     • >= 1 free activity AND >= 1 paid activity (cross-referenced against fixture)
//     • dining.length >= 4
//     • no restaurant/activity name in assistant prose that isn't in the fixture
//   Prints PASS/FAIL per run and a final N/N summary. Exits 0 if all pass, 1 otherwise.
//
// Costs real LLM + MCP calls — run against local dev unless you mean it.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
    return acc;
  }, []),
);

// ---- bail-out guard: --help or no --base ----
if (args.help) {
  console.log("Usage: node scripts/smoke-enriched-run.mjs [--base URL] [--boards] [--prompt TEXT] [--repeat N] [--fixture PATH]");
  process.exit(0);
}
if (!args.base) {
  console.error("Usage: node scripts/smoke-enriched-run.mjs --base <URL> [--boards] [--prompt TEXT] [--repeat N] [--fixture PATH]");
  console.error("  --base required (e.g. http://localhost:8787)");
  process.exit(1);
}

const BASE = args.base;
const BOARDS = !!args.boards;
const REPEAT = Math.max(1, parseInt(args.repeat ?? "1", 10));
// Default prompt must match the default fixture. The acceptance bar (--repeat) checks
// the build against the Dublin fixture (below), so in acceptance mode default to the
// Dublin prompt; the legacy single-run path keeps the Cancún auto-pick prompt. Pass
// --prompt to override either. (A Cancún prompt against the Dublin fixture fails every
// free/paid + prose-name check by construction.)
const DUBLIN_PROMPT = "Plan the Dublin in October trip for 2 travelers.";
const CANCUN_PROMPT =
  "Plan the Cancún beach week trip end to end — round-trip flights from Atlanta (ATL) to Cancun for 2 travelers, Mar 13, 2027 to Mar 20, 2027, plus a few hotel options.";
const PROMPT = args.prompt ?? (REPEAT > 1 ? DUBLIN_PROMPT : CANCUN_PROMPT);

// ---- fixture loading (for --repeat acceptance assertions) ----
// Fixture path: default is the dublin-oct fixture (sibling to this script, one dir up).
const FIXTURE_PATH = args.fixture
  ? resolve(process.cwd(), args.fixture)
  : resolve(__dirname, "..", "worker", "fixtures", "dublin-oct.json");

// Build the allowed-name set from the dublin fixture.
// Names come from three places:
//   excursions[].title  — tour/activity names (both free and paid)
//   dining[].name       — restaurant names
// We store them lowercased for case-insensitive matching.
// NOTE: the fixture has no separate FREE_THINGS array; free items are excursions
// with free:true / priceFrom===0.
let fixtureAllowedNames = new Set();
let fixtureFreeNames = new Set();    // excursion titles where free===true or priceFrom===0
let fixturePaidNames = new Set();    // excursion titles where priceFrom > 0
let fixtureDiningNames = new Set();  // restaurant names
let fixtureLoaded = false;

function loadFixture() {
  if (fixtureLoaded) return;
  if (!existsSync(FIXTURE_PATH)) {
    console.warn(`[warn] fixture not found at ${FIXTURE_PATH} — prose-name and free/paid checks will be SKIPPED`);
    fixtureLoaded = true;
    return;
  }
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  for (const exc of (raw.excursions ?? [])) {
    const t = (exc.title ?? "").trim();
    if (!t) continue;
    fixtureAllowedNames.add(t.toLowerCase());
    if (exc.free === true || exc.priceFrom === 0 || exc.priceFrom === null) {
      fixtureFreeNames.add(t.toLowerCase());
    } else if (typeof exc.priceFrom === "number" && exc.priceFrom > 0) {
      fixturePaidNames.add(t.toLowerCase());
    }
  }
  for (const d of (raw.dining ?? [])) {
    const n = (d.name ?? "").trim();
    if (n) { fixtureAllowedNames.add(n.toLowerCase()); fixtureDiningNames.add(n.toLowerCase()); }
  }
  fixtureLoaded = true;
}

/** POST one chat message; collect all SSE events until the stream closes. */
async function exchange(message, session) {
  const res = await fetch(`${BASE}/chat?session=${session}`, {
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

function digest(events, label, allAcc) {
  if (allAcc) allAcc.push(...events);
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

// Scan the captured stream for any tool call that came back errored. The worker's
// convention is a result string starting with "ERROR" (see session-do baseCallTool),
// mirrored onto the inspector tool event's `ok: false`. This catches the class of bug
// where a tool returns e.g. "ERROR: Cannot read properties of undefined (...)" — including
// when a side-channel (telemetry) fault surfaces as a real tool's result. Returns one
// {tool, result} per errored call, in stream order.
function findToolErrors(allEvents) {
  const out = [];
  for (const e of allEvents) {
    if (e.type !== "inspector" || e.kind !== "tool") continue;
    const result = typeof e.result === "string" ? e.result : "";
    if (e.ok === false || /^ERROR\b/i.test(result.trim())) {
      out.push({ tool: e.name ?? e.tool ?? "(unknown)", result: result || "(ok=false, no result text)" });
    }
  }
  return out;
}

function pickFromBoard(boardEv, kind) {
  const b = boardEv.board ?? boardEv;
  const c = (b.candidates ?? b.options ?? [])[0];
  if (!c) throw new Error(`board ${kind} has no candidates: ${JSON.stringify(b).slice(0, 200)}`);
  return `I'll take the ${kind} option ${c.id} (${c.summary ?? c.label ?? ""}).`;
}

// ---- prose-name heuristic ----
// Strategy: split the assistant's full prose into candidate "proper names" by
// looking for Title-Cased multi-word runs (2+ consecutive capitalized words),
// then flag any that match a fixture name and... wait, we want the inverse:
// flag names that appear in prose but are NOT in the fixture.
//
// Heuristic limitations (documented):
//   - We match exact fixture names as substrings of the prose (case-insensitive).
//     This means a name like "St Stephen's Green" is caught if it appears verbatim.
//   - We do NOT run a full NER pass; generic city/country nouns (Dublin, Ireland,
//     October) and common English words are NOT checked against the fixture.
//   - The check is conservative: we only flag names that are at least 4 chars,
//     contain a letter, are NOT in the fixture, and pattern-match as a proper noun
//     run (Title Case >= 2 words). This will miss short fabricated names and
//     accept valid fixture names that happen to be Title Case.
//   - False positives are possible (e.g. a hotel name from the fixture that the
//     model quotes verbatim would NOT be flagged). False negatives are also
//     possible (fabricated names the fixture doesn't carry won't be caught unless
//     they Title-match). Use as a smoke-check, not a guarantee.
// toolSourcedBlob is a lowercase concatenation of everything the TOOLS returned this
// run (the committed folio + the presented board candidates + tool-result text). The
// anti-fabrication invariant is "a name in prose must have come from a tool result in
// THIS conversation" (the seed's HARD DATA RULE) — NOT "must be in the static excursion
// /dining fixture". Hotels (hotel_search), airlines (flight_search) and Dublin landmarks
// are legitimately tool-sourced but absent from the fixture, so we also accept any name
// present in toolSourcedBlob. The fixture remains a fallback allow-set for replay names.
function checkProseNames(proseText, toolSourcedBlob = "") {
  if (!fixtureLoaded || fixtureAllowedNames.size === 0) return { ok: true, flagged: [] };

  // Build a lowercase blob for substring matching
  const proseLower = proseText.toLowerCase();

  // For each fixture name, note if it appears in prose (these are ALLOWED).
  // Then extract candidate proper-noun runs from prose and flag any that:
  //   a) aren't in the fixture's allowed set, AND
  //   b) look like a specific named venue/attraction (not a generic word).
  //
  // We detect candidates by regex: runs of 2+ Title-Cased words (each ≥3 chars),
  // possibly separated by common connectors (of, the, and, &, -, ').
  const TITLE_RUN = /\b([A-Z][a-z']{2,}(?:\s+(?:of|the|and|&|a|an|de|du|des|le|la|at|Bar|by|in|on|for|to|-)?)?){2,}\b/g;
  const candidates = new Set();
  for (const m of proseText.matchAll(TITLE_RUN)) {
    const raw = m[0].trim();
    // Skip very short hits, pure acronyms, or all-caps (like "USA", "DUB")
    if (raw.length < 6) continue;
    if (/^[A-Z]+$/.test(raw)) continue;
    // Skip common non-venue openers that produce false positives
    if (/^(The Trip|Our Trip|Day \d|The Folio|The Plan|The Hotel|The Flight|The Dublin|October Trip|Dublin In|In October)/i.test(raw)) continue;
    candidates.add(raw.toLowerCase());
  }

  // A name is "flagged" if it appears in the candidate set AND is not in the fixture's allowed-name set.
  // We also skip names that are clearly geographic (Dublin, Ireland, October) or airline/hotel brand noise.
  const ALWAYS_OK = new Set([
    "dublin", "ireland", "october", "atlantic", "wicklow", "galway", "kilkenny",
    "glendalough", "cliffs of moher", "phoenix park", "temple bar", "grafton street",
    "guinness storehouse", "book of kells", "molly malone", "trinity college",
    "ha'penny bridge", "liffey", "city centre", "st stephen's green",
    "national museum", "grand canal", "georgian dublin", "merrion square",
    "north docks", "south dublin", "east link", "river liffey",
    // airlines (tool-sourced from flight_search; safety net beyond the blob)
    "american", "american airlines", "delta", "united", "aer lingus", "jetblue",
  ]);

  // The greedy Title-Case regex captures trailing/leading connector + article words
  // ("River Liffey In", "The American", "Both American", "Your Dublin"). Strip those
  // edges before matching so "river liffey in" → "river liffey", "the american" →
  // "american". (Do NOT strip interior tokens — "Temple Bar" must stay intact.)
  const EDGE = new Set(["the", "a", "an", "your", "our", "my", "both", "of", "and", "&", "at", "in", "on", "for", "to", "by", "de", "du"]);
  const normalizeCandidate = (c) => {
    let toks = c.split(/\s+/).filter(Boolean);
    while (toks.length && EDGE.has(toks[0])) toks.shift();
    while (toks.length && EDGE.has(toks[toks.length - 1])) toks.pop();
    return toks.join(" ").trim();
  };
  // Allow-set blob for token-overlap (paraphrase tolerance, below).
  const allowBlob = (Array.from(fixtureAllowedNames).join(" ") + " " + Array.from(ALWAYS_OK).join(" ") + " " + toolSourcedBlob);
  const okSubstr = (c) => {
    if (fixtureAllowedNames.has(c) || ALWAYS_OK.has(c)) return true;
    for (const a of fixtureAllowedNames) { if (a.includes(c) || c.includes(a)) return true; }
    for (const a of ALWAYS_OK) { if (a.includes(c) || c.includes(a)) return true; }
    if (toolSourcedBlob && c.length >= 4 && toolSourcedBlob.includes(c)) return true; // committed/presented by a tool this run
    // Paraphrase tolerance: a typo'd/reworded real name (e.g. "Darley Kelly's Bar" for
    // the fixture's "Darkey Kelly's") shares a DISTINCTIVE token with a real name. A
    // wholly fabricated venue shares no such token, so this catches fabrication while
    // tolerating minor model paraphrase. Token must be ≥5 alpha chars (apostrophes
    // stripped) to avoid matching on common words.
    for (const tok of c.split(/[\s']+/)) {
      const t = tok.replace(/[^a-z]/g, "");
      if (t.length >= 5 && allowBlob.includes(t)) return true;
    }
    return false;
  };

  const flagged = [];
  for (const c of candidates) {
    const n = normalizeCandidate(c);
    if (!n || n.length < 4) continue;
    if (okSubstr(n) || okSubstr(c)) continue;
    flagged.push(c);
  }
  return { ok: flagged.length === 0, flagged };
}

// ---- acceptance assertions for one run ----
// These are the wild-wolf acceptance criteria (Dublin build, phase machine on,
// LLM_MODEL=claude-haiku-4-5). Applied only when --repeat is used.
function assertFolio(folio, proseText, toolSourcedBlob = "") {
  const failures = [];
  const f = folio ?? {};
  const days = Array.isArray(f.days) ? f.days : [];
  const allActivities = days.flatMap((d) => Array.isArray(d.activities) ? d.activities : []);
  const dining = days.flatMap((d) => Array.isArray(d.dining) ? d.dining : []);

  // 1. days.length >= 3
  if (days.length < 3) failures.push(`days.length=${days.length} (need ≥3)`);

  // 2. dining.length >= 4
  if (dining.length < 4) failures.push(`dining.length=${dining.length} (need ≥4)`);

  // 3. >= 1 free activity AND >= 1 paid activity.
  // The projected folio's FolioActivity only carries { name, description, url, time } —
  // free/priceFrom is stripped by folio-sync. We cross-reference activity names against
  // the dublin fixture to classify them. If the fixture is not loaded (unknown fixture),
  // we skip this assertion and note it.
  if (fixtureLoaded && fixtureAllowedNames.size > 0) {
    let hasFree = false;
    let hasPaid = false;
    for (const act of allActivities) {
      const nameLower = (act.name ?? "").toLowerCase();
      // Exact match against fixture free/paid sets; also do substring matching
      // since the model may paraphrase slightly.
      let matchedFree = fixtureFreeNames.has(nameLower);
      let matchedPaid = fixturePaidNames.has(nameLower);
      if (!matchedFree && !matchedPaid) {
        // Try substring: fixture name appears inside the activity name or vice versa
        for (const fn of fixtureFreeNames) { if (nameLower.includes(fn) || fn.includes(nameLower)) { matchedFree = true; break; } }
        for (const pn of fixturePaidNames) { if (nameLower.includes(pn) || pn.includes(nameLower)) { matchedPaid = true; break; } }
      }
      if (matchedFree) hasFree = true;
      if (matchedPaid) hasPaid = true;
    }
    if (!hasFree) failures.push(`no free activity in folio (need ≥1 from fixture free set)`);
    if (!hasPaid) failures.push(`no paid activity in folio (need ≥1 from fixture paid set)`);
  } else {
    console.log("  [skip] free/paid assertion — fixture not loaded");
  }

  // 4. Prose-name check: no restaurant/activity proper name in prose that isn't in the fixture.
  if (fixtureLoaded && fixtureAllowedNames.size > 0) {
    const { ok, flagged } = checkProseNames(proseText, toolSourcedBlob);
    if (!ok) failures.push(`prose contains ${flagged.length} possible fabricated name(s) (not in folio/boards/fixture): ${flagged.slice(0, 5).join(", ")}`);
  }

  return failures;
}

// ---- single run ----
async function runOnce(runNum) {
  const SESSION = `smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const runLabel = REPEAT > 1 ? ` [run ${runNum}/${REPEAT}]` : "";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`smoke-enriched-run${runLabel} · session: ${SESSION}`);
  const t0 = Date.now();
  const allEvents = [];
  let proseText = "";

  let r1 = digest(await exchange(PROMPT, SESSION), `turn 1: build request${runLabel}`, allEvents);
  proseText += r1.text;
  let finalFolio = r1.folio;

  if (BOARDS) {
    // Sequencing assertion: turn 1 must present flights only.
    const kinds1 = r1.boards.map((b) => (b.board ?? b).kind);
    if (kinds1.includes("hotel")) console.log("SEQUENCING FAIL: hotel board emitted before a flight was picked");
    const flightBoard = r1.boards.find((b) => (b.board ?? b).kind === "flight");
    if (!flightBoard) throw new Error(`no flight board on turn 1${runLabel}`);

    const r2 = digest(await exchange(pickFromBoard(flightBoard, "flight"), SESSION), `turn 2: flight pick${runLabel}`, allEvents);
    proseText += r2.text;
    finalFolio = r2.folio ?? finalFolio;
    const hotelBoard = r2.boards.find((b) => (b.board ?? b).kind === "hotel");
    if (!hotelBoard) throw new Error(`no hotel board after flight pick${runLabel} (sequencing expects hotels this turn)`);

    const r3 = digest(await exchange(pickFromBoard(hotelBoard, "hotel"), SESSION), `turn 3: hotel pick (enrichment turn)${runLabel}`, allEvents);
    proseText += r3.text;
    finalFolio = r3.folio ?? finalFolio;
  }

  // ---- verdict ----
  const f = finalFolio ?? {};
  const days = Array.isArray(f.days) ? f.days : [];
  const includes = Array.isArray(f.includes) ? f.includes : [];
  const acts = days.reduce((a, d) => a + (Array.isArray(d.activities) ? d.activities.length : 0), 0);
  const dining = days.flatMap((d) => (Array.isArray(d.dining) ? d.dining : []));
  const enrichTools = ["excursion_search", "apply_gap_tour_picks", "tripadvisor_search"];
  const calledEnrich = enrichTools.filter((n) => allEvents.some((e) => e.type === "tool" && e.tool === n));

  console.log("\n=== VERDICT ===");
  console.log(`folio: ${days.length} days · ${acts} activities · ${dining.length} dining · ${includes.length} includes`);
  console.log(`enrichment tools called: ${calledEnrich.join(", ") || "NONE"}`);
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s · session: ${SESSION}`);

  // Tool-error invariant (applies to BOTH modes): no tool call may come back errored.
  // This is the check that would have caught the excursion_search rawTokensEst crash.
  const toolErrors = findToolErrors(allEvents);
  if (toolErrors.length) {
    console.log(`TOOL ERRORS (${toolErrors.length}):`);
    for (const te of toolErrors) console.log(`  ✗ ${te.tool}: ${te.result.slice(0, 160)}`);
  }
  const toolErrorFailures = toolErrors.map(
    (te) => `tool ${te.tool} returned an error result: ${te.result.slice(0, 160)}`,
  );

  let failures;
  if (REPEAT > 1) {
    // Everything the tools returned/committed this run: the final folio + every board
    // candidate presented + every tool-result text captured in the event stream. Any
    // proper name in prose that appears here is tool-sourced (not fabricated).
    const toolSourcedBlob = [
      JSON.stringify(finalFolio ?? {}),
      ...allEvents.filter((e) => e.type === "board" || e.board || e.kind === "flight" || e.kind === "hotel").map((e) => JSON.stringify(e)),
      ...allEvents.filter((e) => e.type === "inspector" && e.kind === "tool").map((e) => JSON.stringify(e.result ?? "")),
    ].join(" ").toLowerCase();
    // --repeat mode: acceptance assertions + the tool-error invariant
    failures = [...assertFolio(finalFolio, proseText, toolSourcedBlob), ...toolErrorFailures];
    if (failures.length === 0) {
      console.log(`PASS ✅${runLabel}`);
    } else {
      console.log(`FAIL ❌${runLabel}`);
      for (const f of failures) console.log(`  ✗ ${f}`);
    }
  } else {
    // Legacy mode (single run, original thresholds preserved) + the tool-error invariant
    const folioPass = days.length >= 1 && acts >= 1 && dining.length >= 1;
    failures = [
      ...(folioPass ? [] : ["legacy: expected ≥1 day with ≥1 activity and ≥1 dining pick"]),
      ...toolErrorFailures,
    ];
    console.log(failures.length === 0 ? "PASS ✅" : "FAIL ❌");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }

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

  return { pass: failures.length === 0, failures };
}

// ---- main ----
if (REPEAT > 1) loadFixture();

if (REPEAT === 1) {
  // Original single-run path — identical behavior to pre-extension.
  const { pass } = await runOnce(1);
  process.exit(pass ? 0 : 1);
} else {
  // Repeat mode: run N times, collect results, print summary.
  let passed = 0;
  const results = [];
  for (let i = 1; i <= REPEAT; i++) {
    const result = await runOnce(i);
    results.push(result);
    if (result.pass) passed++;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${passed}/${REPEAT} PASSED`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.pass) console.log(`  run ${i + 1}: FAIL — ${r.failures.join("; ")}`);
  }
  if (passed === REPEAT) {
    console.log("All runs PASSED ✅");
    process.exit(0);
  } else {
    console.log(`${REPEAT - passed} run(s) FAILED ❌`);
    process.exit(1);
  }
}
