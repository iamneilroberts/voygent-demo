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
//
// Before writing each fixture, validates that every excursion bookingUrl + dining
// url still resolves (HEAD/GET, follow redirects). Warns on dead links by default;
// --strict-urls aborts the route, --no-url-check skips the pass.

import { mkdir, writeFile, readFile } from "node:fs/promises";
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
// Validate every excursion bookingUrl + dining url resolves before the fixture
// ships (dead links rot silently in a public demo). Default: warn. --strict-urls
// aborts the route on a hard-dead link. --no-url-check skips the pass entirely.
const STRICT_URLS = process.argv.includes("--strict-urls");
const SKIP_URL_CHECK = process.argv.includes("--no-url-check");
// Credentialed cpmaxx hotel capture is OPT-IN (Kim's creds, a few paced calls per
// run). Default OFF so a routine serp re-capture never touches the advisor portal.
const CAPTURE_CPMAXX = process.argv.includes("--cpmaxx");
const URL_CHECK_UA = "Mozilla/5.0 (compatible; VoygentFixtureBot/1.0)";

// --- curated demo routes (confirmed 2026-06-05). These double as Phase-2b preset chips. ---
const ROUTES = [
  { id: "dublin-oct",   label: "Dublin in October",        origin: "MOB", destination: "DUB", city: "Dublin",        depart: "2026-10-12", ret: "2026-10-19", adults: 2 },
  { id: "cancun-beach", label: "Cancún beach week",        origin: "ATL", destination: "CUN", city: "Cancun",        depart: "2027-03-13", ret: "2027-03-20", adults: 2 },
  { id: "tokyo-blossom",label: "Tokyo cherry-blossom",     origin: "SFO", destination: "HND", city: "Tokyo",         depart: "2027-04-04", ret: "2027-04-14", adults: 2 },
  { id: "rome-amalfi",  label: "Rome + Amalfi",            origin: "JFK", destination: "FCO", city: "Rome",          depart: "2026-09-10", ret: "2026-09-20", adults: 2 },
  { id: "nyc-weekend",  label: "NYC long weekend",         origin: "ORD", destination: "JFK", city: "New York",      depart: "2027-02-12", ret: "2027-02-15", adults: 2 },
];

