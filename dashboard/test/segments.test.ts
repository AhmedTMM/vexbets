import type { Client } from "@vexbets/contract";
import { describe, expect, it } from "vitest";
import { SegmentQueue } from "@/lib/segments";

type Batch = { seq: number; text: string }[];

function fakeClient(failTimes = 0) {
  const batches: Batch[] = [];
  let fails = failTimes;
  const call = (async (_name: string, args: { body: { segments: Batch } }) => {
    if (fails > 0) {
      fails -= 1;
      throw new Error("offline");
    }
    batches.push(args.body.segments.map((s) => ({ seq: s.seq, text: s.text })));
    return { accepted: args.body.segments.length, segmentCount: 0, headHash: "0".repeat(64) };
  }) as unknown as Client;
  return { call, batches };
}

describe("SegmentQueue", () => {
  it("numbers segments 0, 1, 2 and skips empty lines", async () => {
    const { call, batches } = fakeClient();
    const q = new SegmentQueue(call, "s1");
    q.push("one", 1, 2);
    q.push("   ", 3, 4);
    q.push("two", 5, 6);
    await q.flush();
    expect(batches.flat()).toEqual([
      { seq: 0, text: "one" },
      { seq: 1, text: "two" },
    ]);
    expect(q.sent).toBe(2);
  });

  it("keeps failed segments and resends them in order", async () => {
    const { call, batches } = fakeClient(1);
    const q = new SegmentQueue(call, "s1");
    q.push("one", 1, 2);
    await q.flush();
    expect(q.lastError).toBe("offline");
    q.push("two", 3, 4);
    await q.flush();
    expect(batches.flat().map((s) => s.seq)).toEqual([0, 1]);
    expect(q.waiting).toBe(0);
    expect(q.lastError).toBeNull();
  });
});
