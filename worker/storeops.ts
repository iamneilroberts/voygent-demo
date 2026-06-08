// Maps a Voygent MCP tool call to the production-store ops it WOULD trigger.
// This is a PROJECTION for the demo's data-store widget: the demo itself runs on
// Durable Object SQLite and binds no KV/D1. Grounded in Voygent's hybrid model —
// trip blob in KV, queryable index/FTS5 in D1 (see /info/data-stores). Pure +
// testable; name-keyed (args reserved for finer grain later). Tools with no
// trip-state side effect return [] (search/list/distill read candidate stores,
// not the trip store — we don't claim ops we can't ground).
export type StoreId = "KV" | "D1";
export interface StoreOp {
  store: StoreId;
  op: "get" | "put" | "list" | "query" | "delete";
  note: string;
}

export function storeOpsForTool(name: string, _args?: Record<string, unknown>): StoreOp[] {
  switch (name) {
    case "save_trip":
      return [
        { store: "KV", op: "put", note: "write the trip blob" },
        { store: "D1", op: "query", note: "upsert the trip index row" },
      ];
    case "read_trip":
    case "read_trip_section":
      return [{ store: "KV", op: "get", note: "read the trip blob" }];
    case "patch_trip":
    case "promote_flights":
    case "promote_hotels_to_lodging":
    case "confirm_lodging":
      return [
        { store: "KV", op: "get", note: "load current trip blob" },
        { store: "KV", op: "put", note: "write the patched trip blob" },
      ];
    case "find_trips":
    case "list_trips":
      return [{ store: "D1", op: "query", note: "query the trip index" }];
    case "search_trip_content":
      return [{ store: "D1", op: "query", note: "FTS5 full-text search over trip content" }];
    case "delete_trip":
      return [
        { store: "KV", op: "delete", note: "remove the trip blob" },
        { store: "D1", op: "query", note: "delete the trip index row" },
      ];
    default:
      return [];
  }
}
