import { describe, expect, it } from "vitest";
import { buildPath, ContractError, createClient } from "../src";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("client", () => {
  it("builds paths and refuses a missing param", () => {
    expect(buildPath("/api/v1/markets/:marketId/trades", { marketId: "a b" })).toBe(
      "/api/v1/markets/a%20b/trades",
    );
    expect(() => buildPath("/api/v1/markets/:marketId", {})).toThrow();
  });

  it("sends a validated body and parses the response", async () => {
    const session = {
      id: crypto.randomUUID(),
      bandNumber: 7,
      subjectName: "Sam",
      startedAt: "2026-11-14T20:00:00Z",
      endedAt: null,
      segmentCount: 0,
      headHash: "0".repeat(64),
    };
    const { f, calls } = fakeFetch(200, session);
    const call = createClient({
      baseUrl: "https://api.test/",
      fetch: f,
      headers: () => ({ authorization: "Bearer x" }),
    });
    const out = await call("startSession", {
      body: { bandNumber: 7, subjectName: "Sam", consentConfirmed: true },
    });
    expect(out.id).toBe(session.id);
    expect(calls[0]?.url).toBe("https://api.test/api/v1/ingest/sessions");
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.authorization).toBe("Bearer x");
  });

  it("adds query strings", async () => {
    const { f, calls } = fakeFetch(200, { markets: [], nextCursor: null });
    const call = createClient({ baseUrl: "", fetch: f });
    await call("listMarkets", { query: { status: "open", limit: 5 } });
    await call("listMarkets");
    expect(calls[0]?.url).toBe("/api/v1/markets?limit=5&status=open");
    expect(calls[1]?.url).toBe("/api/v1/markets");
  });

  it("refuses an invalid request before sending it", async () => {
    const { f, calls } = fakeFetch(200, {});
    const call = createClient({ baseUrl: "", fetch: f });
    await expect(
      // @ts-expect-error consentConfirmed must be true
      call("startSession", { body: { bandNumber: 7, subjectName: "Sam", consentConfirmed: false } }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("turns error bodies into ContractError", async () => {
    const { f } = fakeFetch(409, { error: { code: "price_moved", message: "price moved" } });
    const call = createClient({ baseUrl: "", fetch: f });
    const p = call("trade", {
      params: { marketId: crypto.randomUUID() },
      body: {
        outcomeId: crypto.randomUUID(),
        side: "buy",
        shares: 1,
        limitCredits: 60,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    await expect(p).rejects.toBeInstanceOf(ContractError);
    await expect(p).rejects.toMatchObject({ code: "price_moved", status: 409 });
  });
});

it("type-checks path params", () => {
  const call = createClient({ baseUrl: "", fetch: fakeFetch(200, {}).f });
  // @ts-expect-error getMarket needs params.marketId
  void call("getMarket").catch(() => {});
});
