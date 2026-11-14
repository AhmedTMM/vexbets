import { describe, expect, it } from "vitest";
import { geminiJudge } from "../src/judge/gemini";
import { buildPrompt } from "../src/judge/prompt";
import type { JudgeInput } from "../src/judge/types";

const input: JudgeInput = {
  mode: "early",
  market: {
    id: crypto.randomUUID(),
    creator: { id: crypto.randomUUID(), handle: "a", displayName: "a" },
    question: "Will Sam say 'no cap' before midnight?",
    tagline: "t",
    criteria: "Anyone near the band says 'no cap'.",
    outcomes: [
      { id: crypto.randomUUID(), label: "Yes", criteria: "Someone says it", shares: 0, priceBps: 5000 },
      { id: crypto.randomUUID(), label: "No", criteria: null, shares: 0, priceBps: 5000 },
    ],
    fallbackOutcomeId: crypto.randomUUID(),
    resolveEarly: true,
    bandNumber: 7,
    subjectName: "Sam",
    opensAt: "2026-11-14T20:00:00.000Z",
    closesAt: "2026-11-15T00:00:00.000Z",
    liquidityB: 100,
    status: "open",
    volumeCredits: 0,
    createdAt: "2026-11-14T20:00:00.000Z",
    resolution: null,
  },
  transcript: [
    {
      segmentId: "11111111-1111-4111-8111-111111111111",
      startMs: Date.parse("2026-11-14T20:01:00Z"),
      speaker: "0",
      text: "what are we eating",
    },
    {
      segmentId: "22222222-2222-4222-8222-222222222222",
      startMs: Date.parse("2026-11-14T20:01:05Z"),
      speaker: "1",
      text: "that crust is fire no cap",
    },
  ],
};

describe("judge prompt", () => {
  it("gives the model the mode, criteria, outcomes and every line with its id", () => {
    const p = buildPrompt(input);
    expect(p).toContain("MODE: EARLY");
    expect(p).toContain("SUCCESS CRITERIA: Anyone near the band says 'no cap'.");
    expect(p).toContain("- Yes: Someone says it");
    expect(p).toContain(
      "[22222222-2222-4222-8222-222222222222] 20:01:05 speaker 1: that crust is fire no cap",
    );
  });
});

const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;

describe.skipIf(!key || !model)("Gemini (live, needs GEMINI_API_KEY and GEMINI_MODEL)", () => {
  it("finds the phrase and quotes the right line", async () => {
    const out = await geminiJudge({ apiKey: key ?? "", model: model ?? "" }).judge(input);
    expect(out.verdict).toBe("Yes");
    expect(out.evidence[0]?.segmentId).toBe("22222222-2222-4222-8222-222222222222");
    expect(out.evidence[0]?.quote.toLowerCase()).toContain("no cap");
  });
});
