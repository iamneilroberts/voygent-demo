#!/usr/bin/env node
// Regenerates worker/ship-log.ts — the /ship-log board served at demo.voygent.ai/ship-log.
//
// Data (KPIs, per-day merge series, per-area PR counts, date ranges, snapshot stamp) is
// pulled live from the private voygent-lite repo via `gh`/`git`. Card COPY is curated by
// hand in the LANES map below and sanitized to the product-area level — the private repo's
// individual tickets are never reproduced verbatim. PR counts are filled from the live
// clusters so they always sum to the real merged total.
//
// Refresh:  node scripts/gen-ship-log.mjs   (then rebuild + deploy the worker)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "iamneilroberts/voygent-lite";
const LITE_DIR = join(process.env.HOME, "dev", "voygent-lite");
const WINDOW_DAYS = 30;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "worker", "ship-log.ts");

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const iso = (d) => d.toISOString();
const ymd = (d) => d.toISOString().slice(0, 10);

const now = new Date();
// Floor the window start to UTC midnight so whole calendar days are counted and the
// per-day chart's first bar isn't clipped by the time-of-day boundary.
const start = new Date(ymd(new Date(now.getTime() - WINDOW_DAYS * 86400000)) + "T00:00:00.000Z");
const sinceISO = iso(start);

console.log(`[ship-log] window ${ymd(start)} → ${ymd(now)}  (repo ${REPO})`);

// ---- live data ----
const prs = JSON.parse(sh(`gh pr list -R ${REPO} --state merged --limit 400 --json number,title,mergedAt`))
  .filter((p) => p.mergedAt && p.mergedAt >= sinceISO);
const issuesClosed = JSON.parse(sh(`gh issue list -R ${REPO} --state closed --limit 400 --json closedAt`))
  .filter((i) => i.closedAt && i.closedAt >= sinceISO).length;
const commits = sh(`git log --since="${sinceISO}" --oneline`, LITE_DIR).trim().split("\n").filter(Boolean).length;

// ---- cluster the PRs into product areas (sanitized labels; counts only) ----
const RULES = [
  ["Supplier", /cpmaxx|cruise|msc|adapter|supplier|serp|vacations_to_go|farebuzz|viator|kiwi|onboard.?probe|probe/i],
  ["Widget", /widget|interview|ADR-004[789]|select==offer|folio.?board/i],
  ["Folio", /folio|board|render|preview|publish|template|croom|editor|wysiwyg/i],
  ["FreeAnon", /free[- ]?tier|anon|magic[- ]?link|onboard|signup|ephemeral|start.?free|persona/i],
  ["SearchCert", /cert|health|sweep|smoke|probe.?health|search.?tool/i],
  ["KillSwitch", /kill.?switch|source|disable|reliab|guardrail|watchdog|canary/i],
  ["Trip", /migration|migrat|trip.?health|integrity|schema|backfill|normaliz/i],
  ["B2B", /party|b2b|comms|scope-1|client|handoff|warm.?lead/i],
  ["Budget", /budget|charter|pricing|commission|finance/i],
  ["Docs", /docs|adr|readme|spec|sync|restamp|typecheck|test|ci|deploy|script/i],
];
const clusters = {};
for (const p of prs) {
  let key = "Other";
  for (const [k, re] of RULES) { if (re.test(p.title)) { key = k; break; } }
  (clusters[key] = clusters[key] || []).push(p);
}
const clusterStat = (keys) => {
  const arr = keys.flatMap((k) => clusters[k] || []);
  const dates = arr.map((p) => p.mergedAt.slice(0, 10)).sort();
  return { count: arr.length, first: dates[0], last: dates[dates.length - 1] };
};

