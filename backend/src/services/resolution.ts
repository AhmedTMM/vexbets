import {
  ContractError,
  type Decision,
  type Evidence,
  GENESIS_HASH,
  type Market,
  type ProofBundle,
  type Resolution,
  SHARE_PAYOUT,
} from "@vexbets/contract";
import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { listenSessions, markets, positions, segments } from "../db/schema";
import type { Deps } from "../deps";
import type { TranscriptLine } from "../judge/types";
import { getMarket } from "./markets";
import { lockUser, moveCredits } from "./users";

type SegmentRow = typeof segments.$inferSelect;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Sessions on the market's band that overlap its window. */
async function sessionsFor(deps: Deps, m: Market) {
  return deps.db
    .select()
    .from(listenSessions)
    .where(
      and(
        eq(listenSessions.bandNumber, m.bandNumber),
        lte(listenSessions.startedAt, new Date(m.closesAt)),
        or(isNull(listenSessions.endedAt), gte(listenSessions.endedAt, new Date(m.opensAt))),
      ),
    );
}

/** What the band heard inside the market's window, oldest first. */
export async function windowSegments(deps: Deps, m: Market): Promise<SegmentRow[]> {
  const sessions = await sessionsFor(deps, m);
  if (sessions.length === 0) return [];
  return deps.db
    .select()
    .from(segments)
    .where(
      and(
        inArray(
          segments.sessionId,
          sessions.map((s) => s.id),
        ),
        gte(segments.startMs, Date.parse(m.opensAt)),
        lte(segments.endMs, Date.parse(m.closesAt)),
      ),
    )
    .orderBy(asc(segments.startMs), asc(segments.seq));
}

/**
 * Ask the judge, then hold its answer to the transcript: a verdict must name an outcome, and
 * only quotes that really are in a line of this window count. A verdict with no real quote
 * is treated as UNDETERMINED, so every resolution's proof passes verifyProof.
 */
export async function decide(deps: Deps, m: Market, mode: "early" | "final"): Promise<Decision> {
  const rows = await windowSegments(deps, m);
  const transcript: TranscriptLine[] = rows.map((r) => ({
    segmentId: r.id,
    startMs: r.startMs,
    speaker: r.speaker,
    text: r.text,
  }));
  const out = await deps.judge.judge({ market: m, mode, transcript });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const evidence: Evidence[] = out.evidence.filter((e) => {
    const row = byId.get(e.segmentId);
    return row !== undefined && norm(row.text).includes(norm(e.quote));
  });
  const outcome = m.outcomes.find((o) => norm(o.label) === norm(out.verdict));
  const base = {
    marketId: m.id,
    model: deps.judge.model,
    confidence: out.confidence,
    rationale: out.rationale,
    headHash: rows.at(-1)?.hash ?? GENESIS_HASH,
    decidedAt: deps.now().toISOString(),
  };
  if (outcome && evidence.length > 0) {
    return { ...base, status: "decided", outcomeId: outcome.id, evidence };
  }
  const why = outcome ? " (its quotes were not found in the transcript)" : "";
  return { ...base, status: "undetermined", outcomeId: null, evidence: [], rationale: out.rationale + why };
}

/**
 * Settle a market: pay SHARE_PAYOUT per winning share, then give the creator whatever is
 * left in escrow (their subsidy back, plus or minus what the market maker made).
 */
async function settle(
  deps: Deps,
  marketId: string,
  decision: Decision,
  via: Resolution["via"],
): Promise<boolean> {
  return deps.db.transaction(async (tx) => {
    const [m] = await tx.select().from(markets).where(eq(markets.id, marketId)).for("update");
    if (!m || m.status === "resolved" || m.status === "voided") return false;

    const outcomeId =
      via === "evidence" && decision.status === "decided" ? decision.outcomeId : m.fallbackOutcomeId;
    const winners = await tx
      .select()
      .from(positions)
      .where(and(eq(positions.outcomeId, outcomeId), gt(positions.shares, 0)))
      .orderBy(asc(positions.userId));

    let escrow = m.escrow;
    const payouts: Resolution["payouts"] = [];
    for (const p of winners) {
      const credits = p.shares * SHARE_PAYOUT;
      const user = await lockUser(tx, p.userId);
      await moveCredits(tx, deps, user, { kind: "payout", amount: credits, marketId: m.id });
      escrow -= credits;
      payouts.push({ userId: p.userId, shares: p.shares, credits });
    }
    if (escrow < 0) throw new Error(`market ${m.id} escrow went negative (${escrow})`);
    if (escrow > 0) {
      const creator = await lockUser(tx, m.creatorId);
      await moveCredits(tx, deps, creator, { kind: "creator_settlement", amount: escrow, marketId: m.id });
    }

    const resolution: Resolution = {
      marketId: m.id,
      outcomeId,
      via,
      decision,
      payouts,
      resolvedAt: deps.now().toISOString(),
    };
    await tx.update(markets).set({ status: "resolved", escrow: 0, resolution }).where(eq(markets.id, m.id));
    return true;
  });
}

