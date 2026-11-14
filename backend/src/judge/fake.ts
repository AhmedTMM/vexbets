import type { JudgeOutput } from "@vexbets/contract";
import type { Judge, JudgeInput } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A free, deterministic judge for local dev and tests. It looks for the phrase in quotes in
 * the question ("Will Sam say 'no cap'?"). Heard: the first outcome that is not the fallback
 * wins, quoting that line. Not heard: UNDETERMINED (so at close, the fallback wins).
 */
export const keywordJudge: Judge = {
  model: "fake-keyword-judge",
  async judge({ market, transcript }: JudgeInput): Promise<JudgeOutput> {
    const phrase = /['"‘“]([^'"’”]+)['"’”]/.exec(market.question)?.[1];
    const winner = market.outcomes.find((o) => o.id !== market.fallbackOutcomeId);
    const line = phrase ? transcript.find((l) => norm(l.text).includes(norm(phrase))) : undefined;
    if (!phrase || !winner || !line) {
      return {
        verdict: "UNDETERMINED",
        confidence: 0.5,
        rationale: "The phrase was not heard.",
        evidence: [],
      };
    }
    return {
      verdict: winner.label,
      confidence: 1,
      rationale: `"${phrase}" was said.`,
      evidence: [{ segmentId: line.segmentId, quote: phrase }],
    };
  },
};

/** A judge whose answers a test controls. */
export function scriptedJudge(answer: (input: JudgeInput) => JudgeOutput): Judge & { calls: JudgeInput[] } {
  const calls: JudgeInput[] = [];
  return {
    model: "scripted-judge",
    calls,
    async judge(input) {
      calls.push(input);
      return answer(input);
    },
  };
}
