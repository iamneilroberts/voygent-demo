import { describe, it, expect } from "vitest";
import { mergeOverrides, planClear, parseWranglerJson, clear } from "./info-content.mjs";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SNAP = join(dirname(fileURLToPath(import.meta.url)), "../worker/info/.pull-snapshot.json");

const seed = () => ({
  subagents: { title: "Subagents", subtitle: "sub", body: "<p>seed body</p>" },
  "trip-integrity": { title: "Trip integrity", subtitle: "ti", body: "<p>ti</p>" },
});

describe("parseWranglerJson", () => {
  it("returns results from a well-formed --json payload", () => {
    const out = JSON.stringify([{ success: true, results: [{ slug: "subagents" }], meta: {} }]);
    expect(parseWranglerJson(out)).toEqual([{ slug: "subagents" }]);
  });
  it("throws on non-JSON output (never silently 'no edits')", () => {
    expect(() => parseWranglerJson("✘ wrangler error: not logged in")).toThrow(/not JSON/);
  });
  it("throws on success:false", () => {
    expect(() => parseWranglerJson(JSON.stringify([{ success: false, results: [] }]))).toThrow(/unexpected/);
  });
  it("throws when results is missing/!array", () => {
    expect(() => parseWranglerJson(JSON.stringify([{ success: true }]))).toThrow(/unexpected/);
    expect(() => parseWranglerJson(JSON.stringify({}))).toThrow(/unexpected/);
  });
  it("accepts an empty result set", () => {
    expect(parseWranglerJson(JSON.stringify([{ success: true, results: [] }]))).toEqual([]);
  });
});

describe("mergeOverrides", () => {
  it("replaces seed fields with override strings", () => {
    const { content, changed, skipped } = mergeOverrides(seed(), [
      { slug: "subagents", title: "New", subtitle: "ns", body: "<p>new</p>", updated_at: 5 },
    ]);
    expect(content.subagents).toEqual({ title: "New", subtitle: "ns", body: "<p>new</p>" });
    expect(changed).toEqual(["subagents"]);
    expect(skipped).toEqual([]);
  });
  it("null keeps the seed; empty string REPLACES it (matches runtime)", () => {
    const { content, changed } = mergeOverrides(seed(), [
      { slug: "subagents", title: null, subtitle: "", body: null, updated_at: 1 },
    ]);
    expect(content.subagents.title).toBe("Subagents");   // null → kept
    expect(content.subagents.subtitle).toBe("");          // "" → replaced
    expect(content.subagents.body).toBe("<p>seed body</p>"); // null → kept
    expect(changed).toEqual(["subagents"]);
  });
  it("an identical override is a no-op (not reported as changed)", () => {
    const { changed } = mergeOverrides(seed(), [
      { slug: "subagents", title: "Subagents", subtitle: "sub", body: "<p>seed body</p>", updated_at: 1 },
    ]);
    expect(changed).toEqual([]);
  });
  it("an unknown slug is skipped, not applied", () => {
    const { content, skipped } = mergeOverrides(seed(), [{ slug: "ghost", title: "x", subtitle: "x", body: "x", updated_at: 1 }]);
    expect(content.ghost).toBeUndefined();
    expect(skipped).toEqual(["ghost"]);
  });
  it("round-trips nasty body strings intact", () => {
    const nasty = "<p>quote \" backtick ` unicode ✎ back\\slash </script> &amp;</p>";
    const { content } = mergeOverrides(seed(), [{ slug: "subagents", title: "t", subtitle: "s", body: nasty, updated_at: 1 }]);
    expect(content.subagents.body).toBe(nasty);
    // and it survives a JSON serialize/parse (how content.json is written)
    expect(JSON.parse(JSON.stringify(content)).subagents.body).toBe(nasty);
  });
  it("does not mutate the input content object", () => {
    const c = seed();
    mergeOverrides(c, [{ slug: "subagents", title: "X", subtitle: "y", body: "z", updated_at: 1 }]);
    expect(c.subagents.title).toBe("Subagents");
  });
});

describe("planClear (snapshot guard)", () => {
  const snapshot = { subagents: 100, "trip-integrity": 200 };
  it("deletes only rows whose updated_at is unchanged since the pull", () => {
    const rows = [{ slug: "subagents", updated_at: 100 }, { slug: "trip-integrity", updated_at: 200 }];
    const p = planClear(snapshot, rows);
    expect(p.toDelete.sort()).toEqual(["subagents", "trip-integrity"]);
    expect(p.skippedChanged).toEqual([]);
  });
  it("skips a row edited since the pull (the Critical guard)", () => {
    const rows = [{ slug: "subagents", updated_at: 999 }, { slug: "trip-integrity", updated_at: 200 }];
    const p = planClear(snapshot, rows);
    expect(p.toDelete).toEqual(["trip-integrity"]);
    expect(p.skippedChanged).toEqual(["subagents"]);
  });
  it("skips a row that wasn't in the snapshot (added after pull)", () => {
    const rows = [{ slug: "subagents", updated_at: 100 }, { slug: "new-page", updated_at: 5 }];
    const p = planClear(snapshot, rows);
    expect(p.toDelete).toEqual(["subagents"]);
    expect(p.skippedUnsnapshotted).toEqual(["new-page"]);
  });
  it("honors a --slug filter", () => {
    const rows = [{ slug: "subagents", updated_at: 100 }, { slug: "trip-integrity", updated_at: 200 }];
    expect(planClear(snapshot, rows, { slug: "subagents" }).toDelete).toEqual(["subagents"]);
  });
});

describe("clear (with fake runners + snapshot file)", () => {
  it("only DELETEs unchanged rows and reports the edited one; preserves prod row", () => {
    writeFileSync(SNAP, JSON.stringify({ subagents: 100, "trip-integrity": 200 }), "utf8");
    try {
      const runQuery = () => [{ slug: "subagents", updated_at: 100 }, { slug: "trip-integrity", updated_at: 777 }];
      const deletes = [];
      const mutate = (sql) => deletes.push(sql);
      const r = clear({ yes: true }, runQuery, mutate);
      expect(r.toDelete).toEqual(["subagents"]);
      expect(r.skippedChanged).toEqual(["trip-integrity"]);
      expect(deletes).toEqual(["DELETE FROM info_page_overrides WHERE slug='subagents' AND updated_at=100"]);
    } finally {
      rmSync(SNAP, { force: true });
    }
  });
  it("dry run (no --yes) issues no DELETEs", () => {
    writeFileSync(SNAP, JSON.stringify({ subagents: 100 }), "utf8");
    try {
      const deletes = [];
      const r = clear({ yes: false }, () => [{ slug: "subagents", updated_at: 100 }], (sql) => deletes.push(sql));
      expect(r.applied).toBe(false);
      expect(r.toDelete).toEqual(["subagents"]);
      expect(deletes).toEqual([]);
    } finally {
      rmSync(SNAP, { force: true });
    }
  });
  it("refuses without a snapshot file", () => {
    if (existsSync(SNAP)) rmSync(SNAP, { force: true });
    expect(() => clear({ yes: true }, () => [], () => {})).toThrow(/pull.*first/);
  });
});
