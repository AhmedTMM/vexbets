import type { JudgeOutput } from "@vexbets/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findPhrase,
  HEURISTIC_MODEL,
  heuristicVerdict,
  hybridJudge,
  quotedPhrases,
} from "../src/judge/hybrid";
import type { Judge, JudgeInput } from "../src/judge/types";
import { TEST_BAND, yesNo } from "./fixtures";
import { type Backend, startBackend } from "./harness";

const yes = "11111111-1111-4111-8111-111111111111";
const no = "22222222-2222-4222-8222-222222222222";

function input(question: string, lines: string[], criteria = "c"): JudgeInput {
  return {
    mode: "early",
    market: {
      id: crypto.randomUUID(),
      creator: { id: crypto.randomUUID(), handle: "a", displayName: "a" },
      question,
      tagline: "t",
      criteria,
      outcomes: [
        { id: yes, label: "Yes", criteria: null, shares: 0, priceBps: 5000 },
        { id: no, label: "No", criteria: null, shares: 0, priceBps: 5000 },
      ],
      fallbackOutcomeId: no,
      resolveEarly: true,
      bandNumber: TEST_BAND,
      subjectName: "Sam",
      opensAt: "2026-11-14T20:00:00.000Z",
      closesAt: "2026-11-15T00:00:00.000Z",
      liquidityB: 30,
      status: "open",
      volumeCredits: 0,
      createdAt: "2026-11-14T20:00:00.000Z",
      resolution: null,
    },
    transcript: lines.map((text, i) => ({ segmentId: `seg-${i}`, startMs: i * 1000, speaker: null, text })),
  };
}

describe("quoted phrases", () => {
  it("reads straight, curly and single quotes from the question, not apostrophes", () => {
    expect(quotedPhrases(input(`Will Sam's friend say "no cap"?`, []))).toEqual(["no cap"]);
    expect(quotedPhrases(input("Will anyone say ‘lowkey’ tonight?", []))).toEqual(["lowkey"]);
    expect(quotedPhrases(input("Won't they say 'bet' and 'say less'?", []))).toEqual(["bet", "say less"]);
    expect(quotedPhrases(input("Will the wearer talk about their ex?", []))).toEqual([]);
  });

  it("ignores examples quoted in the criteria", () => {
    expect(quotedPhrases(input("Will they talk about their ex?", [], "e.g. 'my ex'"))).toEqual([]);
  });
});

describe("findPhrase", () => {
  it("matches whole words, any case, through punctuation, and returns the exact slice", () => {
    expect(findPhrase("That crust is fire, NO CAP!", "no cap")).toBe("NO CAP");
    expect(findPhrase("no, cap honestly", "no cap")).toBe("no, cap");
    expect(findPhrase("he's a capybara", "cap")).toBeNull();
    expect(findPhrase("nocap", "no cap")).toBeNull();
    expect(findPhrase("it's lowkey good", "lowkey")).toBe("lowkey");
  });
});

describe("heuristic verdict", () => {
  it("decides YES with a quote that is a substring of the line", () => {
    const out = heuristicVerdict(input(`Will anyone say "no cap"?`, ["hi", "fire, no cap!"]));
    expect(out).toMatchObject({
      verdict: "Yes",
      confidence: 1,
      evidence: [{ segmentId: "seg-1", quote: "no cap" }],
    });
  });

  it("stays out of markets without quoted words or with more than two outcomes", () => {
    expect(heuristicVerdict(input("Will they talk about their ex?", ["I miss my ex"]))).toBeNull();
    const three = input(`Will anyone say "no cap"?`, ["no cap"]);
    three.market.outcomes.push({
      id: crypto.randomUUID(),
      label: "Maybe",
      criteria: null,
      shares: 0,
      priceBps: 0,
    });
    expect(heuristicVerdict(three)).toBeNull();
  });
});

describe("hybrid judge", () => {
  const calls: JudgeInput[] = [];
  const semantic: Judge = {
    model: "gpt-6.1-terra",
    async judge(i): Promise<JudgeOutput> {
      calls.push(i);
      return { verdict: "UNDETERMINED", confidence: 0.4, rationale: "semantic", evidence: [] };
    },
  };
  const judge = hybridJudge(semantic);

  it("answers exact phrases itself, without calling the model", async () => {
    const before = calls.length;
    const out = await judge.judge(input(`Will anyone say "no cap"?`, ["no cap fr"]));
    expect(out.model).toBe(HEURISTIC_MODEL);
    expect(calls.length).toBe(before);
  });

  it("sends meaning-based markets, and phrases it could not find, to the model", async () => {
    const before = calls.length;
    await judge.judge(input("Will they talk about their ex?", ["we broke up last week"]));
    await judge.judge(input(`Will anyone say "no cap"?`, ["no capp"]));
    expect(calls.length).toBe(before + 2);
  });
});

describe("hybrid judge in the backend", () => {
  let b: Backend;
  const modelCalls: JudgeInput[] = [];
  beforeAll(async () => {
    b = await startBackend({
      judge: hybridJudge({
        model: "gpt-6.1-terra",
        async judge(i) {
          modelCalls.push(i);
          return { verdict: "UNDETERMINED", confidence: 0.3, rationale: "no", evidence: [] };
        },
      }),
    });
  });
  afterAll(() => b.close());

  it("resolves an exact-phrase market with no model call, records the heuristic, and the proof verifies", async () => {
    const { verifyProof } = await import("@vexbets/contract");
    const m = await b.as("c@example.com")("createMarket", { body: yesNo() }); // "Will Sam say 'no cap' before midnight?"
    const call = b.as("l@example.com");
    const s = await call("startSession", {
      body: { bandNumber: TEST_BAND, subjectName: "Sam", consentConfirmed: true },
    });
    const t = b.now().getTime();
    await call("appendSegments", {
      params: { sessionId: s.id },
      body: {
        segments: [
          { seq: 0, startMs: t, endMs: t + 5, text: "That crust is fire, No Cap!", confidence: 0.9 },
        ],
      },
    });
    const done = await call("getMarket", { params: { marketId: m.id } });
    expect(done.status).toBe("resolved");
    expect(done.resolution?.decision.model).toBe(HEURISTIC_MODEL);
    expect(modelCalls).toHaveLength(0);
    expect(await verifyProof(await call("getProof", { params: { marketId: m.id } }))).toEqual({ ok: true });
  });
});
