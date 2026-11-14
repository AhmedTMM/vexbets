// Property tests for the money bookkeeping: random multi-user trading sessions run through
// the contract's typed client against the dashboard's backend stand-in, compared with an
// independent model after every step. Then the market settles either way and payouts,
// balances, house risk and the proof are checked. Also covers the dashboard's own money
// maths (portfolio graph, dollar formatting).

import {
  ContractError,
  createClient,
  lmsr,
  type Market,
  SHARE_PAYOUT,
  type Trade,
  verifyProof,
} from "@vexbets/contract";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { credits } from "@/lib/format";
import { mockFetch } from "@/lib/mock/server";
import { valueSeries } from "@/lib/portfolio";

const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const START = 10_000;
const USERS = ["ana@x.io", "ben@x.io", "cy@x.io"];
const as = (email: string) =>
  createClient({ baseUrl: "", fetch: mockFetch, headers: () => ({ authorization: `Bearer ${email}` }) });

type Op = { kind: "buy" | "sell"; user: number; side: 0 | 1; n: number } | { kind: "retry"; user: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("buy" as const),
      user: fc.nat(2),
      side: fc.constantFrom(0 as const, 1 as const),
      n: fc.integer({ min: 1, max: 250 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("sell" as const),
      user: fc.nat(2),
      side: fc.constantFrom(0 as const, 1 as const),
      n: fc.integer({ min: 1, max: 250 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("retry" as const), user: fc.nat(2) }) },
);

afterEach(() => {
  vi.useRealTimers();
});

describe("money is conserved through any trading session", () => {
  it("balances, positions and prices match an independent model; settlement pays exactly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 25 }),
        fc.constantFrom(20, 100, 300),
        fc.boolean(),
        async (ops, b, yesWins) => {
          mem.clear();
          const clients = USERS.map(as);
          const ids: string[] = [];
          for (const c of clients) ids.push((await c("getMe")).id);
          const owner = clients[0] as ReturnType<typeof as>;
          const m = await owner("createMarket", {
            body: {
              question: 'Will Ahmed say "no cap"?',
              tagline: "t",
              criteria: 'Ahmed says "no cap".',
              outcomes: [{ label: "Yes" }, { label: "No" }],
              fallbackOutcomeIndex: 1,
              bandNumber: 41,
              subjectName: "Ahmed",
              closesAt: new Date(Date.now() + 10 * 60_000).toISOString(),
              liquidityB: b,
            },
          });
          const outcome = (s: 0 | 1) => m.outcomes[s]?.id as string;
          const params = { marketId: m.id };

          // The model.
          const bal = USERS.map(() => START);
          const held = USERS.map(() => [0, 0]);
          const basis = USERS.map(() => [0, 0]);
          let q = [0, 0];
          let collected = 0;
          const last: (null | { body: Parameters<typeof owner<"trade">>[1] & object; tradeId: string })[] =
            USERS.map(() => null);

          for (const op of ops) {
            const c = clients[op.user] as ReturnType<typeof as>;
            if (op.kind === "retry") {
              const prev = last[op.user];
              if (!prev) continue;
              const r = await c("trade", prev.body as never);
              expect(r.trade.id).toBe(prev.tradeId); // same key -> same trade
              expect(r.balance).toBe(bal[op.user]); // and no second charge
              continue;
            }
            const { side: s, kind } = op;
            const n = kind === "sell" ? Math.min(op.n, held[op.user]?.[s] ?? 0) : op.n;
            if (n < 1) {
              // Selling shares you don't hold is refused.
              await expect(
                c("trade", {
                  params,
                  body: {
                    outcomeId: outcome(s),
                    side: "sell",
                    shares: op.n,
                    limitCredits: 0,
                    idempotencyKey: crypto.randomUUID(),
                  },
                }),
              ).rejects.toMatchObject({ code: "insufficient_shares" });
              continue;
            }
            const expected = lmsr.quoteTrade(q, b, s, kind, n);
            const quote = await c("quote", {
              params,
              body: { outcomeId: outcome(s), side: kind, shares: n },
            });
            expect(quote.credits).toBe(expected.credits); // backend prices with the shared math
            const body = {
              outcomeId: outcome(s),
              side: kind,
              shares: n,
              limitCredits: quote.credits,
              idempotencyKey: crypto.randomUUID(),
            };
            if (kind === "buy" && expected.credits > (bal[op.user] ?? 0)) {
              await expect(c("trade", { params, body })).rejects.toMatchObject({
                code: "insufficient_balance",
              });
              continue; // and nothing changed (checked below)
            }
            const r = await c("trade", { params, body });
            last[op.user] = { body: { params, body }, tradeId: r.trade.id };
            const delta = kind === "buy" ? -expected.credits : expected.credits;
            (bal as number[])[op.user] = (bal[op.user] ?? 0) + delta;
            (held[op.user] as number[])[s] = (held[op.user]?.[s] ?? 0) + (kind === "buy" ? n : -n);
            (basis[op.user] as number[])[s] = (basis[op.user]?.[s] ?? 0) - delta;
            collected -= delta;
            q = expected.after;
            expect(r.balance).toBe(bal[op.user]);
            expect(r.balance).toBeGreaterThanOrEqual(0);
          }

          // State matches the model.
          for (const [u, c] of clients.entries()) {
            expect((await c("getMe")).balance).toBe(bal[u]);
            const { positions } = await c("listPositions");
            for (const s of [0, 1] as const) {
              const p = positions.find((x) => x.outcomeId === outcome(s));
              expect(p?.shares ?? 0).toBe(held[u]?.[s]);
              expect(p?.costBasis ?? 0).toBe(basis[u]?.[s]);
            }
          }
          const live = await owner("getMarket", { params });
          expect(live.outcomes.map((o) => o.shares)).toEqual(q);
          expect(live.volumeCredits).toBeGreaterThanOrEqual(0);
          // Conservation: what players lost is exactly what the house collected.
          const totalBal = bal.reduce((a, x) => a + x, 0);
          expect(START * USERS.length - totalBal).toBe(collected);

          // Settle: YES by the band hearing it, NO by the clock running out.
          if (yesWins) {
            const session = await owner("startSession", {
              body: { bandNumber: 41, subjectName: "Ahmed", consentConfirmed: true },
            });
            const t = Date.now();
            await owner("appendSegments", {
              params: { sessionId: session.id },
              body: {
                segments: [
                  { seq: 0, startMs: t, endMs: t + 500, text: "honestly, no cap.", confidence: 0.9 },
                ],
              },
            });
          } else {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(Date.now() + 11 * 60_000);
          }
          const done = await owner("getMarket", { params });
          expect(done.status).toBe("resolved");
          const w = yesWins ? 0 : 1;
          expect(done.resolution?.outcomeId).toBe(outcome(w));

          let paid = 0;
          for (const [u, c] of clients.entries()) {
            const expectedPayout = (held[u]?.[w] ?? 0) * SHARE_PAYOUT;
            const got = done.resolution?.payouts.find((p) => p.userId === ids[u])?.credits ?? 0;
            expect(got).toBe(expectedPayout);
            expect((await c("getMe")).balance).toBe((bal[u] ?? 0) + expectedPayout);
            paid += got;
          }
          expect(paid).toBe((q[w] ?? 0) * SHARE_PAYOUT); // every winning share paid exactly $1
          expect(paid - collected).toBeLessThanOrEqual(lmsr.maxSubsidy(b, 2)); // house risk bounded

          if (yesWins) {
            const proof = await owner("getProof", { params });
            expect(await verifyProof(proof)).toEqual({ ok: true });
          }

          // Trading after settlement is refused.
          await expect(
            owner("quote", { params, body: { outcomeId: outcome(0), side: "buy", shares: 1 } }),
          ).rejects.toBeInstanceOf(ContractError);
        },
      ),
      { numRuns: 400 },
    );
  }, 300_000);
});

