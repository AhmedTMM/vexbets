import { z } from "zod";
import { Bps, Credits, Id, Page, Shares, Timestamp, UserSummary } from "./common";

/** Trading: every trade is against the LMSR market maker (lmsr.ts). */

export const Side = z.enum(["buy", "sell"]);

export const QuoteRequest = z.object({
  outcomeId: Id,
  side: Side,
  shares: Shares,
});
export type QuoteRequest = z.infer<typeof QuoteRequest>;

export const Quote = QuoteRequest.extend({
  /** Paid for a buy, received for a sell. */
  credits: Credits,
  avgPriceBps: Bps,
  /** Prices of all outcomes, in the market's outcome order. */
  priceBeforeBps: z.array(Bps),
  priceAfterBps: z.array(Bps),
});
export type Quote = z.infer<typeof Quote>;

export const TradeRequest = QuoteRequest.extend({
  /**
   * Slippage guard. Buy: the most you will pay. Sell: the least you will accept.
   * The backend rejects the trade with "price_moved" if the market moved past it.
   */
  limitCredits: Credits,
  /** Client-generated; sending the same key twice makes one trade. */
  idempotencyKey: Id,
});
export type TradeRequest = z.infer<typeof TradeRequest>;

export const Trade = z.object({
  id: Id,
  marketId: Id,
  user: UserSummary,
  outcomeId: Id,
  side: Side,
  shares: Shares,
  credits: Credits,
  priceAfterBps: z.array(Bps),
  createdAt: Timestamp,
});
export type Trade = z.infer<typeof Trade>;

export const Position = z.object({
  marketId: Id,
  outcomeId: Id,
  shares: z.int().nonnegative(),
  /** Credits spent minus credits received on this outcome. */
  costBasis: z.int(),
});
export type Position = z.infer<typeof Position>;

export const TradeResponse = z.object({
  trade: Trade,
  balance: Credits,
  position: Position,
});

export const ListTradesQuery = Page;
export const ListTradesResponse = z.object({
  trades: z.array(Trade),
  nextCursor: z.string().nullable(),
});

export const ListPositionsResponse = z.object({
  positions: z.array(Position),
});
