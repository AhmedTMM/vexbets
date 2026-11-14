import { ContractError, type CreateMarketRequest, lmsr, type Market } from "@vexbets/contract";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "../db/client";
import { markets, outcomes, users } from "../db/schema";
import type { Deps } from "../deps";
import { lockUser, moveCredits, summary, type UserRow } from "./users";

export type MarketRow = typeof markets.$inferSelect;
export type OutcomeRow = typeof outcomes.$inferSelect;
type CreateInput = z.output<typeof CreateMarketRequest>;

/** Build the contract's Market from rows. */
export function toMarket(
  m: MarketRow,
  os: OutcomeRow[],
  creator: Pick<UserRow, "id" | "handle" | "displayName">,
): Market {
  const sorted = [...os].sort((a, b) => a.idx - b.idx);
  const bps = lmsr.pricesBps(
    sorted.map((o) => o.shares),
    m.liquidityB,
  );
  return {
    id: m.id,
    creator: summary(creator),
    question: m.question,
    tagline: m.tagline,
    criteria: m.criteria,
    outcomes: sorted.map((o, i) => ({
      id: o.id,
      label: o.label,
      criteria: o.criteria,
      shares: o.shares,
      priceBps: bps[i] ?? 0,
    })),
    fallbackOutcomeId: m.fallbackOutcomeId,
    resolveEarly: m.resolveEarly,
    bandNumber: m.bandNumber,
    subjectName: m.subjectName,
    opensAt: m.opensAt.toISOString(),
    closesAt: m.closesAt.toISOString(),
    liquidityB: m.liquidityB,
    status: m.status,
    volumeCredits: m.volumeCredits,
    createdAt: m.createdAt.toISOString(),
    resolution: m.resolution ?? null,
  };
}

export async function createMarket(deps: Deps, creator: UserRow, input: CreateInput): Promise<Market> {
  const now = deps.now();
  const opensAt = input.opensAt ? new Date(input.opensAt) : now;
  const closesAt = new Date(input.closesAt);
  if (closesAt <= now) throw new ContractError("bad_request", "closesAt must be in the future");
  if (closesAt <= opensAt) throw new ContractError("bad_request", "closesAt must be after opensAt");

  const subsidy = lmsr.maxSubsidy(input.liquidityB, input.outcomes.length);
  const id = crypto.randomUUID();
  const outcomeRows: OutcomeRow[] = input.outcomes.map((o, idx) => ({
    id: crypto.randomUUID(),
    marketId: id,
    idx,
    label: o.label,
    criteria: o.criteria ?? null,
    shares: 0,
  }));
  const fallback = outcomeRows[input.fallbackOutcomeIndex];
  if (!fallback) throw new ContractError("bad_request", "fallbackOutcomeIndex is out of range");

  return deps.db.transaction(async (tx) => {
    const user = await lockUser(tx, creator.id);
    if (user.balance < subsidy) {
      throw new ContractError(
        "insufficient_balance",
        `seeding this market costs ${subsidy} credits (its worst-case loss); you have ${user.balance}`,
        422,
        { needed: subsidy, balance: user.balance },
      );
    }
    const [row] = await tx
      .insert(markets)
      .values({
        id,
        creatorId: user.id,
        question: input.question,
        tagline: input.tagline,
        criteria: input.criteria,
        fallbackOutcomeId: fallback.id,
        resolveEarly: input.resolveEarly,
        bandNumber: input.bandNumber,
        subjectName: input.subjectName,
        opensAt,
        closesAt,
        liquidityB: input.liquidityB,
        status: "open",
        escrow: subsidy,
        createdAt: now,
      })
      .returning();
    await tx.insert(outcomes).values(outcomeRows);
    await moveCredits(tx, deps, user, { kind: "market_subsidy", amount: -subsidy, marketId: id });
    if (!row) throw new Error("insert returned nothing");
    return toMarket(row, outcomeRows, user);
  });
}

/** Load markets with their outcomes and creators, in the given order. */
async function hydrate(db: Db, rows: MarketRow[]): Promise<Market[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const os = await db
    .select()
    .from(outcomes)
    .where(inArray(outcomes.marketId, ids))
    .orderBy(asc(outcomes.idx));
  const creators = await db
    .select()
    .from(users)
    .where(
      inArray(
        users.id,
        rows.map((r) => r.creatorId),
      ),
    );
  const byCreator = new Map(creators.map((u) => [u.id, u]));
  return rows.map((r) => {
    const creator = byCreator.get(r.creatorId);
    if (!creator) throw new Error(`creator of ${r.id} missing`);
    return toMarket(
      r,
      os.filter((o) => o.marketId === r.id),
      creator,
    );
  });
}

export async function getMarket(deps: Deps, id: string): Promise<Market> {
  const [row] = await deps.db.select().from(markets).where(eq(markets.id, id));
  if (!row) throw new ContractError("not_found", "no such market");
  const [m] = await hydrate(deps.db, [row]);
  if (!m) throw new ContractError("not_found", "no such market");
  return m;
}

/** Cursor = offset, as a string. Simple and good enough for a demo. */
export async function listMarkets(
  deps: Deps,
  q: { status?: MarketRow["status"]; limit?: number; cursor?: string },
): Promise<{ markets: Market[]; nextCursor: string | null }> {
  const limit = q.limit ?? 20;
  const offset = q.cursor ? Number.parseInt(q.cursor, 10) || 0 : 0;
  const rows = await deps.db
    .select()
    .from(markets)
    .where(q.status ? and(eq(markets.status, q.status)) : undefined)
    .orderBy(desc(markets.createdAt), desc(markets.id))
    .limit(limit + 1)
    .offset(offset);
  const page = rows.slice(0, limit);
  return {
    markets: await hydrate(deps.db, page),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  };
}
