import { bigserial, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  /** Cached sum of this user's ledger rows. Updated in the same transaction as the ledger. */
  balance: integer("balance").notNull(),
  createdAt: createdAt(),
});

/**
 * Every credit movement. Append-only. A user's balance is the sum of their rows, and each
 * market's escrow is the negative sum of the user rows that point at it.
 */
export const ledger = pgTable(
  "ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", {
      enum: ["grant", "market_subsidy", "trade_buy", "trade_sell", "payout", "creator_settlement"],
    }).notNull(),
    amount: integer("amount").notNull(),
    marketId: uuid("market_id"),
    tradeId: uuid("trade_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_user_idx").on(t.userId)],
);
