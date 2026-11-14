import { JudgeOutput } from "@vexbets/contract";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import type { Judge } from "./types";

/**
 * The judge's response schema as sent to OpenAI, built per market: `verdict` is an enum of
 * that market's exact outcome labels plus UNDETERMINED, so the model cannot answer
 * "Yes: someone says it". Same shape as the contract's JudgeOutput, minus string length
 * limits (strict structured outputs may reject them); the reply is then trimmed and checked
 * against the real JudgeOutput.
 */
function responseSchema(labels: string[]) {
  return z.object({
    verdict: z.enum(["UNDETERMINED", ...labels]),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    evidence: z.array(z.object({ segmentId: z.string(), quote: z.string() })).max(10),
  });
}

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
      const schema = responseSchema(input.market.outcomes.map((o) => o.label));
      const res = await client.responses.parse({
        model,
        reasoning: { effort },
        instructions: SYSTEM_PROMPT,
        input: buildPrompt(input),
        text: { format: zodTextFormat(schema, "judge_output") },
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
