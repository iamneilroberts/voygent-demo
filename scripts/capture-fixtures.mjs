#!/usr/bin/env node
// One-time fixture capture for the public demo (Phase 1, decision B).
//
// Runs the REAL Voygent MCP pipeline against PROD for a curated set of demo
// routes, using source=serp (only needs SERP_API_KEY, ~$0.01-0.02/call), and
// saves the real candidate arrays as fixtures the demo replays deterministically.
// Also captures one real promoted trip.flights example per route so the demo's
// local promote logic can be validated against ground truth.
//
// SECRET HYGIENE: the prod MCP URL (which embeds a token) is read from the env
// var VOYGENT_CAPTURE_MCP_URL and is NEVER logged. Run via:
//   VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" \
//     node scripts/capture-fixtures.mjs
//
// Writes:
//   scripts/_fixtures-raw/<routeId>.json   full per-step request+response (gitignored, for inspection)
//   worker/fixtures/<routeId>.json         slim { route, flights[], hotels[], promotedFlightExample }
//
// Cleans up: deletes the demo-* trips it created in prod KV (unless --keep).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const RAW_DIR = resolve(REPO, "scripts/_fixtures-raw");
const FIX_DIR = resolve(REPO, "worker/fixtures");

const MCP_URL = process.env.VOYGENT_CAPTURE_MCP_URL;
if (!MCP_URL) {
  console.error("FATAL: set VOYGENT_CAPTURE_MCP_URL (prod per-user MCP URL incl. token). It is never logged.");
  process.exit(1);
}
const KEEP = process.argv.includes("--keep");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice("--only=".length);

// --- curated demo routes (confirmed 2026-06-05). These double as Phase-2b preset chips. ---
const ROUTES = [
  { id: "dublin-oct",   label: "Dublin in October",        origin: "MOB", destination: "DUB", city: "Dublin",        depart: "2026-10-12", ret: "2026-10-19", adults: 2 },
  { id: "cancun-beach", label: "Cancún beach week",        origin: "ATL", destination: "CUN", city: "Cancun",        depart: "2027-03-13", ret: "2027-03-20", adults: 2 },
  { id: "tokyo-blossom",label: "Tokyo cherry-blossom",     origin: "SFO", destination: "HND", city: "Tokyo",         depart: "2027-04-04", ret: "2027-04-14", adults: 2 },
  { id: "rome-amalfi",  label: "Rome + Amalfi",            origin: "JFK", destination: "FCO", city: "Rome",          depart: "2026-09-10", ret: "2026-09-20", adults: 2 },
  { id: "nyc-weekend",  label: "NYC long weekend",         origin: "ORD", destination: "JFK", city: "New York",      depart: "2027-02-12", ret: "2027-02-15", adults: 2 },
];

