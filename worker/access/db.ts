export interface DbResult { changes: number }
export interface BatchOp { sql: string; params?: unknown[] }
export interface Db {
  run(sql: string, params?: unknown[]): Promise<DbResult>;
  first<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  batch(ops: BatchOp[]): Promise<void>;
}

/** Production adapter over Cloudflare D1. Writes always hit the primary. */
export class D1Db implements Db {
  constructor(private d1: D1Database) {}
  async run(sql: string, params: unknown[] = []): Promise<DbResult> {
    const r = await this.d1.prepare(sql).bind(...params).run();
    return { changes: r.meta.changes ?? 0 };
  }
  async first<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.d1.prepare(sql).bind(...params).first<T>()) ?? null;
  }
  async all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.d1.prepare(sql).bind(...params).all<T>();
    return r.results ?? [];
  }
  async batch(ops: BatchOp[]): Promise<void> {
    await this.d1.batch(ops.map((o) => this.d1.prepare(o.sql).bind(...(o.params ?? []))));
  }
}
