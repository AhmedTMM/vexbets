import type { Trade } from "@vexbets/contract";
import { api, refreshAll } from "./api";

/** How far the price may move between the quote and the trade before it is refused. */
const SLIPPAGE = 0.03;

/**
 * Quote, then trade with a slippage limit and a fresh idempotency key. Used by the buy
 * ticket and by every Sell button, so both follow the contract the same way.
 */
export async function placeTrade(
  marketId: string,
  outcomeId: string,
  side: "buy" | "sell",
  shares: number,
): Promise<Trade> {
  const params = { marketId };
  const q = await api("quote", { params, body: { outcomeId, side, shares } });
  const limitCredits =
    side === "buy" ? Math.ceil(q.credits * (1 + SLIPPAGE)) : Math.floor(q.credits * (1 - SLIPPAGE));
  const r = await api("trade", {
    params,
    body: { outcomeId, side, shares, limitCredits, idempotencyKey: crypto.randomUUID() },
  });
  refreshAll();
  return r.trade;
}
