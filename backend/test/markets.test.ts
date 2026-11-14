import { type CreateMarketRequest, lmsr } from "@vexbets/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Backend, startBackend } from "./harness";

let b: Backend;
beforeAll(async () => {
  b = await startBackend();
});
afterAll(() => b.close());

const BAND = 7; // test-only; the real band number lives in the listener, not the backend

export function yesNo(patch: Partial<CreateMarketRequest> = {}): CreateMarketRequest {
  return {
    question: "Will Sam say 'no cap' before midnight?",
    tagline: "Sam vs. his favourite phrase",
    criteria: "Anyone near the band says the words 'no cap'.",
    outcomes: [{ label: "Yes" }, { label: "No" }],
    fallbackOutcomeIndex: 1,
    bandNumber: BAND,
    subjectName: "Sam",
    closesAt: "2026-11-15T00:00:00.000Z",
    ...patch,
  };
}

describe("me", () => {
  it("creates a user on first sight with 10,000 credits", async () => {
    const me = await b.as("Ahmed@Example.com")("getMe");
    expect(me).toMatchObject({ handle: "ahmed", displayName: "ahmed", balance: 10_000 });
    const again = await b.as("ahmed@example.com")("getMe");
    expect(again.id).toBe(me.id);
  });

  it("gives clashing handles a suffix", async () => {
    const other = await b.as("ahmed@other.org")("getMe");
    expect(other.handle).toMatch(/^ahmed_\d{4}$/);
  });

  it("needs an email", async () => {
    await expect(b.anonymous()("getMe")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
});

describe("markets", () => {
  it("creates a market, charges the creator its worst-case loss, and lists it", async () => {
    const call = b.as("creator@example.com");
    const m = await call("createMarket", { body: yesNo() });
    expect(m.status).toBe("open");
    expect(m.outcomes.map((o) => [o.label, o.priceBps])).toEqual([
      ["Yes", 5000],
      ["No", 5000],
    ]);
    expect(m.fallbackOutcomeId).toBe(m.outcomes[1]?.id);
    expect(m.opensAt).toBe(b.now().toISOString());
    expect(m.creator.handle).toBe("creator");

    const me = await call("getMe");
    expect(me.balance).toBe(10_000 - lmsr.maxSubsidy(100, 2));

    expect(await call("getMarket", { params: { marketId: m.id } })).toEqual(m);
    const { markets } = await call("listMarkets", { query: { status: "open" } });
    expect(markets.map((x) => x.id)).toContain(m.id);
  });

  it("refuses a market the creator cannot afford", async () => {
    const call = b.as("poor@example.com");
    await expect(call("createMarket", { body: yesNo({ liquidityB: 10_000 }) })).rejects.toMatchObject({
      code: "insufficient_balance",
    });
    expect((await call("getMe")).balance).toBe(10_000);
  });

  it("refuses a window that already closed", async () => {
    await expect(
      b.as("late@example.com")("createMarket", { body: yesNo({ closesAt: "2026-11-14T19:00:00.000Z" }) }),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("answers unknown and malformed ids with not_found", async () => {
    const call = b.as("x@example.com");
    await expect(call("getMarket", { params: { marketId: crypto.randomUUID() } })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(call("getMarket", { params: { marketId: "nope" } })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("pages through markets", async () => {
    const call = b.as("pager@example.com");
    for (let i = 0; i < 3; i++) {
      b.advance(1000);
      await call("createMarket", {
        body: yesNo({ liquidityB: 10, question: `Will page test ${i} happen?` }),
      });
    }
    const first = await call("listMarkets", { query: { limit: 2 } });
    expect(first.markets).toHaveLength(2);
    expect(first.markets[0]?.question).toBe("Will page test 2 happen?");
    expect(first.nextCursor).not.toBeNull();
    const second = await call("listMarkets", { query: { limit: 2, cursor: first.nextCursor ?? "" } });
    expect(second.markets[0]?.question).toBe("Will page test 0 happen?");
  });
});
