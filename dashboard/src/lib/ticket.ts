// Pure helpers for the trade ticket: turning a dollar amount into whole shares.

import { lmsr, type Market, type Position } from "@vexbets/contract";
import { type Side, type YesNo, yesCents } from "./market";

/** The ticket never asks for more shares than this in one trade. */
export const MAX_TICKET_SHARES = 999_999;

/** What `shares` of outcome `index` cost to buy right now, in credits. */
export function buyCost(q: readonly number[], b: number, index: number, shares: number): number {
  return lmsr.quoteTrade(q, b, index, "buy", shares).credits;
}

/**
 * The largest whole number of shares of outcome `index` whose buy cost is at most
 * `budget` credits (0 when not even one share fits). Buy cost only grows with shares, so
 * this doubles to find an upper bound, then binary-searches it.
 */
export function sharesForBudget(
  q: readonly number[],
  b: number,
  index: number,
  budget: number,
  max = MAX_TICKET_SHARES,
): number {
  if (!(budget > 0) || buyCost(q, b, index, 1) > budget) return 0;
  let lo = 1; // fits
  let hi = 2;
  while (hi <= max && buyCost(q, b, index, hi) <= budget) {
    lo = hi;
    hi *= 2;
  }
  if (hi > max) {
    if (buyCost(q, b, index, max) <= budget) return max;
    hi = max;
  }
  // Invariant: lo fits, hi does not.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (buyCost(q, b, index, mid) <= budget) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A typed dollar amount ("8", "8.4", "$8.40") in whole credits (1 credit = 1¢), rounded
 * down to the cent. Anything that is not a non-negative amount reads as 0.
 */
export function dollarsToCredits(text: string): number {
  const t = text.replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return 0;
  const [whole = "", frac = ""] = t.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
}

/** Keep only what a dollar field accepts: digits and at most one dot with two decimals. */
export function cleanDollars(text: string): string {
  const t = text.replace(/[^\d.]/g, "");
  const dot = t.indexOf(".");
  const s =
    dot < 0
      ? t
      : `${t.slice(0, dot + 1)}${t
          .slice(dot + 1)
          .replace(/\./g, "")
          .slice(0, 2)}`;
  return s.slice(0, 9);
}

/** Keep only digits for a share count. */
export function cleanShares(text: string): string {
  return text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 6);
}

export interface HoldingRow {
  side: Side;
  outcomeId: string;
  shares: number;
  /** Average cost per share, in cents. */
  avgCents: number;
  /** Current price per share, in cents. */
  nowCents: number;
  /** What the shares are worth at the current price, in credits. */
  value: number;
  /** value minus cost basis, in credits. */
  gain: number;
}

/** Your YES and NO holdings in one market (only sides you hold), priced now. */
export function holdingRows(market: Market, yn: YesNo, positions: readonly Position[]): HoldingRow[] {
  const yes = yesCents(market, yn);
  const rows: HoldingRow[] = [];
  for (const side of ["YES", "NO"] as const) {
    const o = side === "YES" ? yn.yes : yn.no;
    const p = positions.find((x) => x.marketId === market.id && x.outcomeId === o.id);
    if (!p || p.shares <= 0) continue;
    const nowCents = side === "YES" ? yes : 100 - yes;
    const value = Math.round(p.shares * nowCents);
    rows.push({
      side,
      outcomeId: o.id,
      shares: p.shares,
      avgCents: p.costBasis / p.shares,
      nowCents,
      value,
      gain: value - p.costBasis,
    });
  }
  return rows;
}

/** "Nov 30, 2026" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