const ENC = new TextEncoder();
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) || 1; }
function addDays(d, n) { const t = new Date(Date.parse(d) + n * 86400000); return t.toISOString().slice(0, 10); }
let rpcId = 0;
async function rpc(method, params) {
  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  const latencyMs = Date.now() - t0;
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 200)}`);
  let payload = {};
  if (!ct.includes("text/event-stream")) { payload = JSON.parse(text); }
  else {
    for (const frame of text.split(/\n\n+/)) {
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n").trim();
      if (!data) continue;
      try { payload = JSON.parse(data); } catch { /* skip */ }
    }
  }
  if (payload.error) throw new Error(`MCP ${method}: ${JSON.stringify(payload.error).slice(0, 300)}`);
  return { result: payload.result, latencyMs };
}

async function callTool(name, args) {
  const { result, latencyMs } = await rpc("tools/call", { name, arguments: args });
  const text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { text, json, raw: result, latencyMs, responseBytes: ENC.encode(text).length };
}

function log(...a) { console.log(...a); }

function metaFrom(out) {
  if (!out) return undefined;
  return { rawTokensEst: Math.ceil((out.text?.length ?? 0) / 4), responseBytes: out.responseBytes, prodLatencyMs: out.latencyMs };
}

// Map a real HotelCandidate to the trip.hotels[] staging shape that
// promote_hotels_to_lodging reads (name, area, checkIn/checkOut, nights,
// starRating, priceTotal, _candidateId). Empirically validated at capture.
function hotelCandidateToStaging(c) {
  return {
    _candidateId: c.id,
    name: c.name,
    area: c.area ?? c.stay?.location ?? null,
    address: c.area ?? null,
    checkIn: c.stay?.checkIn ?? null,
    checkOut: c.stay?.checkOut ?? null,
    nights: c.nights ?? null,
    starRating: c.starRating ?? null,
    priceTotal: c.priceTotal ?? null,
    pricePerNight: c.pricePerNight ?? null,
    currency: c.currency ?? "USD",
    source: c.source ?? "serp",
  };
}

async function captureRoute(r) {
  const tripId = `demo-cap-${r.id}`;
  const steps = [];
  const record = (name, args, out) => steps.push({ name, args, status: out.json?.status ?? out.json?.ok ?? null, summary: (out.text || "").slice(0, 240) });

  log(`\n=== ${r.id} (${r.origin}->${r.destination}) ===`);

  // 1. create the trip (fresh)
  let out = await callTool("save_trip", {
    tripId,
    data: { meta: { title: `${r.label} (demo fixture)`, destination: r.city, dates: `${r.depart} – ${r.ret}` }, flights: [], lodging: [], hotels: [] },
  });
  record("save_trip", { tripId }, out);
  log(`  save_trip: ${out.json?.status ?? out.text.slice(0, 80)}`);

  // 2. flight_search (serp) accumulating into the per-trip candidate store
  out = await callTool("flight_search", {
    source: "serp", trip_id: tripId,
    origin: r.origin, destination: r.destination,
    departure_date: r.depart, return_date: r.ret, adults: r.adults,
  });
  record("flight_search", { source: "serp", origin: r.origin, destination: r.destination }, out);
  const flightSearchOut = out;
  const flightSearchRaw = out.json ?? out.text;
  log(`  flight_search: ${out.json?.status ?? "?"}`);

  // 3. flight_list action=list -> real FlightCandidate[]
  out = await callTool("flight_list", { tripId, action: "list" });
  record("flight_list", { tripId, action: "list" }, out);
  const flightListOut = out;
  const flightCandidates = out.json?.candidates ?? [];
  log(`  flight_list: ${flightCandidates.length} candidates`);

  // 4. capture the REAL promoted trip.flights for EACH candidate individually,
  //    so the demo replays prod-identical promoted objects keyed by candidate id.
  const promotedFlightsById = {};
  for (const c of flightCandidates) {
    await callTool("patch_trip", { tripId, updates: { flights: [{ _candidateId: c.id }] } });
    const promo = await callTool("promote_flights", { tripId });
    if (promo.json?.ok === false) { log(`    promote ${c.id}: ${promo.json?.error?.code}`); continue; }
    const rt = await callTool("read_trip", { tripId, raw: true });
    promotedFlightsById[c.id] = rt.json?.data?.flights ?? null;
  }
  log(`  promoted flights: ${Object.keys(promotedFlightsById).length}/${flightCandidates.length}`);

  // 5. hotel_search (serp)
  out = await callTool("hotel_search", {
    source: "serp", trip_id: tripId,
    location: r.city, destination: r.city,
    check_in: r.depart, check_out: r.ret, adults: r.adults,
  });
  record("hotel_search", { source: "serp", location: r.city }, out);
  const hotelSearchOut = out;
  log(`  hotel_search: ${out.json?.status ?? "?"}`);

  // 6. hotel_list action=list -> real HotelCandidate[]
  out = await callTool("hotel_list", { tripId, action: "list" });
  record("hotel_list", { tripId, action: "list" }, out);
  const hotelListOut = out;
  const hotelCandidates = out.json?.candidates ?? [];
  log(`  hotel_list: ${hotelCandidates.length} candidates`);

  // 7. capture the REAL promoted lodging cards. Stage ALL candidates into
  //    trip.hotels[] then promote once; map each resulting lodging card back to
  //    its _candidateId.
  const promotedLodgingById = {};
  if (hotelCandidates.length > 0) {
    const staged = hotelCandidates.map(hotelCandidateToStaging);
    await callTool("patch_trip", { tripId, updates: { hotels: staged, lodging: [] } });
    const promo = await callTool("promote_hotels_to_lodging", { tripId });
    record("promote_hotels_to_lodging", { tripId, staged: staged.length }, promo);
    const rt = await callTool("read_trip", { tripId, raw: true });
    const lodging = Array.isArray(rt.json?.data?.lodging) ? rt.json.data.lodging : [];
    for (const card of lodging) {
      const cid = card._candidateId ?? null;
      if (cid) promotedLodgingById[cid] = card;
    }
    log(`  promoted lodging: ${Object.keys(promotedLodgingById).length}/${hotelCandidates.length}`);
  }

  // 8. EXCURSIONS (viator) — real candidates for the demo's enrichment replay.
  //    Viator needs a destination_id; resolve via excursion_search's destination_name
  //    fallback, or pass a known code. Capture whatever comes back; map to the
  //    demo's ExcursionCandidate shape (productCode is load-bearing).
  let excursions = [];
  try {
    const ex = await callTool("excursion_search", { source: "viator", trip_id: tripId, destination_name: r.city, date: r.depart, max_results: 8 });
    record("excursion_search", { source: "viator", destination_name: r.city }, ex);
    const raw = ex.json?.candidates ?? ex.json?.products ?? [];
    // Spread across days round-robin so each demo day gets activity content.
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    excursions = raw.slice(0, 6).map((c, i) => ({
      productCode: c.productCode ?? c.product_code ?? c.id,
      title: c.title ?? c.name,
      day: (i % dayCount) + 1,
      free: Number(c.priceFrom ?? c.price_from ?? 0) === 0,
      priceFrom: c.priceFrom ?? c.price_from ?? null,
      currency: c.currency ?? "USD",
      durationMinutes: c.durationMinutes ?? c.duration_minutes ?? null,
      rating: c.rating ?? null,
      reviewCount: c.reviewCount ?? c.review_count ?? null,
      description: (c.description ?? c.descriptionShort ?? "").slice(0, 200),
      bookingUrl: c.bookingUrl ?? c.booking_url ?? null,
      coverImage: c.coverImage ?? c.cover_image ?? null,
    })).filter((e) => e.productCode && e.title);
    log(`  excursions: ${excursions.length}`);
  } catch (e) { log(`  excursion_search FAILED: ${e.message}`); }

  // 9. DINING (tripadvisor) — editorial local picks.
  let dining = [];
  try {
    const di = await callTool("tripadvisor_search", { trip_id: tripId, location: r.city, category: "restaurants", max_results: 8 });
    record("tripadvisor_search", { location: r.city }, di);
    const raw = di.json?.candidates ?? di.json?.results ?? di.json?.locations ?? [];
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    dining = raw.slice(0, 6).map((c, i) => ({
      id: String(c.id ?? c.location_id ?? c.locationId ?? i),
      name: c.name,
      day: (i % dayCount) + 1,
      cuisine: c.cuisine ?? (Array.isArray(c.cuisines) ? c.cuisines[0] : null),
      rating: c.rating ?? null,
      reviewCount: c.reviewCount ?? c.num_reviews ?? null,
      priceLevel: c.priceLevel ?? c.price_level ?? null,
      description: (c.description ?? "").slice(0, 200),
      url: c.url ?? c.web_url ?? null,
    })).filter((d) => d.name);
    log(`  dining: ${dining.length}`);
  } catch (e) { log(`  tripadvisor_search FAILED: ${e.message}`); }

  // Day scaffold (date + location + title per demo day).
  const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
  const itineraryDays = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1,
    date: addDays(r.depart, i),
    location: r.city,
    title: i === 0 ? `Arrive ${r.city}` : i === dayCount - 1 ? `Depart ${r.city}` : `${r.city} — Day ${i + 1}`,
  }));

  const meta = {
    flightSearch: metaFrom(flightSearchOut),
    flightList:   metaFrom(flightListOut),
    hotelSearch:  metaFrom(hotelSearchOut),
    hotelList:    metaFrom(hotelListOut),
    capturedAt: new Date().toISOString().slice(0, 10),
  };

  // raw dump (for inspection; gitignored)
  await writeFile(resolve(RAW_DIR, `${r.id}.json`), JSON.stringify({
    route: r, steps, flightSearchRaw, flightCandidates, hotelCandidates, promotedFlightsById, promotedLodgingById,
  }, null, 2));

  // slim fixture the demo replays
  await writeFile(resolve(FIX_DIR, `${r.id}.json`), JSON.stringify({
    route: { id: r.id, label: r.label, origin: r.origin, destination: r.destination, city: r.city, depart: r.depart, ret: r.ret, adults: r.adults },
    flights: flightCandidates,
    hotels: hotelCandidates,
    excursions,
    dining,
    itineraryDays,
    promotedFlightsById,
    promotedLodgingById,
    meta,
  }, null, 2));

  // cleanup unless --keep
  if (!KEEP) {
    try { await callTool("delete_trip", { tripId }); log(`  delete_trip: ok`); }
    catch (e) { log(`  delete_trip FAILED (clean up manually: ${tripId}): ${e.message}`); }
  }

  return {
    id: r.id, flights: flightCandidates.length, hotels: hotelCandidates.length,
    promotedFlights: Object.keys(promotedFlightsById).length, promotedLodging: Object.keys(promotedLodgingById).length,
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(FIX_DIR, { recursive: true });
  const todo = ONLY ? ROUTES.filter((r) => r.id === ONLY) : ROUTES;
  if (todo.length === 0) { console.error(`No route matches --only=${ONLY}`); process.exit(1); }
  const summary = [];
  for (const r of todo) {
    try { summary.push(await captureRoute(r)); }
    catch (e) { log(`  ROUTE ${r.id} FAILED: ${e.message}`); summary.push({ id: r.id, error: e.message }); }
  }
  log(`\n=== summary ===`);
  for (const s of summary) log(`  ${s.id}: ${s.error ? "ERROR " + s.error : `${s.flights} flights (${s.promotedFlights} promoted), ${s.hotels} hotels (${s.promotedLodging} promoted)`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