/** A judge run that has held a market this long is presumed dead (crashed function). */
export const JUDGE_LEASE_MS = 60_000;

/**
 * After new transcript arrives for a band: judge each of that band's open markets that
 * resolve early, against everything heard in its window so far.
 *
 * Every batch is judged; none is skipped. At most one judge call runs per market: a batch
 * that arrives while one is running marks the market `judge_pending`, and the running job
 * goes round again as soon as it finishes, so the latest words are always judged next.
 */
export async function judgeBand(deps: Deps, bandNumber: number): Promise<void> {
  const now = deps.now();
  const open = await deps.db
    .select({ id: markets.id })
    .from(markets)
    .where(
      and(
        eq(markets.bandNumber, bandNumber),
        eq(markets.status, "open"),
        eq(markets.resolveEarly, true),
        lte(markets.opensAt, now),
        gt(markets.closesAt, now),
      ),
    );
  await Promise.all(open.map(({ id }) => judgeMarket(deps, id)));
}

async function judgeMarket(deps: Deps, id: string): Promise<void> {
  const now = deps.now();
  const [claimed] = await deps.db
    .update(markets)
    .set({ judgingSince: now, judgePending: false })
    .where(
      and(
        eq(markets.id, id),
        or(isNull(markets.judgingSince), lte(markets.judgingSince, new Date(now.getTime() - JUDGE_LEASE_MS))),
      ),
    )
    .returning({ id: markets.id });
  if (!claimed) {
    // Someone is judging this market right now: make sure they look again.
    await deps.db.update(markets).set({ judgePending: true }).where(eq(markets.id, id));
    return;
  }

  for (;;) {
    let settled = false;
    try {
      const m = await getMarket(deps, id);
      if (m.status !== "open") break;
      const decision = await decide(deps, m, "early");
      await deps.db.update(markets).set({ lastJudgedAt: deps.now() }).where(eq(markets.id, id));
      if (decision.status === "decided") settled = await settle(deps, id, decision, "evidence");
    } catch (err) {
      deps.log.error(err);
    }
    if (settled) break;
    // Release the lease, unless more transcript came in meanwhile: then keep it and go again.
    const [again] = await deps.db
      .update(markets)
      .set({
        judgingSince: sql`case when ${markets.judgePending} then ${deps.now().toISOString()}::timestamptz else null end`,
        judgePending: false,
      })
      .where(eq(markets.id, id))
      .returning({ judgingSince: markets.judgingSince });
    if (!again?.judgingSince) return;
  }
  await deps.db.update(markets).set({ judgingSince: null, judgePending: false }).where(eq(markets.id, id));
}

/** Close every open market whose window has ended, and resolve it from the full transcript. */
export async function closeDueMarkets(deps: Deps): Promise<number> {
  const now = deps.now();
  await deps.db
    .update(markets)
    .set({ status: "closed" })
    .where(and(eq(markets.status, "open"), lte(markets.closesAt, now)));
  // Every closed market, including ones that failed to resolve before (judge down, etc).
  const closed = await deps.db.select({ id: markets.id }).from(markets).where(eq(markets.status, "closed"));

  let resolved = 0;
  for (const { id } of closed) {
    try {
      const m = await getMarket(deps, id);
      const decision = await decide(deps, m, "final");
      const ok = await settle(deps, id, decision, decision.status === "decided" ? "evidence" : "fallback");
      if (ok) resolved += 1;
    } catch (err) {
      deps.log.error(err);
    }
  }
  return resolved;
}

export async function getProof(deps: Deps, marketId: string): Promise<ProofBundle> {
  const market = await getMarket(deps, marketId);
  if (market.status !== "resolved") throw new ContractError("conflict", "this market has not resolved yet");
  const sessions = await sessionsFor(deps, market);
  const segs = sessions.length
    ? await deps.db
        .select()
        .from(segments)
        .where(
          inArray(
            segments.sessionId,
            sessions.map((s) => s.id),
          ),
        )
        .orderBy(asc(segments.sessionId), asc(segments.seq))
    : [];
  return {
    market,
    segments: segs.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      seq: s.seq,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      confidence: s.confidence,
      speaker: s.speaker,
      prevHash: s.prevHash,
      hash: s.hash,
    })),
  };
}

const lastClose = new WeakMap<Deps, number>();

/**
 * Close due markets on the way into a request, at most once per closeEveryMs. The dashboard
 * polls, so markets close within seconds of closesAt without a frequent cron (Vercel's free
 * plan only runs crons daily; /api/cron/tick is the backstop).
 */
export async function maybeCloseDue(deps: Deps): Promise<void> {
  const now = deps.now().getTime();
  const last = lastClose.get(deps);
  if (last !== undefined && now - last < deps.config.closeEveryMs) return;
  lastClose.set(deps, now);
  try {
    await closeDueMarkets(deps);
  } catch (err) {
    deps.log.error(err);
  }
}
