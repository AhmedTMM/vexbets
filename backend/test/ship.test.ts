import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deepgramTokens } from "../src/stt/deepgram";
import { TEST_BAND, yesNo } from "./fixtures";
import { type Backend, startBackend } from "./harness";

let b: Backend;
beforeAll(async () => {
  b = await startBackend();
});
afterAll(() => b.close());

describe("closing on time", () => {
  it("closes and resolves a due market on the next request, without a cron", async () => {
    const call = b.as("creator@example.com");
    const m = await call("createMarket", { body: yesNo({ closesAt: "2026-11-14T21:00:00.000Z" }) });
    b.advance(2 * 3600_000);
    const after = await call("getMarket", { params: { marketId: m.id } });
    expect(after.status).toBe("resolved");
    expect(after.resolution?.via).toBe("fallback");
  });
});

describe("speech-to-text token", () => {
  it("hands a live session a short-lived token", async () => {
    const call = b.as("listener@example.com");
    const s = await call("startSession", {
      body: { bandNumber: TEST_BAND, subjectName: "Sam", consentConfirmed: true },
    });
    expect(await call("sttToken", { body: { sessionId: s.id } })).toMatchObject({
      provider: "fake",
      token: "fake-stt-token",
    });
    await call("endSession", { params: { sessionId: s.id } });
    await expect(call("sttToken", { body: { sessionId: s.id } })).rejects.toMatchObject({ code: "conflict" });
  });

  it("asks Deepgram for a grant with the server's key", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Response.json({ access_token: "short", expires_in: 300 });
    }) as unknown as typeof fetch;
    const t = await deepgramTokens("server-key", 300, fake).mint();
    expect(t.token).toBe("short");
    expect(seen[0]?.url).toBe("https://api.deepgram.com/v1/auth/grant");
    expect((seen[0]?.init.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Token server-key",
    );
  });
});
