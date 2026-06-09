import type { Db } from "./db";
import { text } from "./http";
export async function handleAdmin(_req: Request, _env: unknown, _db: Db): Promise<Response> {
  return text("admin not yet implemented", 501);
}
