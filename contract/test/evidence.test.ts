import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  hashSegment,
  type Market,
  type ProofBundle,
  type TranscriptSegment,
  verifyProof,
} from "../src";

const sessionId = crypto.randomUUID();
const marketId = crypto.randomUUID();
const yes = crypto.randomUUID();
const no = crypto.randomUUID();
const t0 = Date.parse("2026-11-14T20:00:00Z");

async function chain(texts: string[]): Promise<TranscriptSegment[]> {
  const out: TranscriptSegment[] = [];
  let prev = GENESIS_HASH;
  for (const [seq, text] of texts.entries()) {
    const seg = {
      sessionId,
      seq,
      startMs: t0 + seq * 5000,
      endMs: t0 + seq * 5000 + 4000,
      text,
      speaker: null,
    };
    const hash = await hashSegment(seg, prev);
    out.push({ ...seg, id: crypto.randomUUID(), confidence: 0.95, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

async function bundle(): Promise<ProofBundle> {
  const segments = await chain(["what are we eating", "that pizza was fire no cap", "ok bye"]);
  const cited = segments[1] as TranscriptSegment;
  const market: Market = {
    id: marketId,
    creator: { id: crypto.randomUUID(), handle: "ahmed", displayName: "Ahmed" },
    question: "Will Sam say 'no cap'?",
    tagline: "t",
    criteria: "Sam says 'no cap'",
    outcomes: [
      { id: yes, label: "Yes", criteria: null, shares: 10, priceBps: 9000 },
      { id: no, label: "No", criteria: null, shares: 0, priceBps: 1000 },
    ],
    fallbackOutcomeId: no,
    resolveEarly: true,
    bandNumber: 7,
    subjectName: "Sam",
    opensAt: "2026-11-14T19:00:00Z",
    closesAt: "2026-11-15T00:00:00Z",
    liquidityB: 100,
    status: "resolved",
    volumeCredits: 600,
    createdAt: "2026-11-14T19:00:00Z",
    resolution: {
      marketId,
      outcomeId: yes,
      via: "evidence",
      decision: {
        status: "decided",
        marketId,
        outcomeId: yes,
        model: "gemini",
        confidence: 0.97,
        rationale: "Sam said it.",
        headHash: cited.hash,
        decidedAt: "2026-11-14T20:00:10Z",
        evidence: [{ segmentId: cited.id, quote: "Fire  NO cap" }],
      },
      payouts: [],
      resolvedAt: "2026-11-14T20:00:11Z",
    },
  };
  return { market, segments };
}

describe("verifyProof", () => {
  it("accepts an honest proof", async () => {
    expect(await verifyProof(await bundle())).toEqual({ ok: true });
  });

  it("catches an edited transcript line", async () => {
    const b = await bundle();
    (b.segments[0] as TranscriptSegment).text = "something else";
    const r = await verifyProof(b);
    expect(r.ok).toBe(false);
  });

  it("catches a quote that was never said", async () => {
    const b = await bundle();
    const res = b.market.resolution;
    if (res?.decision.status !== "decided") throw new Error("setup");
    res.decision.evidence = [{ segmentId: (b.segments[2] as TranscriptSegment).id, quote: "no cap" }];
    const r = await verifyProof(b);
    expect(r.ok).toBe(false);
  });

  it("catches a dropped segment", async () => {
    const b = await bundle();
    b.segments.splice(0, 1);
    expect((await verifyProof(b)).ok).toBe(false);
  });

  it("catches a fallback resolution to the wrong outcome", async () => {
    const b = await bundle();
    if (!b.market.resolution) throw new Error("setup");
    b.market.resolution.via = "fallback";
    expect((await verifyProof(b)).ok).toBe(false);
  });

  it("accepts a fallback resolution where nothing was heard", async () => {
    const b = await bundle();
    if (!b.market.resolution) throw new Error("setup");
    b.market.resolution = {
      ...b.market.resolution,
      outcomeId: no,
      via: "fallback",
      decision: {
        status: "undetermined",
        marketId,
        outcomeId: null,
        model: "gemini",
        confidence: 0,
        rationale: "no transcript",
        headHash: GENESIS_HASH,
        decidedAt: "2026-11-15T00:00:00Z",
        evidence: [],
      },
    };
    b.segments = [];
    expect(await verifyProof(b)).toEqual({ ok: true });
  });
});
