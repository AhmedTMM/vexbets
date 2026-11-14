import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  bandName,
  CreateMarketRequest,
  Decision,
  JudgeOutput,
  SegmentInput,
  StartSessionRequest,
} from "../src";

const base = {
  question: "Will Sam say 'no cap' before midnight?",
  tagline: "Sam vs. his favourite phrase",
  criteria: "Sam (the wearer) says the words 'no cap' out loud.",
  outcomes: [{ label: "Yes" }, { label: "No" }],
  fallbackOutcomeIndex: 1,
  bandNumber: 7,
  subjectName: "Sam",
  closesAt: "2026-11-15T00:00:00Z",
};

describe("CreateMarketRequest", () => {
  it("accepts a normal yes/no market and fills defaults", () => {
    const m = CreateMarketRequest.parse(base);
    expect(m.resolveEarly).toBe(true);
    expect(m.liquidityB).toBe(100);
  });

  it("rejects duplicate labels, a bad fallback, a reserved label and a backwards window", () => {
    const bad = (patch: object) => CreateMarketRequest.safeParse({ ...base, ...patch }).success;
    expect(bad({ outcomes: [{ label: "Yes" }, { label: "yes" }] })).toBe(false);
    expect(bad({ fallbackOutcomeIndex: 2 })).toBe(false);
    expect(bad({ outcomes: [{ label: "Yes" }, { label: "Undetermined" }] })).toBe(false);
    expect(bad({ opensAt: "2026-11-15T01:00:00Z" })).toBe(false);
    expect(bad({ outcomes: [{ label: "Yes" }] })).toBe(false);
    expect(bad({ bandNumber: 0 })).toBe(false);
  });
});

describe("ingest", () => {
  it("requires explicit consent to start listening", () => {
    expect(
      StartSessionRequest.safeParse({ bandNumber: 7, subjectName: "Sam", consentConfirmed: false }).success,
    ).toBe(false);
    expect(StartSessionRequest.safeParse({ bandNumber: 7, subjectName: "Sam" }).success).toBe(false);
    expect(
      StartSessionRequest.safeParse({ bandNumber: 7, subjectName: "Sam", consentConfirmed: true }).success,
    ).toBe(true);
  });

  it("rejects a segment that ends before it starts", () => {
    const s = { seq: 0, startMs: 2000, endMs: 1000, text: "hi", confidence: 0.9 };
    expect(SegmentInput.safeParse(s).success).toBe(false);
    expect(SegmentInput.parse({ ...s, endMs: 3000 }).speaker).toBeNull();
  });

  it("names bands the way the kit does", () => {
    expect(bandName(7)).toBe("Vexo-HACK-07");
    expect(bandName(42)).toBe("Vexo-HACK-42");
  });
});

describe("resolution", () => {
  it("a decided verdict needs evidence", () => {
    const d = {
      status: "decided",
      marketId: crypto.randomUUID(),
      outcomeId: crypto.randomUUID(),
      model: "gemini",
      confidence: 0.9,
      rationale: "heard it",
      headHash: "a".repeat(64),
      decidedAt: "2026-11-14T20:00:00Z",
      evidence: [],
    };
    expect(Decision.safeParse(d).success).toBe(false);
  });

  it("JudgeOutput converts to a JSON schema for the model", () => {
    const schema = z.toJSONSchema(JudgeOutput) as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["verdict", "confidence", "rationale", "evidence"]);
  });
});
