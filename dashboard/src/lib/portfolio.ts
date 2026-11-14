import type { Market, Trade } from "@vexbets/contract";

export interface ValuePoint {
  t: number;
  v: number;
}

/**
 * Account value over time, rebuilt from your fills and payouts. Open positions count at
 * what you paid until they settle; the last point uses today's prices (`totalNow`).
 * All amounts are contract credits (1 credit = 1¢).
 */
export function valueSeries(
  mine: Trade[],
  markets: Market[],
  meId: string,
  cash: number,
  totalNow: number,
  now: number = Date.now(),
): ValuePoint[] {
  type Ev = { t: number; cash: number; market: string; cost: number; settle?: boolean };
  const events: Ev[] = mine.map((t) => ({
    t: Date.parse(t.createdAt),
    cash: t.side === "buy" ? -t.credits : t.credits,
    market: t.marketId,
    cost: t.side === "buy" ? t.credits : -t.credits,
  }));
  const tradedIn = new Set(mine.map((t) => t.marketId));
  for (const m of markets) {
    if (m.status !== "resolved" || !m.resolution || !tradedIn.has(m.id)) continue;
    const payout = m.resolution.payouts.find((p) => p.userId === meId)?.credits ?? 0;
    events.push({
      t: Date.parse(m.resolution.resolvedAt),
      cash: payout,
      market: m.id,
      cost: 0,
      settle: true,
    });
  }
  events.sort((a, b) => a.t - b.t);

  let running = cash - events.reduce((a, e) => a + e.cash, 0);
  const openCost = new Map<string, number>();
  const value = () => running + [...openCost.values()].reduce((a, c) => a + c, 0);
  const first = events[0]?.t ?? now - 3_600_000;
  const pts: ValuePoint[] = [{ t: first - 60_000, v: value() }];
  for (const e of events) {
    running += e.cash;
    if (e.settle) openCost.delete(e.market);
    else openCost.set(e.market, (openCost.get(e.market) ?? 0) + e.cost);
    pts.push({ t: e.t, v: value() });
  }
  pts.push({ t: Math.max(now, (pts.at(-1)?.t ?? now) + 1), v: totalNow });
  return pts;
}
