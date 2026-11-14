/**
 * Pricing: a logarithmic market scoring rule (LMSR) market maker.
 *
 * The backend is always the counterparty, so a market with three friends still has
 * liquidity. The dashboard uses the same functions to preview a trade before sending it;
 * the backend's quote is the one that counts.
 *
 *   cost(q)  = SHARE_PAYOUT * b * ln(sum_i exp(q_i / b))
 *   price_i  = exp(q_i / b) / sum_j exp(q_j / b)
 *
 * q_i is the number of outstanding shares of outcome i, and b is the market's liquidity:
 * bigger b means prices move less per trade. The creator's worst-case loss is
 * maxSubsidy(b, n) = SHARE_PAYOUT * b * ln(n).
 */

export const SHARE_PAYOUT = 100;

export type Side = "buy" | "sell";

function assertMarket(q: readonly number[], b: number): void {
  if (q.length < 2) throw new RangeError("a market needs at least two outcomes");
  if (!(b > 0)) throw new RangeError("liquidity b must be positive");
  for (const x of q) {
    if (!Number.isInteger(x) || x < 0) throw new RangeError("shares must be whole and >= 0");
  }
}

function logSumExp(q: readonly number[], b: number): number {
  const m = Math.max(...q) / b;
  let s = 0;
  for (const x of q) s += Math.exp(x / b - m);
  return m + Math.log(s);
}

/** Total cost function, in credits (not rounded). */
export function cost(q: readonly number[], b: number): number {
  assertMarket(q, b);
  return SHARE_PAYOUT * b * logSumExp(q, b);
}

/** Price of each outcome as a probability; the values add up to 1. */
export function prices(q: readonly number[], b: number): number[] {
  assertMarket(q, b);
  const m = Math.max(...q) / b;
  const e = q.map((x) => Math.exp(x / b - m));
  const s = e.reduce((a, x) => a + x, 0);
  return e.map((x) => x / s);
}

export function pricesBps(q: readonly number[], b: number): number[] {
  return prices(q, b).map((p) => Math.round(p * 10_000));
}

export interface TradeQuote {
  /** What the trader pays (buy) or receives (sell). Rounded in the house's favour. */
  credits: number;
  /** Outstanding shares after the trade. */
  after: number[];
  priceBeforeBps: number[];
  priceAfterBps: number[];
  /** Average price per share, in basis points of SHARE_PAYOUT. */
  avgPriceBps: number;
}

export function quoteTrade(
  q: readonly number[],
  b: number,
  outcomeIndex: number,
  side: Side,
  shares: number,
): TradeQuote {
  assertMarket(q, b);
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= q.length) {
    throw new RangeError("unknown outcome");
  }
  if (!Number.isInteger(shares) || shares < 1) throw new RangeError("shares must be >= 1");

  const after = [...q];
  after[outcomeIndex] = (after[outcomeIndex] ?? 0) + (side === "buy" ? shares : -shares);
  if ((after[outcomeIndex] ?? 0) < 0) throw new RangeError("cannot sell more than outstanding");

  const raw = cost(after, b) - cost(q, b);
  const eps = 1e-9;
  const credits = side === "buy" ? Math.ceil(raw - eps) : Math.floor(-raw + eps);

  return {
    credits,
    after,
    priceBeforeBps: pricesBps(q, b),
    priceAfterBps: pricesBps(after, b),
    avgPriceBps: Math.round((credits / (shares * SHARE_PAYOUT)) * 10_000),
  };
}

/** Worst-case loss for whoever seeds the market, in credits. */
export function maxSubsidy(b: number, outcomes: number): number {
  if (outcomes < 2) throw new RangeError("a market needs at least two outcomes");
  return Math.ceil(SHARE_PAYOUT * b * Math.log(outcomes));
}
