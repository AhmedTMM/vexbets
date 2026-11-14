import { describe, expect, it } from "vitest";
import { createClient, createListener, type SttEngine } from "../src";

describe("listener", () => {
  it("sends whole-ms times and clamped confidence whatever the STT engine gives", async () => {
    const bodies: { segments: { startMs: number; endMs: number; confidence: number }[] }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
      const session = {
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        bandNumber: 41,
        subjectName: "Wearer",
        startedAt: "2026-11-14T20:00:00.000Z",
        endedAt: null,
        segmentCount: 0,
        headHash: "0".repeat(64),
      };
      if (path.endsWith("/ingest/sessions")) return json(session);
      if (path.endsWith("/stt-token"))
        return json({ provider: "x", token: "t", expiresAt: "2026-11-14T21:00:00Z" });
      if (path.endsWith("/segments")) {
        bodies.push(JSON.parse(String(init.body)));
        return json({ accepted: 1, segmentCount: 1, headHash: "a".repeat(64) });
      }
      return json({ ...session, endedAt: "2026-11-14T20:01:00.000Z" });
    }) as unknown as typeof fetch;

    const engine: SttEngine = {
      async start(onFinal) {
        onFinal({
          text: "no cap",
          startMs: 1763150425123.333,
          endMs: 1763150426001.7,
          confidence: 1.2,
          speaker: null,
        });
      },
      async stop() {},
    };
    const listener = createListener({
      client: createClient({ baseUrl: "http://x", fetch: fetchImpl }),
      bandNumber: 41,
      subjectName: "Wearer",
      stt: () => engine,
      batchMs: 60_000,
    });
    await listener.start();
    await listener.stop();
    expect(bodies[0]?.segments[0]).toMatchObject({
      startMs: 1763150425123,
      endMs: 1763150426002,
      confidence: 1,
    });
  });

  it("sends each final line at once, without waiting for the batch interval", async () => {
    const sentAt: number[] = [];
    const t0 = Date.now();
    const fetchImpl = (async (url: string) => {
      const path = new URL(url).pathname;
      const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
      const session = {
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        bandNumber: 41,
        subjectName: "Wearer",
        startedAt: "2026-11-14T20:00:00.000Z",
        endedAt: null,
        segmentCount: 0,
        headHash: "0".repeat(64),
      };
      if (path.endsWith("/ingest/sessions")) return json(session);
      if (path.endsWith("/stt-token"))
        return json({ provider: "x", token: "t", expiresAt: "2026-11-14T21:00:00Z" });
      if (path.endsWith("/segments")) {
        sentAt.push(Date.now() - t0);
        return json({ accepted: 1, segmentCount: sentAt.length, headHash: "a".repeat(64) });
      }
      return json({ ...session, endedAt: "2026-11-14T20:01:00.000Z" });
    }) as unknown as typeof fetch;
    let hear: (text: string) => void = () => {};
    const listener = createListener({
      client: createClient({ baseUrl: "http://x", fetch: fetchImpl }),
      bandNumber: 41,
      subjectName: "Wearer",
      batchMs: 60_000,
      stt: () => ({
        async start(onFinal) {
          hear = (text) =>
            onFinal({ text, startMs: Date.now(), endMs: Date.now(), confidence: 0.9, speaker: null });
        },
        async stop() {},
      }),
    });
    await listener.start();
    hear("I miss my ex");
    await new Promise((r) => setTimeout(r, 100));
    expect(sentAt).toHaveLength(1);
    expect(sentAt[0]).toBeLessThan(1_000);
    await listener.stop();
  });
});
