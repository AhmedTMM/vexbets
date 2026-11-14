import type { JudgeOutput } from "@vexbets/contract";
import { afterEach, describe, expect, it } from "vitest";
import type { JudgeInput } from "../src/judge/types";
import { TEST_BAND, yesNo } from "./fixtures";
import { type Backend, startBackend } from "./harness";

/**
 * Regression, first real-band session (2026-11-14): "I miss my ex" was only caught "three
 * turns" later. Lines arriving within 30 s of a judging were skipped, not queued.
 */

let b: Backend;
afterEach(() => b?.close());

const heardNoCap = (input: JudgeInput): JudgeOutput => {
  const line = input.transcript.find((l) => l.text.includes("no cap"));
  return line
    ? {
        verdict: "Yes",
        confidence: 1,
        rationale: "said it",
        evidence: [{ segmentId: line.segmentId, quote: "no cap" }],
      }
    : { verdict: "UNDETERMINED", confidence: 0.5, rationale: "not yet", evidence: [] };
};

function listener(backend: Backend) {
  const call = backend.as("listener@example.com");
  let sessionId = "";
  let seq = 0;
  return {
    async start() {
      sessionId = (
        await call("startSession", {
          body: { bandNumber: TEST_BAND, subjectName: "Sam", consentConfirmed: true },
        })
      ).id;
    },
    hear(text: string) {
      const startMs = backend.now().getTime() + seq * 10;
      return call("appendSegments", {
        params: { sessionId },
        body: { segments: [{ seq: seq++, startMs, endMs: startMs + 5, text, confidence: 0.9 }] },
      });
    },
  };
}

describe("judging every line", () => {
  it("judges a line that arrives one second after the previous judging", async () => {
    const calls: JudgeInput[] = [];
    b = await startBackend({
      judge: {
        model: "test",
        async judge(input) {
          calls.push(input);
          return heardNoCap(input);
        },
      },
    });
    const m = await b.as("c@example.com")("createMarket", { body: yesNo() });
    const band = listener(b);
    await band.start();
    await band.hear("okay I am pretty sad");
    b.advance(1_000);
    await band.hear("their crust is fire no cap");
    expect(calls).toHaveLength(2);
    expect((await b.as("x@example.com")("getMarket", { params: { marketId: m.id } })).status).toBe(
      "resolved",
    );
  });

  it("queues a line that arrives while the judge is busy, never judging one market twice at once", async () => {
    let running = 0;
    let maxRunning = 0;
    const seen: string[][] = [];
    b = await startBackend({
      judge: {
        model: "slow-test",
        async judge(input) {
          running++;
          maxRunning = Math.max(maxRunning, running);
          seen.push(input.transcript.map((l) => l.text));
          await new Promise((r) => setTimeout(r, 150)); // a slow model call
          running--;
          return heardNoCap(input);
        },
      },
    });
    const m = await b.as("c@example.com")("createMarket", { body: yesNo() });
    const band = listener(b);
    await band.start();
    // Two lines in flight together: the second lands while the first is being judged.
    const first = band.hear("so anyway");
    await new Promise((r) => setTimeout(r, 30));
    const second = band.hear("that was fire no cap");
    await Promise.all([first, second]);

    expect(maxRunning).toBe(1);
    expect(seen.at(-1)).toContain("that was fire no cap"); // the queued re-run saw the new line
    expect((await b.as("x@example.com")("getMarket", { params: { marketId: m.id } })).status).toBe(
      "resolved",
    );
  });
});
