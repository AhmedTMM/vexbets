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
  return resample(pts, 120);
}

/**
 * A price series on an even time grid: `n` samples from the first to the last point, each
 * carrying the price set by the latest trade at or before it, plus every real point, so a
 * jump lands exactly where the trade happened. A market with three trades still draws a
 * full, hoverable line.
 */
export function resample(points: PricePoint[], n: number): PricePoint[] {
  const first = points[0];
  const lastPt = points.at(-1);
  if (!first || !lastPt || points.length < 2 || lastPt.t <= first.t) return points;
  const step = (lastPt.t - first.t) / (n - 1);
  const out: PricePoint[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const t = first.t + k * step;
    while (i + 1 < points.length && (points[i + 1] as PricePoint).t <= t) {
      i++;
      out.push(points[i] as PricePoint); // the real point, exactly when it happened
    }
    const at = points[i] as PricePoint;
    out.push({ t, yes: at.yes, no: at.no });
  }
  // Every real point is kept; sort by time and drop exact duplicates.
  out.sort((a, b) => a.t - b.t);
  return out.filter((p, j) => j === 0 || p.t !== (out[j - 1] as PricePoint).t);
}

/** Change in YES price since the market opened, in cents. */
export function yesChange(points: PricePoint[]): number {
  const first = points[0]?.yes ?? 50;
  const last = points.at(-1)?.yes ?? 50;
  return last - first;
}