// LLM-proposed + TripAdvisor-validated free "things to do" — the model's value-add:
// internal-knowledge candidates, each confirmed legit via tripadvisor_search
// (category=attractions) on 2026-06-06; the TA location_id + reviewCount are the
// evidence. Viator returns only paid tours, so these deliver the demo's "& free
// things". Editorial, not bookable: productCode = "TA-<location_id>". Route-scoped
// so a re-capture preserves them (merged into excursions in captureRoute).
const FREE_THINGS_BY_ID = {
  "dublin-oct": [
    { productCode: "TA-189054", title: "St Stephen's Green", day: 1, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.5, reviewCount: 17094,
      description: "Dublin's beloved Victorian public park off Grafton Street — free, central, perfect for a stroll.",
      bookingUrl: "https://heritageireland.ie/visit/places-to-visit/st-stephens-green/", coverImage: null },
    { productCode: "TA-189068", title: "Phoenix Park", day: 2, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.6, reviewCount: 4877,
      description: "One of Europe's largest enclosed city parks — free to roam, with wild fallow deer and miles of trails.",
      bookingUrl: "http://www.phoenixpark.ie", coverImage: null },
    { productCode: "TA-274489", title: "National Museum of Ireland \u2013 Archaeology", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.6, reviewCount: 5921,
      description: "Free national museum on Kildare Street — Celtic gold, bog bodies, and Viking Dublin.",
      bookingUrl: "https://www.museum.ie/", coverImage: null },
    { productCode: "TA-216272", title: "Ha'penny Bridge", day: 4, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.1, reviewCount: 2460,
      description: "The iconic cast-iron pedestrian bridge over the Liffey — a free, classic Dublin photo stop.",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g186605-d216272-Reviews-Ha_penny_Bridge-Dublin_County_Dublin.html", coverImage: null },
  ],
  "cancun-beach": [
    { productCode: "TA-152700", title: "Playa Delfines", day: 2, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.5, reviewCount: 5698,
      description: "Cancún's iconic free public beach on the hotel-zone cliffs — the giant CANCÚN letters and turquoise-water views, no entry fee.",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g150807-d152700-Reviews-Playa_Delfines-Cancun_Yucatan_Peninsula.html", coverImage: null },
    { productCode: "TA-152697", title: "Playa Langosta", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.3, reviewCount: 403,
      description: "A small, calm free beach near downtown — gentle water and a quieter alternative to the resort strip.",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g150807-d152697-Reviews-Playa_Langosta-Cancun_Yucatan_Peninsula.html", coverImage: null },
    { productCode: "TA-7715234", title: "El Parque de las Palapas", day: 4, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.2, reviewCount: 628,
      description: "Downtown Cancún's lively free town square — evening food stalls, live music, and local crafts.",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g150807-d7715234-Reviews-El_Parque_de_las_Palapas-Cancun_Yucatan_Peninsula.html", coverImage: null },
  ],
  "nyc-weekend": [
    { productCode: "TA-105127", title: "Central Park", day: 1, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.7, reviewCount: 134452,
      description: "843 acres of free Manhattan parkland — the Mall, Bethesda Terrace, and the Bow Bridge, open dawn to late.",
      bookingUrl: "https://www.centralparknyc.org/", coverImage: null },
    { productCode: "TA-519474", title: "The High Line", day: 2, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.5, reviewCount: 63414,
      description: "A free elevated park on a former rail line above the West Side — gardens, art, and Hudson River views.",
      bookingUrl: "https://www.thehighline.org/", coverImage: null },
    { productCode: "TA-102741", title: "Brooklyn Bridge", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.7, reviewCount: 26249,
      description: "Walk the free pedestrian promenade across the East River — one of the world's most famous bridges, best at sunrise.",
      bookingUrl: "http://www.nyc.gov/html/dot/html/bridges/bridges.shtml", coverImage: null },
    { productCode: "TA-143363", title: "Staten Island Ferry", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.6, reviewCount: 23165,
      description: "The free 25-minute ferry past the Statue of Liberty and the Lower Manhattan skyline — no ticket, runs around the clock.",
      bookingUrl: "http://www.nyc.gov/html/dot/html/ferrybus/statfery.shtml", coverImage: null },
  ],
  "rome-amalfi": [
    { productCode: "TA-190121", title: "Piazza Navona", day: 2, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.5, reviewCount: 40156,
      description: "Rome's grand Baroque square — Bernini's Fountain of the Four Rivers, street artists, and cafés, free to wander.",
      bookingUrl: "https://www.turismoroma.it/it/node/1516", coverImage: null },
    { productCode: "TA-190131", title: "Trevi Fountain", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.4, reviewCount: 104548,
      description: "The monumental Baroque fountain — toss a coin to ensure a return to Rome; free and dazzling, especially after dark.",
      bookingUrl: "https://www.turismoroma.it/it/luoghi/fontana-di-trevi", coverImage: null },
    { productCode: "TA-197717", title: "Spanish Steps", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 3.9, reviewCount: 23241,
      description: "The sweeping 18th-century staircase from Piazza di Spagna up to Trinità dei Monti — a free, classic Rome perch.",
      bookingUrl: "https://www.turismoroma.it/it/luoghi/scalinata-di-trinit%C3%A0-dei-monti", coverImage: null },
    { productCode: "TA-190133", title: "Villa Borghese", day: 4, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.5, reviewCount: 8179,
      description: "Rome's great landscaped park above the Spanish Steps — free to roam, with shaded paths, a lake, and city viewpoints (the gallery inside is ticketed).",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g187791-d190133-Reviews-Villa_Borghese-Rome_Lazio.html", coverImage: null },
  ],
  "tokyo-blossom": [
    { productCode: "TA-320447", title: "Senso-ji Temple", day: 2, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.4, reviewCount: 9850,
      description: "Tokyo's oldest temple, in Asakusa — the Kaminarimon gate and the Nakamise market lane, free to visit.",
      bookingUrl: "http://www.senso-ji.jp/", coverImage: null },
    { productCode: "TA-1373780", title: "Meiji Jingu Shrine", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.4, reviewCount: 8493,
      description: "A serene Shinto shrine in a forested 170-acre precinct beside Harajuku — free, and a calm contrast to the city.",
      bookingUrl: "https://www.meijijingu.or.jp/en/", coverImage: null },
    { productCode: "TA-4403399", title: "Shibuya Crossing", day: 3, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.2, reviewCount: 7893,
      description: "The world's busiest pedestrian scramble — free to experience the wave of people surging from every direction.",
      bookingUrl: "https://www.tripadvisor.com/Attraction_Review-g1066456-d4403399-Reviews-Shibuya_Crossing-Shibuya_Tokyo_Tokyo_Prefecture_Kanto.html", coverImage: null },
    { productCode: "TA-320625", title: "Imperial Palace East Gardens", day: 4, free: true, priceFrom: 0, currency: "USD",
      durationMinutes: null, rating: 4.2, reviewCount: 2105,
      description: "The free public gardens on the old Edo Castle grounds — stone ramparts, moats, and seasonal blooms.",
      bookingUrl: "http://www.kunaicho.go.jp/event/higashigyoen/higashigyoen.html", coverImage: null },
  ],
};

const ENC = new TextEncoder();
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) || 1; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
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

// --- fixture URL validation (task: validate fixture URLs at capture time) ---
// HEAD (GET fallback) each link, follow redirects, classify the status:
//   ok      2xx/3xx                          — live
//   blocked 401/403/429                       — reachable but bot-gated; treated as live (warn, not fail)
//   bad     404/410/5xx, timeout, DNS, etc.   — dead; surfaced loudly (and aborts under --strict-urls)
async function checkUrl(url, timeoutMs = 12000) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return { url, status: null, klass: "skip" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const opts = { redirect: "follow", signal: ctl.signal, headers: { "user-agent": URL_CHECK_UA } };
  try {
    let res = await fetch(url, { method: "HEAD", ...opts });
    if (res.status === 405 || res.status === 501) res = await fetch(url, { method: "GET", ...opts }); // some servers reject HEAD
    const s = res.status;
    const klass = (s >= 200 && s < 400) ? "ok" : (s === 401 || s === 403 || s === 429) ? "blocked" : "bad";
    return { url, status: s, klass };
  } catch (e) {
    return { url, status: null, klass: "bad", error: e.name === "AbortError" ? "timeout" : (e.cause?.code ?? e.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function validateFixtureUrls(routeId, excursions, dining) {
  const targets = [
    ...excursions.map((e) => ({ url: e.bookingUrl, label: `excursion ${e.productCode} "${e.title}"` })),
    ...dining.map((d) => ({ url: d.url, label: `dining "${d.name}"` })),
  ].filter((t) => typeof t.url === "string" && t.url);
  if (!targets.length) { log(`  url check: (no URLs to validate)`); return { ok: 0, blocked: 0, bad: 0, badUrls: [] }; }
  const results = [];
  const CONC = 6; // be polite — small concurrency, since several may hit the same host
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    results.push(...await Promise.all(batch.map(async (t) => ({ ...t, ...(await checkUrl(t.url)) }))));
  }
  const bad = results.filter((r) => r.klass === "bad");
  const blocked = results.filter((r) => r.klass === "blocked");
  const ok = results.filter((r) => r.klass === "ok");
  log(`  url check: ${ok.length} ok, ${blocked.length} bot-gated(401/403/429), ${bad.length} BAD${bad.length ? " ⚠" : ""}`);
  for (const b of bad) log(`    ✗ ${b.status ?? b.error} — ${b.label} → ${b.url}`);
  for (const b of blocked) log(`    ? ${b.status} (likely live, bot-gated) — ${b.label}`);
  return { ok: ok.length, blocked: blocked.length, bad: bad.length, badUrls: bad };
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

// Slim a raw cpmaxx ranked hotel (hotel_search source=cpmaxx) to the demo's
// advisor-network shape: the fields the board + price ladder render. Keeps the
// "couldn't come from Google" signals — commission, profit score, quote-sheet
// deep link, property photo, blurb, OTA comparison.
function slimCpmaxxHotel(c, r) {
  const otaPrices = Array.isArray(c.ota_prices)
    ? c.ota_prices.filter((o) => o && (o.name || o.price_per_night != null))
        .map((o) => ({ name: o.name ?? "—", pricePerNight: numOrNull(o.price_per_night) }))
    : [];
  return {
    id: String(c.id ?? ""),
    source: "cpmaxx",
    name: c.name ?? "(unnamed hotel)",
    stars: numOrNull(c.stars),
    area: typeof c.area === "string" ? c.area : null,
    pricePerNight: numOrNull(c.price_per_night),
    priceTotal: numOrNull(c.price_total),
    nights: daysBetween(r.depart, r.ret),
    currency: "USD",
    commission: numOrNull(c.commission),
    commissionPct: numOrNull(c.commission_pct),
    clientPrice: numOrNull(c.client_price),
    marginPct: numOrNull(c.margin_pct),
    profitScore: numOrNull(c.profit_score),
    hotelSheetUrl: typeof c.hotel_sheet_url === "string" ? c.hotel_sheet_url : null,
    image: typeof c.image === "string" ? c.image : null,
    marketingBlurb: typeof c.marketing_blurb === "string" ? c.marketing_blurb.slice(0, 320) : null,
    pictureCount: numOrNull(c.picture_count),
    otaPrices: otaPrices.length ? otaPrices : null,
  };
}

// Stage a slim cpmaxx hotel for promote_hotels_to_lodging, carrying the advisor
// deep link + image + blurb through so the promoted lodging card keeps them.
function cpmaxxHotelToStaging(h, r) {
  return {
    _candidateId: h.id,
    name: h.name,
    area: h.area,
    address: h.area,
    checkIn: r.depart,
    checkOut: r.ret,
    nights: h.nights,
    starRating: h.stars,
    priceTotal: h.priceTotal,
    pricePerNight: h.pricePerNight,
    currency: "USD",
    source: "cpmaxx",
    quoteUrl: h.hotelSheetUrl,
    url: h.hotelSheetUrl,
    image: h.image,
    description: h.marketingBlurb,
    commissionPct: h.commissionPct,
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
    // Viator requires a numeric destination_id — resolve the city first.
    const dest = await callTool("resolve_destination", { query: r.city });
    record("resolve_destination", { query: r.city }, dest);
    const destinationId = dest.json?.viator?.destinationId ?? null;
    if (!destinationId) log(`  resolve_destination: no viator id for ${r.city}`);
    const ex = destinationId
      ? await callTool("excursion_search", { source: "viator", destination_id: destinationId, destination_name: r.city, date: r.depart, max_results: 10 })
      : { json: {}, text: "" };
    record("excursion_search", { source: "viator", destination_id: destinationId, destination_name: r.city }, ex);
    const raw = ex.json?.products ?? ex.json?.candidates ?? [];
    // Spread across days round-robin so each demo day gets activity content.
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    excursions = raw.slice(0, 6).map((c, i) => {
      const priceFrom = numOrNull(c.priceFrom ?? c.price_from);
      return {
        productCode: String(c.productCode ?? c.product_code ?? c.id ?? ""),
        title: c.title ?? c.name,
        day: (i % dayCount) + 1,
        free: priceFrom === 0,
        priceFrom,
        currency: c.currency ?? "USD",
        durationMinutes: numOrNull(c.durationMinutes ?? c.duration_minutes),
        rating: numOrNull(c.rating),
        reviewCount: numOrNull(c.reviewCount ?? c.review_count),
        description: (c.description ?? c.descriptionShort ?? "").slice(0, 200),
        bookingUrl: c.bookingUrl ?? c.booking_url ?? null,
        coverImage: c.coverImage ?? c.cover_image ?? null,
      };
    }).filter((e) => e.productCode && e.title);
    log(`  excursions: ${excursions.length}`);
  } catch (e) { log(`  excursion_search FAILED: ${e.message}`); }
  // Merge the LLM-proposed + TA-validated free things for this route (the value-add).
  { const free = FREE_THINGS_BY_ID[r.id] ?? []; if (free.length) { excursions = excursions.concat(free); log(`  free things (LLM+TA-validated): ${free.length}`); } }

  // 9. DINING (tripadvisor) — editorial local picks.
  let dining = [];
  try {
    const di = await callTool("tripadvisor_search", { query: `best restaurants in ${r.city}`, category: "restaurants", max_results: 10, include_reviews: false });
    record("tripadvisor_search", { query: `best restaurants in ${r.city}`, category: "restaurants" }, di);
    const raw = di.json?.results ?? di.json?.candidates ?? di.json?.locations ?? [];
    const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
    dining = raw.slice(0, 6).map((c, i) => ({
      id: String(c.id ?? c.location_id ?? c.locationId ?? i),
      name: c.name,
      day: (i % dayCount) + 1,
      cuisine: Array.isArray(c.cuisine) ? (c.cuisine[0] ?? null) : (c.cuisine ?? (Array.isArray(c.cuisines) ? c.cuisines[0] : null)),
      rating: numOrNull(c.rating),
      reviewCount: numOrNull(c.reviewCount ?? c.num_reviews),
      priceLevel: c.priceLevel ?? c.price_level ?? null,
      description: (c.description ?? "").slice(0, 200),
      url: c.url ?? c.tripadvisor_url ?? c.website ?? c.web_url ?? null,
    })).filter((d) => d.name);
    log(`  dining: ${dining.length}`);
  } catch (e) { log(`  tripadvisor_search FAILED: ${e.message}`); }

  // Validate every link the fixture will ship before writing it (dead links rot
  // silently in a public demo). Warn by default; --strict-urls aborts the route.
  let urlCheck = { ok: 0, blocked: 0, bad: 0, badUrls: [] };
  if (!SKIP_URL_CHECK) {
    urlCheck = await validateFixtureUrls(r.id, excursions, dining);
    if (STRICT_URLS && urlCheck.bad > 0) {
      throw new Error(`${urlCheck.bad} dead URL(s) in ${r.id} fixture (--strict-urls): ${urlCheck.badUrls.map((b) => b.url).join(", ")}`);
    }
  }

  // Day scaffold (date + location + title per demo day).
  const dayCount = Math.max(1, Math.min(5, daysBetween(r.depart, r.ret)));
  const itineraryDays = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1,
    date: addDays(r.depart, i),
    location: r.city,
    // Day 1 is the arrival; later days are generic. We do NOT label a "Depart" day:
    // dayCount is capped at 5, so the last generated day isn't guaranteed to be r.ret.
    // Exact day structure/labels for the showcased trip are finalized at capture time.
    title: i === 0 ? `Arrive ${r.city}` : `${r.city} — Day ${i + 1}`,
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
    urlsBad: urlCheck.bad, urlsBlocked: urlCheck.blocked,
  };
}

// Band-pick a realistic price mix from a price-wide pool: split the per-night
// range into thirds (budget / mid / upscale) and take 3/3/2, choosing the
// highest-commission property within each band so the advisor's price ladder
// stays interesting. Unpriced hotels are dropped (a board card needs a price);
// short pools top up from the cheapest remainder. Output stays price-ascending.
function pickPriceMix(pool, want) {
  const allPriced = pool.filter((h) => typeof h.pricePerNight === "number" && h.pricePerNight > 0);
  // Prefer properties with a real star rating: cpmaxx reports stars:0 for
  // apartment/suite operators (a data gap), which renders as "0★" on the board.
  const starred = allPriced.filter((h) => (h.stars ?? 0) >= 3);
  const priced = (starred.length >= want ? starred : allPriced)
    .sort((a, b) => a.pricePerNight - b.pricePerNight);
  if (priced.length <= want) return priced;
  const third = Math.ceil(priced.length / 3);
  const bands = [priced.slice(0, third), priced.slice(third, 2 * third), priced.slice(2 * third)];
  const take = [3, 3, want - 6];
  const byCommission = (a, b) => (b.commission ?? 0) - (a.commission ?? 0);
  const picked = bands.flatMap((band, i) => [...band].sort(byCommission).slice(0, take[i]));
  for (const h of priced) {
    if (picked.length >= want) break;
    if (!picked.includes(h)) picked.push(h);
  }
  return picked.sort((a, b) => a.pricePerNight - b.pricePerNight);
}

// Non-destructive cpmaxx hotel capture: spin up a throwaway trip, pull the
// credentialed ranked hotels, stage+promote to capture the lodging cards, then
// MERGE the two new fields into the existing fixture — leaving the curated
// flights/serp-hotels/excursions/dining/day-scaffold untouched. This is the
// --cpmaxx mode; it never re-runs the full serp capture.
async function captureCpmaxxOnly(r) {
  const tripId = `demo-cap-cpmaxx-${r.id}`;
  log(`\n=== ${r.id} (cpmaxx hotels) ===`);
  await callTool("save_trip", {
    tripId,
    data: { meta: { title: `${r.label} (cpmaxx capture)`, destination: r.city, dates: `${r.depart} – ${r.ret}` }, flights: [], lodging: [], hotels: [] },
  });
  // B6: a profit-only top-8 returns exclusively ultra-luxury properties (Rome
  // came back $649–$1,460/night across the board). Pull one wide price-sorted
  // pool in a single credentialed call, then band-pick a realistic mix locally.
  const out = await callTool("hotel_search", {
    source: "cpmaxx", trip_id: tripId,
    destination: r.city, location: r.city,
    check_in: r.depart, check_out: r.ret,
    travelers: { adults: r.adults }, adults: r.adults,
    sort_by: "price_low", top_n: 40,
  });
  // cpmaxx may double-wrap (proxied envelope) — unwrap to reach {hotels:[...]}.
  let body = out.json;
  for (let i = 0; i < 3 && body && Array.isArray(body.content) && body.content[0]?.type === "text"; i++) {
    try { body = JSON.parse(body.content[0].text); } catch { break; }
  }
  const raw = Array.isArray(body?.hotels) ? body.hotels : [];
  const pool = raw.map((c) => slimCpmaxxHotel(c, r)).filter((h) => h.id && h.name);
  const cpmaxxHotels = pickPriceMix(pool, 8);
  log(`  hotel_search cpmaxx: pool ${pool.length} → ${cpmaxxHotels.length} band-picked (per-night ${cpmaxxHotels.map((h) => h.pricePerNight).join("/")})`);
  if (cpmaxxHotels.length === 0) {
    const note = body?.note ? ` note: ${String(body.note).slice(0, 200)}` : "";
    log(`  ⚠ no cpmaxx hotels for ${r.city} — status=${body?.status ?? "?"}.${note}`);
  }
  const promotedCpmaxxLodgingById = {};
  if (cpmaxxHotels.length > 0) {
    const staged = cpmaxxHotels.map((h) => cpmaxxHotelToStaging(h, r));
    await callTool("patch_trip", { tripId, updates: { hotels: staged, lodging: [] } });
    await callTool("promote_hotels_to_lodging", { tripId });
    const rt = await callTool("read_trip", { tripId, raw: true });
    const lodging = Array.isArray(rt.json?.data?.lodging) ? rt.json.data.lodging : [];
    for (const card of lodging) { const cid = card._candidateId ?? null; if (cid) promotedCpmaxxLodgingById[cid] = card; }
    log(`  promoted cpmaxx lodging: ${Object.keys(promotedCpmaxxLodgingById).length}/${cpmaxxHotels.length}`);
  }
  if (!KEEP) {
    try { await callTool("delete_trip", { tripId }); } catch { /* manual cleanup */ }
  }
  // Merge into the existing fixture (read → add two fields → write back).
  const fixPath = resolve(FIX_DIR, `${r.id}.json`);
  let fixture;
  try { fixture = JSON.parse(await readFile(fixPath, "utf8")); }
  catch (e) { throw new Error(`cannot read existing fixture ${r.id}.json to merge cpmaxx (run a full capture first): ${e.message}`); }
  fixture.cpmaxxHotels = cpmaxxHotels;
  fixture.promotedCpmaxxLodgingById = promotedCpmaxxLodgingById;
  await writeFile(fixPath, JSON.stringify(fixture, null, 2));
  log(`  merged cpmaxxHotels + promotedCpmaxxLodgingById into ${r.id}.json`);
  return { id: r.id, cpmaxxHotels: cpmaxxHotels.length, cpmaxxPromoted: Object.keys(promotedCpmaxxLodgingById).length };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(FIX_DIR, { recursive: true });
  const todo = ONLY ? ROUTES.filter((r) => r.id === ONLY) : ROUTES;
  if (todo.length === 0) { console.error(`No route matches --only=${ONLY}`); process.exit(1); }
  const summary = [];
  if (CAPTURE_CPMAXX) {
    // Merge-only credentialed mode: add cpmaxx hotels to existing fixtures.
    for (const r of todo) {
      try { summary.push(await captureCpmaxxOnly(r)); }
      catch (e) { log(`  ROUTE ${r.id} cpmaxx FAILED: ${String(e.message).split(MCP_URL).join("<MCP_URL>")}`); summary.push({ id: r.id, error: e.message }); }
    }
    log(`\n=== cpmaxx summary ===`);
    for (const s of summary) log(`  ${s.id}: ${s.error ? "ERROR " + s.error : `${s.cpmaxxHotels} cpmaxx hotels (${s.cpmaxxPromoted} promoted)`}`);
    return;
  }
  for (const r of todo) {
    try { summary.push(await captureRoute(r)); }
    catch (e) { log(`  ROUTE ${r.id} FAILED: ${e.message}`); summary.push({ id: r.id, error: e.message }); }
  }
  log(`\n=== summary ===`);
  for (const s of summary) log(`  ${s.id}: ${s.error ? "ERROR " + s.error : `${s.flights} flights (${s.promotedFlights} promoted), ${s.hotels} hotels (${s.promotedLodging} promoted)${s.urlsBad ? `, ${s.urlsBad} DEAD URL(s) ⚠` : ""}`}`);
  const anyBad = summary.some((s) => s.urlsBad > 0);
  if (anyBad) log(`\n⚠ One or more fixtures contain dead URLs — see the per-route 'url check' lines above. Re-source or drop them.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
