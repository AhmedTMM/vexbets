import { lmsr, type Market, type Trade } from "@vexbets/contract";

export interface ValuePoint {
  t: number;
  v: number;
}

/** A market this user opened, with every trade in it (anyone's), for the creator refund. */
export interface CreatedMarket {
  market: Market;
  trades: Trade[];
}

/** The creator's deposit: the market maker's worst-case loss, charged when it opens. */
export function deposit(m: Market): number {
  return lmsr.maxSubsidy(m.liquidityB, m.outcomes.length);
}

/**
 * What the creator gets back when a market settles: deposit + buys − sells − payouts
 * (the backend's escrow). Only meaningful once the market is resolved.
 */
export function creatorRefund(m: Market, trades: Trade[]): number {
  const net = trades.reduce((a, t) => a + (t.side === "buy" ? t.credits : -t.credits), 0);
  const paid = m.resolution?.payouts.reduce((a, p) => a + p.credits, 0) ?? 0;
  return deposit(m) + net - paid;
}

/**
 * Account value over time, rebuilt from your fills, payouts and the markets you opened.
 * Open positions count at what you paid and open markets at their deposit until they
 * settle; the last point uses today's prices (`totalNow`). Amounts are contract credits.
 */
export function valueSeries(
  mine: Trade[],
  markets: Market[],
  meId: string,
  cash: number,
  totalNow: number,
  now: number = Date.now(),
  created: CreatedMarket[] = [],
): ValuePoint[] {
  type Ev = { t: number; cash: number; key: string; asset: number; settle?: boolean };
  const events: Ev[] = mine.map((t) => ({
    t: Date.parse(t.createdAt),
    cash: t.side === "buy" ? -t.credits : t.credits,
    key: `pos:${t.marketId}`,
    asset: t.side === "buy" ? t.credits : -t.credits,
  }));
  const tradedIn = new Set(mine.map((t) => t.marketId));
  for (const m of markets) {
    if (m.status !== "resolved" || !m.resolution || !tradedIn.has(m.id)) continue;
    const payout = m.resolution.payouts.find((p) => p.userId === meId)?.credits ?? 0;
    events.push({
      t: Date.parse(m.resolution.resolvedAt),
      cash: payout,
      key: `pos:${m.id}`,
      asset: 0,
      settle: true,
    });
  }
  for (const { market: m, trades } of created) {
    const d = deposit(m);
    events.push({ t: Date.parse(m.createdAt), cash: -d, key: `escrow:${m.id}`, asset: d });
    if (m.status === "resolved" && m.resolution) {
      events.push({
        t: Date.parse(m.resolution.resolvedAt),
        cash: creatorRefund(m, trades),
        key: `escrow:${m.id}`,
        asset: 0,
        settle: true,
      });
    }
  }
  events.sort((a, b) => a.t - b.t);

  let running = cash - events.reduce((a, e) => a + e.cash, 0);
  const assets = new Map<string, number>();
  const value = () => running + [...assets.values()].reduce((a, c) => a + c, 0);
  const first = events[0]?.t ?? now - 3_600_000;
  const pts: ValuePoint[] = [{ t: first - 60_000, v: value() }];
  for (const e of events) {
    running += e.cash;
    if (e.settle) assets.delete(e.key);
    else assets.set(e.key, (assets.get(e.key) ?? 0) + e.asset);
    pts.push({ t: e.t, v: value() });
  }
  pts.push({ t: Math.max(now, (pts.at(-1)?.t ?? now) + 1), v: totalNow });
  return pts;
}
