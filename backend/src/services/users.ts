import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { ledger, users } from "../db/schema";
import type { Deps } from "../deps";

export type UserRow = typeof users.$inferSelect;

/** "Zoë 🎉" -> "zoe", "Sam Smith" -> "sam_smith", "sam@x.com" -> "sam". */
function baseHandle(name: string): string {
  const local = (name.split("@")[0] ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 19);
  return local.length >= 2 ? local : `user_${local || "x"}`;
}

/**
 * The user for this email, created on first sight with the starting balance.
 * No passwords: knowing an email is being that user (demo, play money).
 */
export async function userForEmail(deps: Deps, email: string): Promise<UserRow> {
  const existing = await deps.db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const handle =
      attempt === 0 ? baseHandle(email) : `${baseHandle(email)}_${Math.floor(1000 + Math.random() * 9000)}`;
    const created = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          email,
          handle,
          displayName: email.split("@")[0] ?? email,
          balance: deps.config.startingBalance,
          createdAt: deps.now(),
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return undefined;
      await tx.insert(ledger).values({
        userId: row.id,
        kind: "grant",
        amount: deps.config.startingBalance,
        createdAt: deps.now(),
      });
      return row;
    });
    if (created) return created;
    // Either someone created this email at the same moment, or the handle is taken.
    const raced = await deps.db.query.users.findFirst({ where: eq(users.email, email) });
    if (raced) return raced;
  }
  throw new Error(`could not create a user for ${email}`);
}

/** Lock a user's row for the rest of the transaction. */
export async function lockUser(tx: Db, id: string): Promise<UserRow> {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).for("update");
  if (!row) throw new Error(`user ${id} vanished`);
  return row;
}

/** Move credits for a user: one ledger row plus the cached balance, in the caller's transaction. */
export async function moveCredits(
  tx: Db,
  deps: Deps,
  user: UserRow,
  entry: Omit<typeof ledger.$inferInsert, "userId" | "createdAt">,
): Promise<number> {
  const balance = user.balance + entry.amount;
  if (balance < 0) throw new Error("balance would go negative");
  await tx.insert(ledger).values({ ...entry, userId: user.id, createdAt: deps.now() });
  await tx.update(users).set({ balance }).where(eq(users.id, user.id));
  user.balance = balance;
  return balance;
}

export function summary(u: Pick<UserRow, "id" | "handle" | "displayName">) {
  return { id: u.id, handle: u.handle, displayName: u.displayName };
}
