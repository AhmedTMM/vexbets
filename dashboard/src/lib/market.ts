// YES / NO view of a contract Market. The dashboard only makes two-outcome markets:
// YES (the thing is heard) and NO (the fallback: nothing heard by closesAt).

import { type Market, type Outcome, SHARE_PAYOUT, type Trade } from "@vexbets/contract";

export type Side = "YES" | "NO";

export interface YesNo {
  yes: Outcome;
  no: Outcome;
  yesIndex: number;
  noIndex: number;
}

export function yesNo(m: Market): YesNo | null {
  if (m.outcomes.length !== 2) return null;
  const noIndex = m.outcomes.findIndex((o) => o.id === m.fallbackOutcomeId);
  const yesIndex = noIndex === 0 ? 1 : 0;
  const yes = m.outcomes[yesIndex];
  const no = m.outcomes[noIndex];
  if (!yes || !no) return null;
  return { yes, no, yesIndex, noIndex };
}

export function outcomeFor(yn: YesNo, side: Side): Outcome {
  return side === "YES" ? yn.yes : yn.no;
}

export function sideOf(yn: YesNo, outcomeId: string): Side {
  return outcomeId === yn.yes.id ? "YES" : "NO";
}

/** Current YES price in cents (credits per share, a winning share pays SHARE_PAYOUT). */
export function yesCents(m: Market, yn: YesNo): number {
  if (m.status === "resolved" && m.resolution) return m.resolution.outcomeId === yn.yes.id ? SHARE_PAYOUT : 0;
  return yn.yes.priceBps / 100;
}

export interface PricePoint {
  t: number;
  yes: number;
  no: number;
}

/** YES/NO price history, from the trades' priceAfterBps (any order in, oldest first out). */
export function priceHistory(m: Market, yn: YesNo, trades: Trade[], nowMs: number): PricePoint[] {
  const sorted = [...trades].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const point = (t: number, yesBps: number) => ({ t, yes: yesBps / 100, no: 100 - yesBps / 100 });
  const firstBefore = sorted[0];
  // Before any trade, both sides start even (LMSR with zero shares).
  const pts: PricePoint[] = [point(Date.parse(m.opensAt), firstBefore ? 5000 : yn.yes.priceBps)];
  for (const t of sorted) pts.push(point(Date.parse(t.createdAt), t.priceAfterBps[yn.yesIndex] ?? 5000));
  const last = pts.at(-1)?.t ?? nowMs;
  const end =
    m.status === "resolved" && m.resolution
      ? Date.parse(m.resolution.resolvedAt)
      : Math.min(nowMs, Date.parse(m.closesAt));
  pts.push(point(Math.max(last, end), yesCents(m, yn) * 100));
  return pts;
}

/** Change in YES price since the market opened, in cents. */
export function yesChange(points: PricePoint[]): number {
  const first = points[0]?.yes ?? 50;
  const last = points.at(-1)?.yes ?? 50;
  return last - first;
}
