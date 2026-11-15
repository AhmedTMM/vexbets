/** Time the judge: npx tsx scripts/time-judge.ts (reads OPENAI_API_KEY from .env.local). */
import { openaiJudge, type ReasoningEffort } from "../src/judge/openai";
import type { JudgeInput } from "../src/judge/types";

process.loadEnvFile(".env.local");
const input: JudgeInput = {
  mode: "early",
  market: {
    id: crypto.randomUUID(),
    creator: { id: crypto.randomUUID(), handle: "a", displayName: "a" },
    question: "Will the wearer talk about their ex?",
    tagline: "t",
    criteria: "Someone near the band talks about their own ex-partner, by that word or clearly by context.",
    outcomes: [
      { id: crypto.randomUUID(), label: "Yes", criteria: null, shares: 0, priceBps: 5000 },
      { id: crypto.randomUUID(), label: "No", criteria: null, shares: 0, priceBps: 5000 },
    ],
    fallbackOutcomeId: crypto.randomUUID(),
    resolveEarly: true,
    bandNumber: 41,
    subjectName: "the wearer",
    opensAt: "2026-11-14T20:00:00.000Z",
    closesAt: "2026-11-15T03:00:00.000Z",
    liquidityB: 30,
    status: "open",
    volumeCredits: 0,
    createdAt: "2026-11-14T20:00:00.000Z",
    resolution: null,
  },
  transcript: [
    {
      segmentId: "11111111-1111-4111-8111-111111111111",
      startMs: Date.now() - 9000,
      speaker: null,
      text: "ok what are we eating tonight",
    },
    {
      segmentId: "22222222-2222-4222-8222-222222222222",
      startMs: Date.now() - 4000,
      speaker: null,
      text: "we broke up last week and honestly I still miss her",
    },
  ],
};
const model = process.env.MODEL || undefined;
for (const effort of process.argv.slice(2) as ReasoningEffort[]) {
  const judge = openaiJudge({ apiKey: process.env.OPENAI_API_KEY ?? "", effort, model });
  const times: number[] = [];
  let verdicts = "";
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const out = await judge.judge(input);
    times.push(Math.round(performance.now() - t0));
    verdicts += out.verdict + " ";
  }
  console.log(
    `${model ?? "gpt-6.1-terra"} effort=${effort}: ${times.join(", ")} ms (median ${times.sort((a, b) => a - b)[1]}) verdicts: ${verdicts}`,
  );
}
