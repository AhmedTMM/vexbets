import { ContractError, lmsr, type Quote, type Trade } from "@vexbets/contract";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { ledger, markets, outcomes, positions, trades, users } from "../db/schema";
import type { Deps } from "../deps";
import type { MarketRow, OutcomeRow } from "./markets";
import { lockUser, moveCredits, summary, type UserRow } from "./users";

type Side = "buy" | "sell";
interface QuoteInput {
  outcomeId: string;
  side: Side;
  shares: number;
}

function assertTradable(deps: Deps, m: MarketRow): void {
  if (m.status !== "open" || deps.now() >= m.closesAt) {
    throw new ContractError("market_closed", "this market is not taking trades");
  }
}

function price(m: MarketRow, os: OutcomeRow[], input: QuoteInput) {
  const sorted = [...os].sort((a, b) => a.idx - b.idx);
  const index = sorted.findIndex((o) => o.id === input.outcomeId);
  if (index < 0) throw new ContractError("not_found", "no such outcome in this market");
  const q = sorted.map((o) => o.shares);
  if (input.side === "sell" && (q[index] ?? 0) < input.shares) {
    throw new ContractError("insufficient_shares", "not that many shares outstanding");
  }
  return { index, sorted, quote: lmsr.quoteTrade(q, m.liquidityB, index, input.side, input.shares) };
}

async function loadMarket(db: Db, marketId: string, lock: boolean) {
  const base = db.select().from(markets).where(eq(markets.id, marketId));
  const [m] = lock ? await base.for("update") : await base;
  if (!m) throw new ContractError("not_found", "no such market");
  const os = await db
    .select()
    .from(outcomes)
    .where(eq(outcomes.marketId, marketId))
    .orderBy(asc(outcomes.idx));
  return { m, os };
}

export async function quote(deps: Deps, marketId: string, input: QuoteInput): Promise<Quote> {
  const { m, os } = await loadMarket(deps.db, marketId, false);
  assertTradable(deps, m);
  const { quote: q } = price(m, os, input);
  return {
    ...input,
    credits: q.credits,
    avgPriceBps: Math.min(10_000, q.avgPriceBps),
    priceBeforeBps: q.priceBeforeBps,
    priceAfterBps: q.priceAfterBps,
  };
}

function toTrade(t: typeof trades.$inferSelect, u: Pick<UserRow, "id" | "handle" | "displayName">): Trade {
  return {
    id: t.id,
    marketId: t.marketId,
    user: summary(u),
    outcomeId: t.outcomeId,
    side: t.side,
    shares: t.shares,
    credits: t.credits,
    priceAfterBps: t.priceAfterBps,
    createdAt: t.createdAt.toISOString(),
  };
}

async function positionOf(db: Db, userId: string, marketId: string, outcomeId: string) {
  const [p] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.outcomeId, outcomeId)));
  return p ?? { userId, marketId, outcomeId, shares: 0, costBasis: 0 };
}

async function replay(deps: Deps, user: UserRow, existing: typeof trades.$inferSelect) {
  const [fresh] = await deps.db.select().from(users).where(eq(users.id, user.id));
  const p = await positionOf(deps.db, user.id, existing.marketId, existing.outcomeId);
  return {
    trade: toTrade(existing, user),
    balance: fresh?.balance ?? user.balance,
    position: { marketId: p.marketId, outcomeId: p.outcomeId, shares: p.shares, costBasis: p.costBasis },
  };
}

/**
 * Place a trade. Trades on one market queue up on the market row's lock (SELECT ... FOR
 * UPDATE), so each one prices against the result of the one before it.
 */
