import { type Client, lmsr, type Market, SHARE_PAYOUT, verifyProof } from "@vexbets/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scriptedJudge } from "../src/judge/fake";
import { closeDueMarkets } from "../src/services/resolution";
import { creditTotals } from "../src/services/trading";
import { TEST_BAND, yesNo } from "./fixtures";
import { type Backend, startBackend } from "./harness";

/**
 * The whole product, through the contract client: create, trade, listen, judge, pay, prove.
 */

function trader(market: Market) {
  return async (call: Client, label: string, shares: number) =>
    call("trade", {
      params: { marketId: market.id },
      body: {
        outcomeId: market.outcomes.find((o) => o.label === label)?.id ?? "",
        side: "buy",
        shares,
        limitCredits: 10_000,
        idempotencyKey: crypto.randomUUID(),
      },
    });
}

function listener(b: Backend, band = TEST_BAND) {
  const call = b.as("listener@example.com");
  let sessionId = "";
  let seq = 0;
  return {
    async start() {
      sessionId = (
        await call("startSession", { body: { bandNumber: band, subjectName: "Sam", consentConfirmed: true } })
      ).id;
    },
    async hear(...texts: string[]) {
      const segments = texts.map((text) => {
        const startMs = b.now().getTime() + seq * 10;
        return { seq: seq++, startMs, endMs: startMs + 5, text, confidence: 0.9 };
      });
      return call("appendSegments", { params: { sessionId }, body: { segments } });
    },
  };
}

async function expectConserved(b: Backend) {
  const t = await creditTotals(b.deps.db);
  expect(t.ledgerMismatches).toBe(0);
  expect(t.users + t.escrow).toBe(t.granted);
}

describe("a market that resolves early on proof", () => {
  let b: Backend;
  beforeAll(async () => {
    b = await startBackend();
  });
  afterAll(() => b.close());

  it("runs from prompt to payout to proof", async () => {
    const creator = b.as("creator@example.com");
    const alice = b.as("alice@example.com");
    const bob = b.as("bob@example.com");
    const market = await creator("createMarket", { body: yesNo() });
    const buy = trader(market);

    const a = await buy(alice, "Yes", 30);
    const bo = await buy(bob, "No", 40);
    await expectConserved(b);

    const band = listener(b);
    await band.start();

    // 1st batch: judged, nothing decisive.
    await band.hear("ok what are we getting to eat");
    expect((await creator("getMarket", { params: { marketId: market.id } })).status).toBe("open");

    // 2nd batch 5 s later: within 30 s of the last judging, so not judged yet.
    b.advance(5_000);
    await band.hear("the new place, their crust is fire no cap");
    expect((await creator("getMarket", { params: { marketId: market.id } })).status).toBe("open");

    // 3rd batch 30 s later: judged with the whole window as context, and "no cap" is in it.
    b.advance(30_000);
    await band.hear("bet let's go");
    const resolved = await creator("getMarket", { params: { marketId: market.id } });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution?.via).toBe("evidence");
    expect(resolved.resolution?.outcomeId).toBe(market.outcomes[0]?.id);
    expect(resolved.resolution?.payouts).toEqual([
      expect.objectContaining({ shares: 30, credits: 30 * SHARE_PAYOUT }),
    ]);

    // Money: Alice won 100 a share, Bob lost his stake, the creator got the escrow's remainder.
    expect((await alice("getMe")).balance).toBe(10_000 - a.trade.credits + 30 * SHARE_PAYOUT);
    expect((await bob("getMe")).balance).toBe(10_000 - bo.trade.credits);
    const subsidy = lmsr.maxSubsidy(market.liquidityB, 2);
    const creatorGets = subsidy + a.trade.credits + bo.trade.credits - 30 * SHARE_PAYOUT;
    expect((await creator("getMe")).balance).toBe(10_000 - subsidy + creatorGets);
    await expectConserved(b);
    expect((await creditTotals(b.deps.db)).escrow).toBe(0);

    // Proof: anyone can check the transcript chain and the quote.
    const proof = await bob("getProof", { params: { marketId: market.id } });
    expect(await verifyProof(proof)).toEqual({ ok: true });
    const decision = proof.market.resolution?.decision;
    const cited = proof.segments.find((s) => s.id === decision?.evidence[0]?.segmentId);
    expect(cited?.text).toContain("no cap");

    // Resolved markets stop trading.
    await expect(buy(alice, "Yes", 1)).rejects.toMatchObject({ code: "market_closed" });
  });
});

describe("a market that closes with nothing heard", () => {
  let b: Backend;
  beforeAll(async () => {
    b = await startBackend();
  });
  afterAll(() => b.close());

  it("pays the fallback outcome and still has a valid proof", async () => {
    const market = await b.as("creator@example.com")("createMarket", {
      body: yesNo({ question: "Will Sam say 'pineapple' tonight?" }),
    });
    const buy = trader(market);
    const yesBuy = await buy(b.as("alice@example.com"), "Yes", 10);
    await buy(b.as("bob@example.com"), "No", 25);

    const band = listener(b);
    await band.start();
    await band.hear("I hate fruit on pizza");
    expect(await closeDueMarkets(b.deps)).toBe(0); // not due yet

    b.advance(5 * 3600_000);
    expect(await closeDueMarkets(b.deps)).toBe(1);
    const m = await b.as("x@example.com")("getMarket", { params: { marketId: market.id } });
    expect(m.resolution).toMatchObject({ via: "fallback", outcomeId: market.fallbackOutcomeId });
    expect((await b.as("bob@example.com")("getMe")).balance).toBeGreaterThan(10_000);
    expect((await b.as("alice@example.com")("getMe")).balance).toBe(10_000 - yesBuy.trade.credits);

    expect(
      await verifyProof(await b.as("x@example.com")("getProof", { params: { marketId: market.id } })),
    ).toEqual({
      ok: true,
    });
    await expectConserved(b);
  });

  it("has no proof before it resolves", async () => {
    const m = await b.as("creator@example.com")("createMarket", {
      body: yesNo({ closesAt: "2026-11-20T00:00:00.000Z" }),
    });
    await expect(b.as("x@example.com")("getProof", { params: { marketId: m.id } })).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

describe("holding the judge to the transcript", () => {
  let b: Backend;
  const judge = scriptedJudge(({ market }) => ({
    verdict: market.outcomes[0]?.label ?? "",
    confidence: 1,
    rationale: "trust me",
    evidence: [{ segmentId: crypto.randomUUID(), quote: "no cap" }],
  }));
  beforeAll(async () => {
    b = await startBackend({ judge });
  });
  afterAll(() => b.close());

  it("ignores a verdict whose quote is not in the transcript", async () => {
    const market = await b.as("creator@example.com")("createMarket", { body: yesNo() });
    const band = listener(b);
    await band.start();
    await band.hear("nothing interesting");
    expect(judge.calls).toHaveLength(1);
    expect(judge.calls[0]?.mode).toBe("early");
    expect(judge.calls[0]?.transcript.map((l) => l.text)).toEqual(["nothing interesting"]);
    expect((await b.as("x@example.com")("getMarket", { params: { marketId: market.id } })).status).toBe(
      "open",
    );
  });

  it("only judges markets on the band that heard it", async () => {
    const before = judge.calls.length;
    b.advance(60_000);
    const other = listener(b, TEST_BAND + 1);
    await other.start();
    await other.hear("no cap");
    expect(judge.calls.length).toBe(before);
  });
});