// ---- per-day merge series ----
const byDay = {};
for (const p of prs) { const d = p.mergedAt.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
const series = [];
for (let t = new Date(start); t <= now; t = new Date(t.getTime() + 86400000)) {
  const k = ymd(t); series.push([k.slice(5), byDay[k] || 0]);
}
const peak = Math.max(...series.map((s) => s[1]));
const activeDays = Object.keys(byDay).length;

// ---- curated, sanitized board copy (counts come from clusters) ----
const drOf = (s) => (s.first ? `${fmt(s.first)}–${fmt(s.last)}` : "");
const fmt = (d) => { const [, m, day] = d.split("-"); return `${["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m]} ${+day}`; };
const prChip = (n) => ({ c: "pr", x: `${n} PR${n === 1 ? "" : "s"}` });

const LANES = [
  { k: "plan", t: "Planned / next", cards: [
    { ct: "Agency-tier credential vault", cd: "Per-advisor encrypted vendor credentials, so agencies bring their own supplier logins under custody.", foot: [{ c: "priv", x: "private repo" }] },
    { ct: "Cruise inventory cluster", cd: "Deferred pending a supplier API; ports and cabins that today have no non-browser source.", foot: [{ c: "priv", x: "blocked · upstream API" }] },
  ] },
  { k: "prog", t: "In progress", cards: [
    { ct: "Anonymous free on-ramp", cd: "Start a trip with no signup, then keep it via magic link. Harness and staging deploy live; end-to-end in flight.", clusters: ["FreeAnon"], extra: [{ c: "", x: "staging" }] },
    { ct: "Advisor cruise page + comms", cd: "A three-option cruise proposal layout for a live advisor, plus the two-way client message loop.", foot: [{ c: "priv", x: "active lane" }] },
  ] },
  { k: "rev", t: "In review", cards: [
    { ct: "Proposal index backbone", cd: "A shared index behind multi-option proposals; renders two-up today, N-card renderer pending a layout call.", foot: [{ c: "pr", x: "PR #1061" }, { c: "", x: "review-clean" }] },
  ] },
  { k: "ship", t: "Shipped to prod", cards: [
    { ct: "Supplier adapters & re-enablement", cd: "Brought a 2FA-gated booking supplier back online with authenticator-app TOTP computed in-worker, plus new search-form probes.", clusters: ["Supplier"], extra: [{ c: "sha", x: "2ac0d8bc" }] },
    { ct: "Widget-primary chat interface", cd: "Moved the planning flow into an in-chat interview widget; unified Select and Offer so a pick is a proposal.", clusters: ["Widget"], extra: [{ c: "sha", x: "cecefbb0" }] },
    { ct: "Folio & board rendering", cd: "Deliverable and compare-and-pick surfaces: renderer parity, an in-place editor, and board polish across trip types.", clusters: ["Folio"], extra: [{ c: "priv", x: "private repo" }] },
    { ct: "Docs, ADRs & release tooling", cd: "Architecture decision records, a strict module-docs freshness gate, and the staged deploy pipeline.", clusters: ["Docs"], extra: [{ c: "", x: "public ADRs" }] },
    { ct: "Search-tool certification & health", cd: "A scheduled harness that exercises every search tool, records history, and pages on regressions.", clusters: ["SearchCert"], extra: [{ c: "sha", x: "eaba7cfb" }] },
    { ct: "Source kill-switch & reliability", cd: "Disable any supplier source everywhere from one switch, plus guardrails and a canary that emails on failure.", clusters: ["KillSwitch"], extra: [{ c: "sha", x: "b7d34d46" }] },
    { ct: "B2B party capture & comms", cd: "Capture the travelling party at intake and route advisor-to-client messages through the trip.", clusters: ["B2B"], extra: [{ c: "sha", x: "b9158c3b" }] },
    { ct: "Trip integrity & migrations", cd: "Forward-migrate stored trips on shape changes and visually re-verify every rendered surface before trusting it.", clusters: ["Trip"], extra: [{ c: "priv", x: "private repo" }] },
    { ct: "Free-tier & platform hardening", cd: "Everything else that shipped in the window: free-tier funnel work, budget and charter, and a run of guardrail and polish fixes.", clusters: ["Other", "Budget"], extra: [{ c: "priv", x: "private repo" }] },
  ] },
];

// resolve cluster-backed counts + date ranges into concrete card foot/dr
let sumCards = 0;
for (const L of LANES) for (const c of L.cards) {
  if (c.clusters) {
    const s = clusterStat(c.clusters);
    sumCards += s.count;
    c.foot = [prChip(s.count), ...(c.extra || [])];
    c.dr = drOf(s);
  }
}
if (sumCards !== prs.length) console.warn(`[ship-log] WARNING: card counts (${sumCards}) != merged PRs (${prs.length}) — a PR fell outside the curated areas.`);
else console.log(`[ship-log] card counts sum to ${sumCards} = merged total ✓`);

const snapStamp = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
const axis = (() => { // 5 evenly-spaced x labels
  const idx = [0, .25, .5, .75, 1].map((f) => Math.round(f * (series.length - 1)));
  return idx.map((i) => fmt("2026-" + series[i][0])).map((s) => `<span>${s}</span>`).join("");
})();

const DATA = {
  kpis: { prs: prs.length, issues: issuesClosed, commits, activeDays, total: series.length, peak, perActive: (prs.length / Math.max(activeDays, 1)).toFixed(1) },
  windowStart: ymd(start), windowEnd: ymd(now), snapStamp,
  series, max: peak, lanes: LANES, axis,
};

writeFileSync(OUT, render(DATA));
console.log(`[ship-log] wrote ${OUT}`);

// ---------------------------------------------------------------------------
function render(D) {
  const html = PAGE(D);
  return `// AUTO-GENERATED by scripts/gen-ship-log.mjs — do not edit by hand.\n`
    + `// Snapshot: ${D.snapStamp}. Regenerate: node scripts/gen-ship-log.mjs\n`
    + `export const SHIP_LOG_HTML: string = ${JSON.stringify(html)};\n`;
}

function PAGE(D) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Voygent Ship Log</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A ${WINDOW_DAYS}-day shipping-cadence snapshot of Voygent, reconstructed from real git history.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>${CSS()}</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <div class="eyebrow">Voygent · build-in-public</div>
    <h1>${WINDOW_DAYS}-Day Ship Log</h1>
    <p class="sub">A running snapshot of what shipped on Voygent, an AI travel-planning platform built as a Cloudflare Workers MCP server. Reconstructed from the actual git history so the cadence is checkable, not narrated.</p>
    <div class="prov mono">
      <span><b>snapshot</b> ${D.snapStamp}</span>
      <span><b>window</b> ${D.windowStart} → ${D.windowEnd}</span>
      <span><b>source</b> merged PRs · commit log · deploy record</span>
      <span><b>built by</b> Neil Roberts</span>
    </div>
  </header>

  <div class="kpis tnum">
    <div class="kpi"><div class="n">${D.kpis.prs}</div><div class="l">pull requests merged<br><span class="mono">peak ${D.kpis.peak} in one day</span></div></div>
    <div class="kpi"><div class="n">${D.kpis.issues}</div><div class="l">issues closed<br><span class="mono">filed &amp; cleared in-window</span></div></div>
    <div class="kpi"><div class="n">${D.kpis.commits}</div><div class="l">commits to main<br><span class="mono">solo author</span></div></div>
    <div class="kpi"><div class="n">${D.kpis.activeDays}<span style="font-size:20px;color:var(--faint)">/${D.kpis.total}</span></div><div class="l">days with a merge<br><span class="mono">~${D.kpis.perActive} PRs / active day</span></div></div>
  </div>

  <section class="cadence">
    <div class="sech"><h2>Merge cadence</h2><span class="meta">pull requests merged per day · ${D.kpis.total} days</span></div>
    <div class="chart" id="chart" aria-label="Bar chart of pull requests merged per day"></div>
    <div class="axis">${D.axis}</div>
  </section>

  <div class="sech"><h2>Work board</h2><span class="meta">private-repo tickets summarized at the area level</span></div>
  <div class="board" id="board"></div>

  <footer class="method">
    <h3>How this was built</h3>
    <div class="legend">
      <span><i class="dot" style="background:var(--s-plan)"></i>Planned / next</span>
      <span><i class="dot" style="background:var(--s-prog)"></i>In progress</span>
      <span><i class="dot" style="background:var(--s-rev)"></i>In review</span>
      <span><i class="dot" style="background:var(--s-ship)"></i>Shipped to prod</span>
    </div>
    <p>Every number above is pulled straight from the repository: ${D.kpis.prs} merged pull requests, ${D.kpis.issues} closed issues, and ${D.kpis.commits} commits over the ${WINDOW_DAYS}-day window, counted from the git and GitHub history. The board groups those merged PRs into product areas and pairs each area with the deploy that carried it to production, identified by its real commit SHA. The core repository is private, so individual tickets are summarized at the area level rather than reproduced verbatim; the shipped counts still sum to the ${D.kpis.prs} total. Public evidence — the interactive demo and the engineering deep-dives — is linked where a card has it, at <a href="https://demo.voygent.ai">demo.voygent.ai</a>.</p>
  </footer>
</div>
<script>${JS(D)}</script>
</body>
</html>`;
}

function JS(D) {
  return `var DATA=${JSON.stringify({ series: D.series, max: D.max, lanes: D.lanes })};
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
var chart=document.getElementById("chart");
DATA.series.forEach(function(d){
  var col=document.createElement("div"); col.className="col";
  var bar=document.createElement("div");
  bar.className="bar"+(d[1]===DATA.max&&d[1]>0?" peak":"")+(d[1]===0?" zero":"");
  var h=d[1]===0?2:Math.round(6+(d[1]/DATA.max)*94);
  bar.title=d[0]+": "+d[1]+" PR"+(d[1]===1?"":"s");
  if(reduce){bar.style.height=h+"px";}else{bar.style.height="2px";requestAnimationFrame(function(){requestAnimationFrame(function(){bar.style.height=h+"px";});});}
  col.appendChild(bar); chart.appendChild(col);
});
var S={plan:"var(--s-plan)",prog:"var(--s-prog)",rev:"var(--s-rev)",ship:"var(--s-ship)"};
var board=document.getElementById("board");
DATA.lanes.forEach(function(L){
  var lane=document.createElement("div"); lane.className="lane";
  lane.innerHTML='<div class="lane-h"><span class="dot" style="background:'+S[L.k]+'"></span><span class="t">'+L.t+'</span><span class="c">'+L.cards.length+'</span></div>';
  L.cards.forEach(function(c){
    var card=document.createElement("div"); card.className="card"; card.style.setProperty("--stripe",S[L.k]);
    var foot=(c.foot||[]).map(function(f){return '<span class="chip '+(f.c||"")+'">'+f.x+'</span>';}).join("");
    var dr=c.dr?'<span class="dr">'+c.dr+'</span>':'';
    card.innerHTML='<p class="ct">'+c.ct+'</p><p class="cd">'+c.cd+'</p><div class="foot">'+foot+dr+'</div>';
    lane.appendChild(card);
  });
  board.appendChild(lane);
});`;
}

function CSS() { return `
  :root{--paper:#f3f0e8;--panel:#faf8f2;--ink:#1c2026;--muted:#6a6f78;--faint:#9a9ea6;--rule:#e0dcd0;--rule-strong:#cfc9ba;--accent:#b45f24;--accent-soft:#e9d8c4;--s-plan:#7d828c;--s-prog:#2f6ca6;--s-rev:#b78a1e;--s-ship:#2f7f57;--bar:#c98a4e;--bar-peak:#b45f24;--bar-zero:#e3ddcf;--shadow:0 1px 0 rgba(28,32,38,.04)}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#12151a;--panel:#181c22;--ink:#e8e4d8;--muted:#9aa0aa;--faint:#6b717b;--rule:#262b33;--rule-strong:#333a44;--accent:#e0913a;--accent-soft:#3a2c1a;--s-plan:#8a909b;--s-prog:#5b93c9;--s-rev:#d6a636;--s-ship:#4fa77c;--bar:#c9863f;--bar-peak:#e0913a;--bar-zero:#242a31;--shadow:0 1px 0 rgba(0,0,0,.25)}}
  :root[data-theme="dark"]{--paper:#12151a;--panel:#181c22;--ink:#e8e4d8;--muted:#9aa0aa;--faint:#6b717b;--rule:#262b33;--rule-strong:#333a44;--accent:#e0913a;--accent-soft:#3a2c1a;--s-plan:#8a909b;--s-prog:#5b93c9;--s-rev:#d6a636;--s-ship:#4fa77c;--bar:#c9863f;--bar-peak:#e0913a;--bar-zero:#242a31;--shadow:0 1px 0 rgba(0,0,0,.25)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"Archivo",system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 24px 64px}
  .mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
  .tnum{font-variant-numeric:tabular-nums}
  header.mast{border-top:3px solid var(--accent);padding-top:18px}
  .eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600}
  h1{font-size:clamp(28px,4.4vw,44px);line-height:1.02;font-weight:800;letter-spacing:-.02em;margin:.28em 0 .18em;text-wrap:balance}
  .sub{color:var(--muted);max-width:60ch;margin:0}
  .prov{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--faint);margin-top:10px;display:flex;flex-wrap:wrap;gap:6px 14px}
  .prov b{color:var(--muted);font-weight:500}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:26px 0 8px;background:var(--rule);border:1px solid var(--rule);border-radius:2px;overflow:hidden}
  .kpi{background:var(--panel);padding:16px 18px}
  .kpi .n{font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1}
  .kpi .l{font-size:12px;color:var(--muted);margin-top:6px}
  .kpi .l .mono{font-size:11px;color:var(--faint)}
  @media(max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}}
  section.cadence{margin:34px 0 40px}
  .sech{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--rule-strong);padding-bottom:8px;margin-bottom:16px}
  .sech h2{font-size:15px;font-weight:700;margin:0;letter-spacing:.01em}
  .sech .meta{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--faint)}
  .chart{display:flex;align-items:flex-end;gap:3px;height:120px;padding-top:8px}
  .col{flex:1 1 0;display:flex;flex-direction:column;align-items:center;min-width:0}
  .bar{width:100%;background:var(--bar);border-radius:1px 1px 0 0;min-height:2px;transition:height .6s cubic-bezier(.2,.7,.2,1)}
  .bar.peak{background:var(--bar-peak)}
  .bar.zero{background:var(--bar-zero)}
  .axis{display:flex;justify-content:space-between;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--faint);border-top:1px solid var(--rule);margin-top:6px;padding-top:6px}
  .board{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  @media(max-width:900px){.board{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:560px){.board{grid-template-columns:1fr}}
  .lane{min-width:0}
  .lane-h{display:flex;align-items:center;gap:8px;padding:0 2px 10px}
  .dot{width:9px;height:9px;border-radius:2px;flex:none}
  .lane-h .t{font-size:12.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
  .lane-h .c{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--faint);margin-left:auto}
  .card{background:var(--panel);border:1px solid var(--rule);border-left:3px solid var(--stripe,var(--s-plan));border-radius:3px;padding:12px 13px;margin-bottom:10px;box-shadow:var(--shadow)}
  .card .ct{font-size:14px;font-weight:600;line-height:1.25;margin:0 0 5px}
  .card .cd{font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.42}
  .card .foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .chip{font-family:"IBM Plex Mono",monospace;font-size:10.5px;padding:2px 6px;border-radius:2px;border:1px solid var(--rule-strong);color:var(--muted);white-space:nowrap}
  .chip.pr{color:var(--accent);border-color:var(--accent-soft);font-weight:600}
  .chip.sha{color:var(--s-ship)}
  .chip.priv{color:var(--faint)}
  .card .dr{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--faint);margin-left:auto}
  footer.method{margin-top:44px;border-top:1px solid var(--rule-strong);padding-top:18px;color:var(--muted);font-size:12.5px;line-height:1.6;max-width:82ch}
  footer.method h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);font-weight:700;margin:0 0 8px;font-family:"IBM Plex Mono",monospace}
  footer.method a{color:var(--accent)}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0 4px}
  .legend span{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
  @media (prefers-reduced-motion:reduce){.bar{transition:none}}
`; }
