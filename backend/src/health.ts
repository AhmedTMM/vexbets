import { sql } from "drizzle-orm";
import type { Deps } from "./deps";

export async function health(deps: Deps) {
  await deps.db.execute(sql`select 1`);
  return { ok: true, time: deps.now().toISOString() };
}
