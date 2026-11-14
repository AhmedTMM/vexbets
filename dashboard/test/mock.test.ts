import { createClient, verifyProof } from "@vexbets/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, quotedPhrases } from "@/lib/mock/server";

// The mock keeps its data in localStorage; give Node a simple one.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const as = (email: string) =>
  createClient({ baseUrl: "", fetch: mockFetch, headers: () => ({ authorization: `Bearer ${email}` }) });

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function newMarket(minutes = 10) {
  return as("sam@x.io")("createMarket", {
    body: {
      question: "Will Haris mention his ex?",
      tagline: "He always does",
      criteria: "Haris talks about his ex, for example says 'my ex'.",
      outcomes: [{ label: "Yes" }, { label: "No" }],
      fallbackOutcomeIndex: 1,
      bandNumber: 17,
      subjectName: "Haris",
      closesAt: inMinutes(minutes),
    },
  });
}

describe("mock backend speaks the contract", () => {
  beforeEach(() => mem.clear());

  it("rejects calls without an email", async () => {
    const anon = createClient({ baseUrl: "", fetch: mockFetch });
    await expect(anon("getMe")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("gives new users 10,000 credits", async () => {
    expect((await as("sam@x.io")("getMe")).balance).toBe(10_000);
  });

  it("quotes and trades with a slippage limit and idempotency", async () => {
    const m = await newMarket();
    const yes = m.outcomes[0]?.id as string;
    const c = as("judge@x.io");
    const q = await c("quote", {
      params: { marketId: m.id },
      body: { outcomeId: yes, side: "buy", shares: 10 },
    });
    expect(q.priceBeforeBps).toEqual([5000, 5000]);

    const key = crypto.randomUUID();
    const body = {
      outcomeId: yes,
      side: "buy" as const,
      shares: 10,
      limitCredits: q.credits,
      idempotencyKey: key,
    };
    const t1 = await c("trade", { params: { marketId: m.id }, body });
    const t2 = await c("trade", { params: { marketId: m.id }, body });
    expect(t2.trade.id).toBe(t1.trade.id);
    expect(t1.balance).toBe(10_000 - q.credits);

    await expect(
      c("trade", {
        params: { marketId: m.id },
        body: { ...body, limitCredits: 1, idempotencyKey: crypto.randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "price_moved" });
  });

  it("settles from the transcript, pays out, and the proof verifies", async () => {
    const m = await newMarket();
    const yes = m.outcomes[0]?.id as string;
    const judge = as("judge@x.io");
    const q = await judge("quote", {
      params: { marketId: m.id },
      body: { outcomeId: yes, side: "buy", shares: 20 },
    });
    await judge("trade", {
      params: { marketId: m.id },
      body: {
        outcomeId: yes,
        side: "buy",
        shares: 20,
        limitCredits: q.credits,
        idempotencyKey: crypto.randomUUID(),
      },
    });

    const listener = as("listener@x.io");
    const session = await listener("startSession", {
      body: { bandNumber: 17, subjectName: "Haris", consentConfirmed: true },
    });
    const t = Date.now();
    const segs = [
      { seq: 0, startMs: t, endMs: t + 900, text: "So I went to Tahoe.", confidence: 0.9 },
      { seq: 1, startMs: t + 1000, endMs: t + 2000, text: "Funny thing, my ex was there.", confidence: 0.9 },
    ];
    await listener("appendSegments", { params: { sessionId: session.id }, body: { segments: segs } });
    // A retried batch is accepted as a no-op.
    const again = await listener("appendSegments", {
      params: { sessionId: session.id },
      body: { segments: segs },
    });
    expect(again.accepted).toBe(0);

    const resolved = await judge("getMarket", { params: { marketId: m.id } });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution?.outcomeId).toBe(yes);
    expect(resolved.resolution?.payouts[0]?.credits).toBe(2_000);
    expect((await judge("getMe")).balance).toBe(10_000 - q.credits + 2_000);

    const proof = await judge("getProof", { params: { marketId: m.id } });
    expect(await verifyProof(proof)).toEqual({ ok: true });
  });

  it("finds quoted phrases but not apostrophes", () => {
    expect(quotedPhrases(`says 'my ex' or "no cap" or “bet”`)).toEqual(["my ex", "no cap", "bet"]);
    expect(quotedPhrases("Haris's ex isn't here")).toEqual([]);
  });
});