export async function trade(
  deps: Deps,
  user: UserRow,
  marketId: string,
  input: QuoteInput & { limitCredits: number; idempotencyKey: string },
) {
  const findExisting = async () => {
    const [t] = await deps.db
      .select()
      .from(trades)
      .where(and(eq(trades.userId, user.id), eq(trades.idempotencyKey, input.idempotencyKey)));
    return t;
  };
  const existing = await findExisting();
  if (existing) return replay(deps, user, existing);

  try {
    return await deps.db.transaction(async (tx) => {
      const { m, os } = await loadMarket(tx, marketId, true); // the queue
      assertTradable(deps, m);
      const u = await lockUser(tx, user.id);
      const { sorted, index, quote: q } = price(m, os, input);
      const outcome = sorted[index] as OutcomeRow;
      const pos = await positionOf(tx, u.id, m.id, outcome.id);

      if (input.side === "buy") {
        if (q.credits > input.limitCredits) {
          throw new ContractError("price_moved", `costs ${q.credits} now, above your limit`, 409, {
            credits: q.credits,
          });
        }
        if (u.balance < q.credits) {
          throw new ContractError("insufficient_balance", `costs ${q.credits}; you have ${u.balance}`, 422);
        }
      } else {
        if (pos.shares < input.shares) {
          throw new ContractError(
            "insufficient_shares",
            `you hold ${pos.shares} shares of this outcome`,
            422,
          );
        }
        if (q.credits < input.limitCredits) {
          throw new ContractError("price_moved", `pays ${q.credits} now, below your limit`, 409, {
            credits: q.credits,
          });
        }
      }

      const sign = input.side === "buy" ? 1 : -1;
      const id = crypto.randomUUID();
      await tx
        .update(outcomes)
        .set({ shares: q.after[index] ?? 0 })
        .where(eq(outcomes.id, outcome.id));
      await tx
        .update(markets)
        .set({
          escrow: m.escrow + sign * q.credits,
          volumeCredits: m.volumeCredits + q.credits,
        })
        .where(eq(markets.id, m.id));
      const [row] = await tx
        .insert(trades)
        .values({
          id,
          marketId: m.id,
          userId: u.id,
          outcomeId: outcome.id,
          side: input.side,
          shares: input.shares,
          credits: q.credits,
          priceAfterBps: q.priceAfterBps,
          idempotencyKey: input.idempotencyKey,
          createdAt: deps.now(),
        })
        .returning();
      const position = {
        marketId: m.id,
        outcomeId: outcome.id,
        shares: pos.shares + sign * input.shares,
        costBasis: pos.costBasis + sign * q.credits,
      };
      await tx
        .insert(positions)
        .values({ userId: u.id, ...position })
        .onConflictDoUpdate({
          target: [positions.userId, positions.outcomeId],
          set: { shares: position.shares, costBasis: position.costBasis },
        });
      const balance = await moveCredits(tx, deps, u, {
        kind: input.side === "buy" ? "trade_buy" : "trade_sell",
        amount: -sign * q.credits,
        marketId: m.id,
        tradeId: id,
      });
      if (!row) throw new Error("insert returned nothing");
      return { trade: toTrade(row, u), balance, position };
    });
  } catch (err) {
    // Same idempotency key sent twice at once: the second insert loses, return the first.
    const raced = await findExisting();
    if (raced) return replay(deps, user, raced);
    throw err;
  }
}

export async function listTrades(deps: Deps, marketId: string, q: { limit?: number; cursor?: string }) {
  const limit = q.limit ?? 50;
  const offset = q.cursor ? Number.parseInt(q.cursor, 10) || 0 : 0;
  const rows = await deps.db
    .select({ t: trades, u: users })
    .from(trades)
    .innerJoin(users, eq(users.id, trades.userId))
    .where(eq(trades.marketId, marketId))
    .orderBy(desc(trades.seq))
    .limit(limit + 1)
    .offset(offset);
  return {
    trades: rows.slice(0, limit).map((r) => toTrade(r.t, r.u)),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  };
}

export async function listPositions(deps: Deps, user: UserRow) {
  const rows = await deps.db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, user.id), gt(positions.shares, 0)));
  return {
    positions: rows.map((p) => ({
      marketId: p.marketId,
      outcomeId: p.outcomeId,
      shares: p.shares,
      costBasis: p.costBasis,
    })),
  };
}

/** Credits are conserved: users + market escrows always equal everything ever granted. */
export async function creditTotals(db: Db) {
  const num = (v: unknown) => Number(v ?? 0);
  const [u] = await db.select({ v: sql<string>`coalesce(sum(${users.balance}), 0)` }).from(users);
  const [e] = await db.select({ v: sql<string>`coalesce(sum(${markets.escrow}), 0)` }).from(markets);
  const [g] = await db
    .select({ v: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
    .from(ledger)
    .where(eq(ledger.kind, "grant"));
  const [mismatch] = await db
    .select({ v: sql<string>`count(*)` })
    .from(users)
    .where(
      sql`${users.balance} <> (select coalesce(sum(l.amount), 0) from ${ledger} l where l.user_id = ${users.id})`,
    );
  return { users: num(u?.v), escrow: num(e?.v), granted: num(g?.v), ledgerMismatches: num(mismatch?.v) };
}
