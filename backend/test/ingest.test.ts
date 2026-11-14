import { GENESIS_HASH, hashSegment } from "@vexbets/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { segments } from "../src/db/schema";
import { TEST_BAND } from "./fixtures";
import { type Backend, startBackend } from "./harness";

let b: Backend;
beforeAll(async () => {
  b = await startBackend();
});
afterAll(() => b.close());

const seg = (seq: number, text: string) => ({
  seq,
  startMs: 1_000_000 + seq * 3000,
  endMs: 1_000_000 + seq * 3000 + 2500,
  text,
  confidence: 0.9,
});

async function start() {
  return b.as("listener@example.com")("startSession", {
    body: { bandNumber: TEST_BAND, subjectName: "Sam", consentConfirmed: true },
  });
}

describe("ingest", () => {
  it("starts a session at the genesis hash", async () => {
    const s = await start();
    expect(s).toMatchObject({
      bandNumber: TEST_BAND,
      segmentCount: 0,
      headHash: GENESIS_HASH,
      endedAt: null,
    });
  });

  it("chains segment hashes exactly as the contract computes them", async () => {
    const call = b.as("listener@example.com");
    const s = await start();
    const r1 = await call("appendSegments", {
      params: { sessionId: s.id },
      body: { segments: [seg(0, "hello"), seg(1, "no cap")] },
    });
    const r2 = await call("appendSegments", {
      params: { sessionId: s.id },
      body: { segments: [seg(2, "bye")] },
    });
    expect(r1).toMatchObject({ accepted: 2, segmentCount: 2 });
    expect(r2).toMatchObject({ accepted: 1, segmentCount: 3 });

    const rows = await b.deps.db
      .select()
      .from(segments)
      .where(eq(segments.sessionId, s.id))
      .orderBy(segments.seq);
    let prev = GENESIS_HASH;
    for (const row of rows) {
      expect(row.prevHash).toBe(prev);
      expect(row.hash).toBe(await hashSegment(row, prev));
      prev = row.hash;
    }
    expect(r2.headHash).toBe(prev);
  });

  it("accepts a retried batch once, and refuses gaps and rewrites", async () => {
    const call = b.as("listener@example.com");
    const s = await start();
    const batch = { params: { sessionId: s.id }, body: { segments: [seg(0, "a"), seg(1, "b")] } };
    await call("appendSegments", batch);
    expect(await call("appendSegments", batch)).toMatchObject({ accepted: 0, segmentCount: 2 });

    await expect(
      call("appendSegments", { params: { sessionId: s.id }, body: { segments: [seg(5, "gap")] } }),
    ).rejects.toMatchObject({ code: "segment_out_of_order", details: { expected: 2 } });
    await expect(
      call("appendSegments", { params: { sessionId: s.id }, body: { segments: [seg(1, "rewritten")] } }),
    ).rejects.toMatchObject({ code: "segment_out_of_order" });
  });

  it("refuses segments after the session ends", async () => {
    const call = b.as("listener@example.com");
    const s = await start();
    const ended = await call("endSession", { params: { sessionId: s.id } });
    expect(ended.endedAt).not.toBeNull();
    await expect(
      call("appendSegments", { params: { sessionId: s.id }, body: { segments: [seg(0, "late")] } }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses to listen without consent", async () => {
    await expect(
      b.as("listener@example.com")("startSession", {
        // @ts-expect-error consent must be true
        body: { bandNumber: TEST_BAND, subjectName: "Sam", consentConfirmed: false },
      }),
    ).rejects.toThrow();
  });
});