describe("dashboard money maths", () => {
  it("dollars: credits(n) is exactly n¢ written as $x.yz", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), (n) => {
        const s = credits(n);
        const back = Math.round(Number(s.replace(/[$,]/g, "")) * 100);
        expect(back).toBe(n);
        expect(s).toMatch(/^-?\$\d{1,3}(,\d{3})*\.\d{2}$|^\$-\d{1,3}(,\d{3})*\.\d{2}$/);
      }),
      { numRuns: 3000 },
    );
  });

  it("portfolio graph starts at the starting balance and ends at today's total", () => {
    // Random fills across markets, some settled with payouts.
    const fill = fc.record({
      market: fc.nat(3),
      buy: fc.boolean(),
      credits: fc.integer({ min: 1, max: 5_000 }),
      at: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(
        fc.array(fill, { minLength: 1, maxLength: 30 }),
        fc.array(fc.option(fc.integer({ min: 0, max: 20_000 })), { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 0, max: 50_000 }),
        (fills, payouts, openValue) => {
          const t0 = Date.UTC(2026, 10, 14, 12);
          const lastFill = Math.max(...fills.map((f) => f.at));
          const trades = fills.map(
            (f, i) =>
              ({
                id: `t${i}`,
                marketId: `m${f.market}`,
                user: { id: "me", handle: "me", displayName: "me" },
                outcomeId: "o",
                side: f.buy ? "buy" : "sell",
                shares: 1,
                credits: f.credits,
                priceAfterBps: [5000, 5000],
                createdAt: new Date(t0 + f.at).toISOString(),
              }) as Trade,
          );
          const markets = payouts.map(
            (p, i) =>
              ({
                id: `m${i}`,
                status: p === null ? "open" : "resolved",
                resolution:
                  p === null
                    ? null
                    : {
                        payouts: [{ userId: "me", shares: 0, credits: p }],
                        resolvedAt: new Date(t0 + lastFill + 1000 + i).toISOString(),
                      },
              }) as unknown as Market,
          );
          const traded = new Set(trades.map((t) => t.marketId));
          const net = trades.reduce((a, t) => a + (t.side === "buy" ? -t.credits : t.credits), 0);
          const paidOut = payouts.reduce<number>(
            (a, p, i) => a + (p !== null && traded.has(`m${i}`) ? p : 0),
            0,
          );
          const cash = START + net + paidOut;
          const pts = valueSeries(trades, markets, "me", cash, cash + openValue, t0 + 2_000_000);
          expect(pts[0]?.v).toBe(START);
          expect(pts.at(-1)?.v).toBe(cash + openValue);
          expect(pts.every((p, i) => i === 0 || p.t >= (pts[i - 1]?.t ?? 0))).toBe(true);
        },
      ),
      { numRuns: 3000 },
    );
  });
});
