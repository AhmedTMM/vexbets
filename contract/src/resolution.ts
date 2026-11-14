import { z } from "zod";
import { Credits, Id, Sha256Hex, Timestamp } from "./common";

/**
 * Resolution: the judge model (Gemini) reads the transcript of a market's window and
 * decides which outcome happened, quoting the exact lines that prove it.
 */

/** One quoted line of transcript that supports the verdict. */
export const Evidence = z.object({
  segmentId: Id,
  /** Must appear in that segment's text (compared case- and whitespace-insensitively). */
  quote: z.string().trim().min(1).max(500),
});
export type Evidence = z.infer<typeof Evidence>;

/**
 * What the judge model must return. Pass `z.toJSONSchema(JudgeOutput)` as the model's
 * response schema, then parse the reply with `JudgeOutput.parse`.
 * `verdict` is an outcome label from the market, or "UNDETERMINED".
 */
export const JudgeOutput = z.object({
  verdict: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(2_000),
  evidence: z.array(Evidence).max(10),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

const DecisionBase = z.object({
  marketId: Id,
  /** Model id as sent to the provider, e.g. a Gemini model name. */
  model: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  /** Hash of the last transcript segment the judge saw, or GENESIS_HASH if it saw none. */
  headHash: Sha256Hex,
  decidedAt: Timestamp,
});

export const Decision = z.discriminatedUnion("status", [
  DecisionBase.extend({
    status: z.literal("decided"),
    outcomeId: Id,
    evidence: z.array(Evidence).min(1).max(10),
  }),
  DecisionBase.extend({
    status: z.literal("undetermined"),
    outcomeId: z.null(),
    evidence: z.array(Evidence).max(10),
  }),
]);
export type Decision = z.infer<typeof Decision>;

export const Payout = z.object({
  userId: Id,
  /** Winning shares held. */
  shares: z.int().nonnegative(),
  credits: Credits,
});
export type Payout = z.infer<typeof Payout>;

export const Resolution = z.object({
  marketId: Id,
  outcomeId: Id,
  /**
   * "evidence": the judge decided and quoted proof.
   * "fallback": the window closed with nothing decisive heard, so the market's
   * fallback outcome won (usually "No").
   */
  via: z.enum(["evidence", "fallback"]),
  decision: Decision,
  payouts: z.array(Payout),
  resolvedAt: Timestamp,
});
export type Resolution = z.infer<typeof Resolution>;
