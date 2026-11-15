import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { openaiJudge } from "../src/judge/openai";
import { buildPrompt } from "../src/judge/prompt";
import type { JudgeInput } from "../src/judge/types";
import { openaiSttTokens } from "../src/stt/openai";

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
    expect(p).toContain('- "Yes" (counts when: Someone says it)');
    expect(p).toContain(
      "[22222222-2222-4222-8222-222222222222] 20:01:05 speaker 1: that crust is fire no cap",
    );
  });
});

describe("OpenAI judge (offline)", () => {
  it("sends a strict structured-output request and checks the reply against the contract", async () => {
    const sent: Record<string, unknown>[] = [];
    const client = {
      responses: {
        parse: async (req: Record<string, unknown>) => {
          sent.push(req);
          return {
            status: "completed",
            output_parsed: {
              verdict: "Yes",
              confidence: 0.95,
              rationale: "Speaker 1 said it.",
              evidence: [{ segmentId: "22222222-2222-4222-8222-222222222222", quote: " fire no cap " }],
            },
          };
        },
      },
    } as unknown as OpenAI;
    const out = await openaiJudge({ apiKey: "unused", client }).judge(input);
    expect(out).toMatchObject({ verdict: "Yes", evidence: [{ quote: "fire no cap" }] });
    const req = sent[0] as {
      model: string;
      reasoning: unknown;
      text: { format: { type: string; strict: boolean } };
    };
    expect(req.model).toBe("gpt-6.1-terra");
    expect(req.reasoning).toEqual({ effort: "none" });
    expect(req.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(JSON.stringify(req.text.format)).not.toMatch(/minLength|maxLength/);
    expect(JSON.stringify(req.text.format)).toContain('"enum":["UNDETERMINED","Yes","No"]');
    expect(req).not.toHaveProperty("temperature");
  });

  it("mints a transcription-only realtime client secret", async () => {
    const sent: Record<string, unknown>[] = [];
    const client = {
      realtime: {
        clientSecrets: {
          create: async (req: Record<string, unknown>) => {
            sent.push(req);
            return { value: "ek_test", expires_at: 1_900_000_000, session: {} };
          },
        },
      },
    } as unknown as OpenAI;
    const t = await openaiSttTokens({ apiKey: "unused", client }).mint();
    expect(t).toEqual({ token: "ek_test", expiresAt: new Date(1_900_000_000_000) });
    expect(sent[0]).toMatchObject({
      session: {
        type: "transcription",
        audio: {
          input: { transcription: { model: "gpt-live-transcribe", languages: ["en"] }, turn_detection: null },
        },
      },
    });
  });
});

const key = process.env.OPENAI_API_KEY;

describe.skipIf(!key)("OpenAI judge (live, needs OPENAI_API_KEY)", () => {
  const judge = () => openaiJudge({ apiKey: key ?? "", model: process.env.OPENAI_JUDGE_MODEL || undefined });

  it("finds the phrase and quotes the right line", async () => {
    const out = await judge().judge(input);
    expect(out.verdict).toBe("Yes");
    expect(out.evidence[0]?.segmentId).toBe("22222222-2222-4222-8222-222222222222");
    expect(out.evidence[0]?.quote.toLowerCase()).toContain("no cap");
  });

  it("stays undetermined early when it was not said", async () => {
    const out = await judge().judge({ ...input, transcript: input.transcript.slice(0, 1) });
    expect(out.verdict).toBe("UNDETERMINED");
  });

  it("mints a real transcription client secret", async () => {
    const t = await openaiSttTokens({ apiKey: key ?? "" }).mint();
    expect(t.token).toMatch(/^ek_/);
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
