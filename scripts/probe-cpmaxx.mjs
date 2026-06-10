#!/usr/bin/env node
// One-shot probe: call hotel_search_and_rank (cpmaxx) against the prod per-user MCP
// URL for a single route, to confirm real cpmaxx data comes back and capture its
// exact shape before wiring the demo fixture capture. The MCP URL embeds a token —
// read from VOYGENT_CAPTURE_MCP_URL and NEVER logged.
//
//   VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '\"')" \
//     node scripts/probe-cpmaxx.mjs

const MCP_URL = process.env.VOYGENT_CAPTURE_MCP_URL;
if (!MCP_URL) { console.error("FATAL: set VOYGENT_CAPTURE_MCP_URL (never logged)."); process.exit(1); }

let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 300)}`);
  let payload = {};
  if (!ct.includes("text/event-stream")) { payload = JSON.parse(text); }
  else {
    for (const frame of text.split(/\n\n+/)) {
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n").trim();
      if (data) { try { payload = JSON.parse(data); } catch { /* skip */ } }
    }
  }
  if (payload.error) throw new Error(`MCP ${method}: ${JSON.stringify(payload.error).slice(0, 400)}`);
  return payload.result;
}

async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  let text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  // Unwrap up to 3 nested MCP text envelopes (proxied tools double-wrap).
  let json = null;
  for (let i = 0; i < 4; i++) {
    try { json = JSON.parse(text); } catch { break; }
    if (json && Array.isArray(json.content) && json.content[0]?.type === "text") { text = json.content[0].text; json = null; continue; }
    break;
  }
  return { text, json };
}

const REDACT = (s) => String(s).split(MCP_URL).join("<MCP_URL>");

// Mode 1 (default): list the exposed tools relevant to capture + dump the hotel
// tool's input schema. Mode 2 (--call): call hotel_search source=cpmaxx.
const DO_CALL = process.argv.includes("--call");

async function listTools() {
  const result = await rpc("tools/list", {});
  const tools = result?.tools ?? [];
  console.log(`exposed tools: ${tools.length}`);
  const rx = /hotel|cpmaxx|cruise|car_rental|flight|excursion|tour|resort|onesource|viator/i;
  for (const t of tools.filter((t) => rx.test(t.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  • ${t.name}`);
  }
  const hotel = tools.find((t) => t.name === "hotel_search");
  if (hotel) {
    console.log("\nhotel_search inputSchema.properties keys:", Object.keys(hotel.inputSchema?.properties ?? {}).join(", "));
    const src = hotel.inputSchema?.properties?.source;
    if (src) console.log("hotel_search.source:", JSON.stringify(src).slice(0, 300));
  }
}

const ARGS = {
  source: "cpmaxx",
  destination: "Cancun",
  check_in: "2027-03-13",
  check_out: "2027-03-20",
  travelers: { adults: 2 },
  adults: 2,
  sort_by: "profit",
  top_n: 5,
};

(async () => {
  if (!DO_CALL) { await listTools(); return; }
  console.log("→ hotel_search", JSON.stringify(ARGS));
  let out;
  try { out = await callTool("hotel_search", ARGS); }
  catch (e) { console.error("PROBE ERROR:", REDACT(e.message)); process.exit(2); }

  const body = out.json;
  if (!body || typeof body !== "object") {
    console.log("Non-JSON / unparsed result (first 800 chars):");
    console.log(REDACT(out.text).slice(0, 800));
    return;
  }
  console.log("status:", body.status, "| source:", body.source ?? "(none)");
  console.log("top-level keys:", Object.keys(body).join(", "));
  const hotels = Array.isArray(body.hotels) ? body.hotels : [];
  console.log("hotels returned:", hotels.length);
  if (body.note) console.log("note:", REDACT(body.note).slice(0, 300));
  if (hotels.length) {
    const h = hotels[0];
    console.log("\nhotel[0] keys:", Object.keys(h).join(", "));
    const probe = (k) => console.log(`  ${k}:`, JSON.stringify(h[k]));
    for (const k of ["id", "name", "stars", "area", "price_total", "price_per_night",
      "commission", "commission_pct", "commission_source", "hotel_sheet_url",
      "image", "marketing_blurb", "picture_count", "ota_prices", "client_price", "margin_pct"]) probe(k);
  }
})();
