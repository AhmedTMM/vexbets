import { type Client, lmsr, type Market } from "@vexbets/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditTotals } from "../src/services/trading";
import { yesNo } from "./fixtures";
import { type Backend, startBackend } from "./harness";

let b: Backend;
let market: Market;
let yes: string;
let no: string;

beforeAll(async () => {
  b = await startBackend();
  market = await b.as("creator@example.com")("createMarket", { body: yesNo() });
  yes = market.outcomes[0]?.id ?? "";
  no = market.outcomes[1]?.id ?? "";
});
afterAll(() => b.close());

async function expectConserved() {
  const t = await creditTotals(b.deps.db);
  expect(t.ledgerMismatches).toBe(0);
  expect(t.users + t.escrow).toBe(t.granted);
}

async function buy(call: Client, outcomeId: string, shares: number, limitCredits = 1_000_000) {
  return call("trade", {
    params: { marketId: market.id },
    body: { outcomeId, side: "buy", shares, limitCredits, idempotencyKey: crypto.randomUUID() },
  });
}

describe("trading", () => {
  it("quotes match the contract's own pricing", async () => {
    const q = await b.as("alice@example.com")("quote", {
      params: { marketId: market.id },
      body: { outcomeId: yes, side: "buy", shares: 10 },
    });
    expect(q.credits).toBe(lmsr.quoteTrade([0, 0], 100, 0, "buy", 10).credits);
    expect(q.priceBeforeBps).toEqual([5000, 5000]);
    expect(q.priceAfterBps[0]).toBeGreaterThan(5000);
  });

  it("buys move the price, the balance, the position and the escrow", async () => {
    const alice = b.as("alice@example.com");
    const r = await buy(alice, yes, 10);
    expect(r.balance).toBe(10_000 - r.trade.credits);
    expect(r.position).toMatchObject({ outcomeId: yes, shares: 10, costBasis: r.trade.credits });

    const m = await alice("getMarket", { params: { marketId: market.id } });
    expect(m.outcomes[0]?.shares).toBe(10);
    expect(m.outcomes[0]?.priceBps).toBeGreaterThan(5000);
    expect(m.volumeCredits).toBe(r.trade.credits);
    await expectConserved();
  });

  it("sells pay out and never return more than the buy cost", async () => {
    const bob = b.as("bob@example.com");
    const bought = await buy(bob, no, 20);
    const sold = await bob("trade", {
      params: { marketId: market.id },
      body: { outcomeId: no, side: "sell", shares: 20, limitCredits: 0, idempotencyKey: crypto.randomUUID() },
    });
    expect(sold.trade.credits).toBeLessThanOrEqual(bought.trade.credits);
    expect(sold.position.shares).toBe(0);
    expect(sold.balance).toBe(10_000 - bought.trade.credits + sold.trade.credits);
    expect((await bob("listPositions")).positions).toEqual([]);
    await expectConserved();
  });

  it("refuses to sell shares you do not hold", async () => {
    await expect(
      b.as("carol@example.com")("trade", {
        params: { marketId: market.id },
        body: {
          outcomeId: yes,
          side: "sell",
          shares: 1,
          limitCredits: 0,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "insufficient_shares" });
  });

  it("refuses when the price moved past the limit", async () => {
    await expect(buy(b.as("dave@example.com"), yes, 10, 10)).rejects.toMatchObject({ code: "price_moved" });
    expect((await b.as("dave@example.com")("getMe")).balance).toBe(10_000);
  });

  it("refuses when the balance is too low", async () => {
    await expect(buy(b.as("erin@example.com"), yes, 5_000)).rejects.toMatchObject({
      code: "insufficient_balance",
    });
  });

  it("makes one trade for one idempotency key, even when sent twice at once", async () => {
    const frank = b.as("frank@example.com");
    const body = {
      outcomeId: yes,
      side: "buy" as const,
      shares: 3,
      limitCredits: 1_000,
      idempotencyKey: crypto.randomUUID(),
    };
    const [r1, r2] = await Promise.all([
      frank("trade", { params: { marketId: market.id }, body }),
      frank("trade", { params: { marketId: market.id }, body }),
    ]);
    expect(r1.trade.id).toBe(r2.trade.id);
    const r3 = await frank("trade", { params: { marketId: market.id }, body });
    expect(r3.trade.id).toBe(r1.trade.id);
    expect(r3.position.shares).toBe(3);
    await expectConserved();
  });

  it("queues 20 simultaneous buys: none lost, each priced after the last", async () => {
    const before = await b.as("x@example.com")("getMarket", { params: { marketId: market.id } });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => buy(b.as(`rush${i}@example.com`), yes, 5)),
    );
    const after = await b.as("x@example.com")("getMarket", { params: { marketId: market.id } });
    expect(after.outcomes[0]?.shares).toBe((before.outcomes[0]?.shares ?? 0) + 100);
    // Serialized: the total paid equals buying all 100 shares in one go.
    const paid = results.reduce((s, r) => s + r.trade.credits, 0);
    const oneGo = lmsr.quoteTrade(
      before.outcomes.map((o) => o.shares),
      100,
      0,
      "buy",
      100,
    ).credits;
    expect(paid).toBeGreaterThanOrEqual(oneGo);
    expect(paid - oneGo).toBeLessThanOrEqual(20); // only per-trade rounding
    await expectConserved();
  });

  it("lists trades newest first", async () => {
    const { trades } = await b.as("x@example.com")("listTrades", {
      params: { marketId: market.id },
      query: { limit: 3 },
    });
    expect(trades).toHaveLength(3);
    expect(trades[0]?.user.handle).toMatch(/^rush\d+$/);
  });

  it("stops trading once the window closes", async () => {
    b.advance(24 * 3600_000);
    await expect(buy(b.as("late@example.com"), yes, 1)).rejects.toMatchObject({ code: "market_closed" });
  });
});
