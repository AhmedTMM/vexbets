import {
  type Client,
  createClient,
  createListener,
  type ListenerEvent,
  type Market,
  SHARE_PAYOUT,
  scriptedStt,
  verifyProof,
} from "@vexbets/contract";
import { describe, expect, inject, it } from "vitest";

/**
 * Mock end-to-end: the real server over real HTTP, with fake STT standing in for the band.
 * Run: npm run e2e -w backend   (or E2E_BASE_URL=https://... to test a deployment)
 */

const baseUrl = inject("baseUrl");
const cronSecret = inject("cronSecret");
const run = crypto.randomUUID().slice(0, 8); // fresh users per run, so a shared DB is fine

/**
 * Band number for the mock only: no band is involved, and no physical band is expected to
 * use 999. Override with E2E_BAND.
 */
const MOCK_BAND = Number(process.env.E2E_BAND ?? 999);

const as = (name: string): Client =>
  createClient({ baseUrl, headers: () => ({ authorization: `Bearer ${name}-${run}@e2e.test` }) });

async function until<T>(what: string, fn: () => Promise<T | undefined>, timeoutMs = 45_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function buy(call: Client, m: Market, label: string, shares: number) {
  const outcome = m.outcomes.find((o) => o.label === label);
  if (!outcome) throw new Error(`no outcome ${label}`);
  return call("trade", {
    params: { marketId: m.id },
    body: {
      outcomeId: outcome.id,
      side: "buy",
      shares,
      limitCredits: 10_000,
      idempotencyKey: crypto.randomUUID(),
    },
  });
}

describe("mock e2e over HTTP", () => {
  it("prompt -> trades -> fake STT listener -> judge -> payouts -> proofs", async () => {
    const creator = as("creator");
    const alice = as("alice");
    const bob = as("bob");
    const carol = as("carol");
    const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

    // Two markets on the same (mock) band: one will be proven early, one never happens.
    const noCap = await creator("createMarket", {
      body: {
        question: "Will Sam say 'no cap' tonight?",
        tagline: "Sam vs. his favourite phrase",
        criteria: "Anyone near the band says the words 'no cap'.",
        outcomes: [{ label: "Yes" }, { label: "No" }],
        fallbackOutcomeIndex: 1,
        bandNumber: MOCK_BAND,
        subjectName: "Sam",
        closesAt: inSeconds(600),
      },
    });
    const pineapple = await creator("createMarket", {
      body: {
        question: "Will Sam say 'pineapple' in the next few seconds?",
        tagline: "Fruit watch",
        criteria: "Anyone near the band says the word 'pineapple'.",
        outcomes: [{ label: "Yes" }, { label: "No" }],
        fallbackOutcomeIndex: 1,
        bandNumber: MOCK_BAND,
        subjectName: "Sam",
        closesAt: inSeconds(20),
      },
    });

    const a = await buy(alice, noCap, "Yes", 30);
    const b1 = await buy(bob, noCap, "No", 40);
    const b2 = await buy(bob, pineapple, "No", 15);
    const c = await buy(carol, pineapple, "Yes", 10);

    // The listener, exactly as the listen page will run it, with fake STT.
    const events: ListenerEvent[] = [];
    const listener = createListener({
      client: as("listener"),
      bandNumber: MOCK_BAND,
      subjectName: "Sam",
      batchMs: 1000,
      onEvent: (e) => events.push(e),
      stt: (token) => {
        expect(token.provider).toBe("fake");
        return scriptedStt([
          { text: "ok what are we getting to eat", speaker: "0", afterMs: 1500 },
          { text: "I could go for pizza honestly", speaker: "1", afterMs: 400 },
          { text: "the new place, their crust is fire no cap", speaker: "1", afterMs: 1500 },
          { text: "bet let's go", speaker: "0", afterMs: 1500 },
        ]);
      },
    });
    await listener.start();

    // 1. "no cap" is heard: the market resolves early, with proof.
    const resolved = await until("no-cap market to resolve", async () => {
      const m = await creator("getMarket", { params: { marketId: noCap.id } });
      return m.status === "resolved" ? m : undefined;
    });
    expect(resolved.resolution?.via).toBe("evidence");
    expect(resolved.resolution?.outcomeId).toBe(noCap.outcomes[0]?.id);
    const proof = await bob("getProof", { params: { marketId: noCap.id } });
    expect(await verifyProof(proof)).toEqual({ ok: true });
    const quoted = proof.segments.find(
      (s) => s.id === proof.market.resolution?.decision.evidence[0]?.segmentId,
    );
    expect(quoted?.text).toContain("no cap");

    await until("all scripted lines heard", async () =>
      events.filter((e) => e.type === "heard").length === 4 ? true : undefined,
    );
    await listener.stop();
    expect(events.some((e) => e.type === "sent")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "stopped", segmentCount: 4 });

    // 2. "pineapple" is never said: after closesAt, any request closes it, and No wins.
    const fallback = await until("pineapple market to close and resolve", async () => {
      const m = await carol("getMarket", { params: { marketId: pineapple.id } });
      return m.status === "resolved" ? m : undefined;
    });
    expect(fallback.resolution).toMatchObject({ via: "fallback", outcomeId: pineapple.fallbackOutcomeId });
    expect(await verifyProof(await carol("getProof", { params: { marketId: pineapple.id } }))).toEqual({
      ok: true,
    });

    // 3. Money: winners got 100 a share, losers kept nothing.
    expect((await alice("getMe")).balance).toBe(10_000 - a.trade.credits + 30 * SHARE_PAYOUT);
    expect((await bob("getMe")).balance).toBe(
      10_000 - b1.trade.credits - b2.trade.credits + 15 * SHARE_PAYOUT,
    );
    expect((await carol("getMe")).balance).toBe(10_000 - c.trade.credits);
    await expect(buy(alice, noCap, "Yes", 1)).rejects.toMatchObject({ code: "market_closed" });
  });

  it("protects the cron backstop with CRON_SECRET", async () => {
    expect((await fetch(`${baseUrl}/api/cron/tick`)).status).toBe(401);
    const ok = await fetch(`${baseUrl}/api/cron/tick`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(ok.status).toBe(200);
  });
});
