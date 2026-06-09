#!/usr/bin/env node
// Port /info page edits between the live D1 override store and the git seed
// (worker/info/content.json). See docs/runbooks/info-page-editing.md.
//
//   node scripts/info-content.mjs status        # what's overridden in prod
//   node scripts/info-content.mjs pull          # merge prod overrides -> content.json (+ snapshot)
//   node scripts/info-content.mjs clear         # preview snapshot-guarded delete
//   node scripts/info-content.mjs clear --yes    # execute it (run AFTER deploy)
//   node scripts/info-content.mjs clear --yes --slug subagents
//
// The merge/guard logic is pure + the wrangler call is injectable, so this file
// is unit-tested (scripts/info-content.test.ts) without shelling out.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_PATH = join(ROOT, "worker/info/content.json");
const SNAPSHOT_PATH = join(ROOT, "worker/info/.pull-snapshot.json");
const DB = "voygent-demo";
const TABLE = "info_page_overrides";
const SLUG_RE = /^[a-z0-9-]+$/;

// --- defensive parse of `wrangler d1 execute --json` stdout ---
export function parseWranglerJson(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch { throw new Error(`wrangler output was not JSON: ${String(stdout).slice(0, 200)}`); }
  if (!Array.isArray(parsed) || !parsed[0] || parsed[0].success !== true || !Array.isArray(parsed[0].results)) {
    throw new Error(`unexpected wrangler --json shape: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return parsed[0].results;
}

// --- default runners (shell out to wrangler); injectable for tests ---
function wranglerQuery(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return parseWranglerJson(out);
}
function wranglerMutate(sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// --- pure merge: null keeps the seed, any string (incl "") replaces it ---
// (matches the runtime mergeOverride in worker/info/pages.ts exactly).
export function mergeOverrides(content, rows) {
  const next = clone(content);
  const changed = [], skipped = [];
  for (const r of rows) {
    if (!Object.prototype.hasOwnProperty.call(next, r.slug)) { skipped.push(r.slug); continue; }
    const before = next[r.slug];
    // Preserve non-edited fields (e.g. blog/tags) — the editor only ever writes
    // title/subtitle/body, so anything else lives only in content.json.
    const merged = {
      ...before,
      title: r.title ?? before.title,
      subtitle: r.subtitle ?? before.subtitle,
      body: r.body ?? before.body,
    };
    next[r.slug] = merged;
    if (merged.title !== before.title || merged.subtitle !== before.subtitle || merged.body !== before.body) {
      changed.push(r.slug);
    }
  }
  return { content: next, changed, skipped };
}

// --- snapshot-guarded clear plan: only delete rows unchanged since the pull ---
export function planClear(snapshot, rows, { slug } = {}) {
  const toDelete = [], skippedChanged = [], skippedUnsnapshotted = [];
  for (const r of rows) {
    if (slug && r.slug !== slug) continue;
    if (!Object.prototype.hasOwnProperty.call(snapshot, r.slug)) { skippedUnsnapshotted.push(r.slug); continue; }
    if (String(snapshot[r.slug]) !== String(r.updated_at)) { skippedChanged.push(r.slug); continue; }
    toDelete.push(r.slug);
  }
  return { toDelete, skippedChanged, skippedUnsnapshotted };
}

// --- commands (runners injectable) ---
export function pull(runQuery = wranglerQuery) {
  const content = readJson(CONTENT_PATH);
  const rows = runQuery(`SELECT slug,title,subtitle,body,updated_at FROM ${TABLE}`);
  const { content: next, changed, skipped } = mergeOverrides(content, rows);
  writeJson(CONTENT_PATH, next);
  const snapshot = {};
  for (const r of rows) snapshot[r.slug] = r.updated_at;
  writeJson(SNAPSHOT_PATH, snapshot);
  return { pulled: rows.length, changed, skipped };
}

export function status(runQuery = wranglerQuery) {
  const content = readJson(CONTENT_PATH);
  const rows = runQuery(`SELECT slug,title,subtitle,body,updated_at FROM ${TABLE}`);
  const { changed, skipped } = mergeOverrides(content, rows);
  return { overridden: rows.map((r) => r.slug), changed, skipped };
}

export function clear({ slug, yes } = {}, runQuery = wranglerQuery, mutate = wranglerMutate) {
  if (!existsSync(SNAPSHOT_PATH)) throw new Error("no worker/info/.pull-snapshot.json — run `pull` first.");
  const snapshot = readJson(SNAPSHOT_PATH);
  const rows = runQuery(`SELECT slug,updated_at FROM ${TABLE}`);
  const plan = planClear(snapshot, rows, { slug });
  if (yes) {
    for (const s of plan.toDelete) {
      if (!SLUG_RE.test(s)) throw new Error(`refusing to delete unsafe slug: ${s}`);
      mutate(`DELETE FROM ${TABLE} WHERE slug='${s}' AND updated_at=${Number(snapshot[s])}`);
    }
  }
  return { ...plan, applied: !!yes };
}

// --- CLI ---
function parseFlags(args) {
  const f = { yes: false, slug: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yes") f.yes = true;
    else if (args[i] === "--slug") f.slug = args[++i];
  }
  return f;
}

function main(argv) {
  const cmd = argv[0];
  const flags = parseFlags(argv.slice(1));
  if (cmd === "status") {
    const r = status();
    console.log(`overridden in prod: ${r.overridden.length ? r.overridden.join(", ") : "(none)"}`);
    console.log(`would change content.json: ${r.changed.length ? r.changed.join(", ") : "(none)"}`);
    if (r.skipped.length) console.warn(`⚠ overrides for unknown slugs (skipped): ${r.skipped.join(", ")}`);
  } else if (cmd === "pull") {
    const r = pull();
    console.log(`pulled ${r.pulled} override row(s).`);
    console.log(`content.json changed for: ${r.changed.length ? r.changed.join(", ") : "(none — already in sync)"}`);
    if (r.skipped.length) console.warn(`⚠ overrides for unknown slugs (skipped): ${r.skipped.join(", ")}`);
    console.log("→ review `git diff worker/info/content.json`, commit, then build + deploy.");
  } else if (cmd === "clear") {
    const r = clear({ slug: flags.slug, yes: flags.yes });
    if (!flags.yes) {
      console.log(`DRY RUN (pass --yes to execute). Would delete: ${r.toDelete.length ? r.toDelete.join(", ") : "(none)"}`);
    } else {
      console.log(`deleted override rows: ${r.toDelete.length ? r.toDelete.join(", ") : "(none)"}`);
    }
    if (r.skippedChanged.length) console.warn(`⚠ edited since pull — NOT deleted (pull again!): ${r.skippedChanged.join(", ")}`);
    if (r.skippedUnsnapshotted.length) console.warn(`⚠ added since pull — NOT deleted: ${r.skippedUnsnapshotted.join(", ")}`);
    if (r.skippedChanged.length) process.exitCode = 2;
  } else {
    console.error("usage: info-content.mjs <status|pull|clear> [--yes] [--slug <slug>]");
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
