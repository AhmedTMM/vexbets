import { JudgeOutput } from "@vexbets/contract";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import type { Judge } from "./types";

/**
 * The judge's response schema as sent to OpenAI. Same shape as the contract's JudgeOutput,
 * minus string length limits, which strict structured outputs may reject. The reply is then
 * trimmed and checked against the real JudgeOutput.
 */
const OpenAIJudgeOutput = z.object({
  verdict: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidence: z.array(z.object({ segmentId: z.string(), quote: z.string() })).max(10),
});

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export const DEFAULT_JUDGE_MODEL = "gpt-6.1-terra";

export function openaiJudge(opts: {
  apiKey: string;
  model?: string;
  effort?: ReasoningEffort;
  client?: OpenAI;
}): Judge {
  const client = opts.client ?? new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_JUDGE_MODEL;
  const effort = opts.effort ?? "low";
  return {
    model,
    async judge(input) {
      const res = await client.responses.parse({
        model,
        reasoning: { effort },
        instructions: SYSTEM_PROMPT,
        input: buildPrompt(input),
        text: { format: zodTextFormat(OpenAIJudgeOutput, "judge_output") },
      });
      const out = res.output_parsed;
      if (!out) throw new Error(`OpenAI judge returned no parsed output (status ${res.status})`);
      return JudgeOutput.parse({
        verdict: out.verdict.trim() || "UNDETERMINED",
        confidence: out.confidence,
        rationale: (out.rationale.trim() || "(no rationale)").slice(0, 2_000),
        evidence: out.evidence
          .filter((e) => e.quote.trim() && e.segmentId.trim())
          .map((e) => ({ segmentId: e.segmentId.trim(), quote: e.quote.trim().slice(0, 500) })),
      });
    },
  };
}
