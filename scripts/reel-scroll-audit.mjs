// Reel scroll audit (A2): unpaused phone-viewport playthrough sampling every 200ms —
// is the newest chat content actually on screen? Reports contiguous windows where
// fresh content sits fully below the fold and screenshots the worst moments.
// Exits 1 if any window >100px deep lasts longer than 3s (spotlit content invisible).
// Usage: node scripts/reel-scroll-audit.mjs <reelId> [baseUrl]
// Needs a running dev server (npm run dev:web) and Playwright at the path below.
import { chromium } from "/home/neil/dev/voygent-desktop/node_modules/playwright/index.mjs";

const REEL = process.argv[2] ?? "collab";
const BASE = process.argv[3] ?? "http://localhost:5199";
const OUT = process.env.AUDIT_OUT ?? "/tmp";
const browser = await chromium.launch();
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
})).newPage();

await page.goto(`${BASE}/?reel=${REEL}&mode=auto`);
const watch = page.getByRole("button", { name: /watch the/i }).first();
await watch.waitFor({ timeout: 15000 });
await watch.click();

const samples = [];
const t0 = Date.now();
let shots = 0;
const deadline = Date.now() + 420000;
while (Date.now() < deadline) {
  if ((await page.locator(".cl-fv-cta").count()) > 0) break;
  const s = await page.evaluate(() => {
    const sc = document.querySelector(".cl-scroll");
    const overlayUp = !!document.querySelector(".cl-fv-scrim, .cl-cv-scrim"); // full-window surfaces manage themselves
    const gap = sc ? Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight) : 0;
    // last item in the chat column: how far below the fold is its TOP? (is the newest
    // content at least partially visible?)
    const col = document.querySelector(".cl-col");
    const kids = col ? [...col.children] : [];
    const lastEl = kids[kids.length - 1]?.previousElementSibling ?? null; // skip endRef div
    const lr = lastEl?.getBoundingClientRect();
    const vh = window.innerHeight;
    const lastHidden = lr ? Math.round(Math.max(0, lr.top - vh)) : 0;
    // any actively-flashing markers (edit/comment/pick) — are they on screen?
    const marks = [...document.querySelectorAll(".cl-edit-marker, .cl-thread-wrap, [class*=chose]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0);
    const offscreenMarks = marks.filter((r) => r.bottom < 0 || r.top > vh).length;
    const callout = document.querySelector("h4.cl-reel-callout-h")?.textContent ?? "";
    return { gap, lastHidden, overlayUp, marksTotal: marks.length, offscreenMarks, callout };
  }).catch(() => null);
  if (s) {
    s.t = ((Date.now() - t0) / 1000).toFixed(1);
    samples.push(s);
    // capture worst moments: newest content fully below the fold with no overlay up
    if (!s.overlayUp && s.lastHidden > 60 && shots < 8) {
      shots++;
      await page.screenshot({ path: `${OUT}/a2-hidden-${REEL}-${String(shots).padStart(2, "0")}-t${s.t}.png` });
    }
  }
  await page.waitForTimeout(200);
}

// summarize: contiguous windows where lastHidden > 60 (newest content entirely under the fold)
let windows = [], cur = null;
for (const s of samples) {
  const bad = !s.overlayUp && s.lastHidden > 60;
  if (bad && !cur) cur = { from: s.t, max: s.lastHidden, callout: s.callout };
  else if (bad && cur) cur.max = Math.max(cur.max, s.lastHidden);
  else if (!bad && cur) { cur.to = s.t; windows.push(cur); cur = null; }
}
if (cur) { cur.to = samples[samples.length - 1]?.t; windows.push(cur); }
console.log(`samples=${samples.length} over ${samples[samples.length - 1]?.t}s; hidden-content windows:`);
for (const w of windows) console.log(`  ${w.from}s→${w.to}s newest content ${w.max}px below fold${w.callout ? ` (callout: "${w.callout}")` : ""}`);
const offscreenFlash = samples.filter((s) => s.offscreenMarks > 0 && !s.overlayUp).length;
console.log(`samples with off-screen edit/comment markers (no overlay): ${offscreenFlash}/${samples.length}`);
console.log(`screenshots: ${shots}`);
await browser.close();
const bad = windows.filter((w) => Number(w.to) - Number(w.from) > 3 && w.max > 100);
if (bad.length) { console.log(`FAIL: ${bad.length} hidden-content window(s) deeper than 100px for >3s`); process.exit(1); }
console.log("PASS: no hidden-content window deeper than 100px for >3s");
