import { describe, expect, it } from "vitest";
import { createTurnTracker, toPcm16Base64 } from "../src/openai-stt";

describe("PCM16 encoding", () => {
  it("encodes little-endian 16-bit, clamped", () => {
    const b64 = toPcm16Base64(Float32Array.from([0, 1, -1, 2, 0.5]));
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const v = new DataView(bytes.buffer);
    expect([0, 1, 2, 3, 4].map((i) => v.getInt16(i * 2, true))).toEqual([0, 32767, -32768, 32767, 16383]);
  });
});

describe("turn tracker", () => {
  it("gives lines out in spoken order even when OpenAI completes them out of order", () => {
    const t = createTurnTracker();
    t.sent(1000, 2000);
    t.sent(3000, 4000);
    t.acknowledged("item_a");
    t.acknowledged("item_b");
    expect(t.delta("item_a", "hello ")).toBe("hello ");
    expect(t.completed("item_b", "second line")).toEqual([]); // held: the first is not done
    const ready = t.completed("item_a", "first line");
    expect(ready.map((r) => [r.text, r.startMs, r.endMs])).toEqual([
      ["first line", 1000, 2000],
      ["second line", 3000, 4000],
    ]);
    expect(t.waiting).toBe(0);
  });

  it("does not let a failed or empty line hold up the rest", () => {
    const t = createTurnTracker();
    t.sent(0, 1);
    t.sent(2, 3);
    t.acknowledged("a");
    t.acknowledged("b");
    t.completed("b", "kept");
    expect(t.failed("a").map((r) => r.text)).toEqual(["kept"]);
  });
});
