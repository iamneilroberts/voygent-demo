import type { StoreOp } from "../../worker/storeops";

export interface InsStore {
  type: "inspector"; kind: "store"; exchangeId: string; turn: number;
  tool: string; ops: StoreOp[];
}

// Live tally of the production KV/D1 ops this session WOULD trigger (projected
// from tool calls — the demo runs on DO SQLite and binds no KV/D1). Honest by
// label: "projected," never "measured." Bytes are deliberately absent (tool-
// payload bytes are not KV blob / D1 row bytes; see /info/data-stores).
export function StoreOpsWidget({ stores }: { stores: InsStore[] }) {
  if (stores.length === 0) return null;
  const all = stores.flatMap((s) => s.ops);
  const kv = all.filter((o) => o.store === "KV");
  const d1 = all.filter((o) => o.store === "D1");
  const byOp = (ops: StoreOp[]) => {
    const m: Record<string, number> = {};
    for (const o of ops) m[o.op] = (m[o.op] ?? 0) + 1;
    return Object.entries(m).map(([op, n]) => `${n} ${op}`).join(" · ");
  };
  return (
    <section className="ins-region ins-store">
      <h3>Data-store ops <span className="ins-proj">projected (production KV/D1)</span></h3>
      <div className="ins-store-rows">
        <div className="ins-store-row">
          <b>KV</b> <span className="ins-store-count">{kv.length}</span>
          <span className="ins-store-detail">{byOp(kv) || "—"}</span>
        </div>
        <div className="ins-store-row">
          <b>D1</b> <span className="ins-store-count">{d1.length}</span>
          <span className="ins-store-detail">{byOp(d1) || "—"}</span>
        </div>
      </div>
      <p className="ins-note">
        Projected from this session's tool calls — the live demo runs on a Durable Object, not KV/D1.{" "}
        <a href="/info/data-stores" target="_blank" rel="noreferrer">why KV vs D1 →</a>
      </p>
    </section>
  );
}
