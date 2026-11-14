import type { Resolution } from "@vexbets/contract";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    question: text("question").notNull(),
    tagline: text("tagline").notNull(),
    criteria: text("criteria").notNull(),
    fallbackOutcomeId: uuid("fallback_outcome_id").notNull(),
    resolveEarly: boolean("resolve_early").notNull(),
    bandNumber: integer("band_number").notNull(),
    subjectName: text("subject_name").notNull(),
    opensAt: ts("opens_at").notNull(),
    closesAt: ts("closes_at").notNull(),
    liquidityB: integer("liquidity_b").notNull(),
    status: text("status", { enum: ["open", "closed", "resolved", "voided"] }).notNull(),
    volumeCredits: integer("volume_credits").notNull().default(0),
    /** Credits the market holds: the creator's subsidy plus buys, minus sells and payouts. */
    escrow: integer("escrow").notNull(),
    lastJudgedAt: ts("last_judged_at"),
    resolution: jsonb("resolution").$type<Resolution>(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    index("markets_status_idx").on(t.status, t.createdAt),
    index("markets_band_idx").on(t.bandNumber, t.status),
  ],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    idx: integer("idx").notNull(),
    label: text("label").notNull(),
    criteria: text("criteria"),
    /** Outstanding shares (q_i in the contract's lmsr.ts). */
    shares: integer("shares").notNull().default(0),
  },
  (t) => [uniqueIndex("outcomes_market_idx").on(t.marketId, t.idx)],
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey(),
    /** Insertion order, for stable listing when two trades share a timestamp. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    shares: integer("shares").notNull(),
    credits: integer("credits").notNull(),
    priceAfterBps: jsonb("price_after_bps").$type<number[]>().notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("trades_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("trades_market_idx").on(t.marketId, t.seq),
  ],
);

export const positions = pgTable(
  "positions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id),
    shares: integer("shares").notNull(),
    costBasis: integer("cost_basis").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.outcomeId] }), index("positions_market_idx").on(t.marketId)],
);
