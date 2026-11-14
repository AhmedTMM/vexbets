import { z } from "zod";
import { BandNumber, Bps, Id, Page, Timestamp, UserSummary } from "./common";
import { Resolution } from "./resolution";

/**
 * Markets: "Will Sam say 'no cap' before midnight?" with outcomes Yes / No.
 *
 * Lifecycle:
 *   open      trading allowed; the band is listening for the window [opensAt, closesAt]
 *   closed    window over, trading stopped, waiting for the judge
 *   resolved  outcome decided, payouts done (see Resolution)
 *   voided    cancelled (for example no listening session covered the window); refunds
 */
export const MarketStatus = z.enum(["open", "closed", "resolved", "voided"]);
export type MarketStatus = z.infer<typeof MarketStatus>;

const Label = z.string().trim().min(1).max(60);
const Criteria = z.string().trim().min(1).max(1_000);

export const Outcome = z.object({
  id: Id,
  label: Label,
  /** What counts as this outcome happening, for the judge. */
  criteria: Criteria.nullable(),
  /** Outstanding shares (q_i in lmsr.ts). */
  shares: z.int().nonnegative(),
  priceBps: Bps,
});
export type Outcome = z.infer<typeof Outcome>;

export const Market = z.object({
  id: Id,
  creator: UserSummary,
  /** The prompt: the question people trade on. */
  question: z.string(),
  /** One-line pitch shown on the card. */
  tagline: z.string(),
  /** Success criteria for the whole market, read by the judge. */
  criteria: z.string(),
  outcomes: z.array(Outcome).min(2).max(8),
  /** Wins if the window closes with nothing decisive heard. */
  fallbackOutcomeId: Id,
  /** If true, the market resolves as soon as the judge finds proof, before closesAt. */
  resolveEarly: z.boolean(),
  bandNumber: BandNumber,
  subjectName: z.string(),
  opensAt: Timestamp,
  closesAt: Timestamp,
  /** LMSR liquidity b. */
  liquidityB: z.int().positive(),
  status: MarketStatus,
  volumeCredits: z.int().nonnegative(),
  createdAt: Timestamp,
  resolution: Resolution.nullable(),
});
export type Market = z.infer<typeof Market>;

export const CreateMarketRequest = z
  .object({
    question: z.string().trim().min(5).max(200),
    tagline: z.string().trim().min(1).max(120),
    criteria: Criteria,
    outcomes: z
      .array(z.object({ label: Label, criteria: Criteria.optional() }))
      .min(2)
      .max(8),
    /** Index into `outcomes`. */
    fallbackOutcomeIndex: z.int().nonnegative(),
    resolveEarly: z.boolean().default(true),
    bandNumber: BandNumber,
    subjectName: z.string().trim().min(1).max(50),
    /** Defaults to now. */
    opensAt: Timestamp.optional(),
    closesAt: Timestamp,
    /** LMSR b. 30 costs the creator 2,080 credits for a yes/no market; higher = steadier prices. */
    liquidityB: z.int().min(10).max(10_000).default(30),
  })
  .superRefine((m, ctx) => {
    const labels = m.outcomes.map((o) => o.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: "custom", message: "outcome labels must be unique", path: ["outcomes"] });
    }
    if (labels.includes("undetermined")) {
      ctx.addIssue({ code: "custom", message: "'UNDETERMINED' is reserved", path: ["outcomes"] });
    }
    if (m.fallbackOutcomeIndex >= m.outcomes.length) {
      ctx.addIssue({
        code: "custom",
        message: "fallbackOutcomeIndex is out of range",
        path: ["fallbackOutcomeIndex"],
      });
    }
    if (m.opensAt && Date.parse(m.closesAt) <= Date.parse(m.opensAt)) {
      ctx.addIssue({ code: "custom", message: "closesAt must be after opensAt", path: ["closesAt"] });
    }
  });
export type CreateMarketRequest = z.input<typeof CreateMarketRequest>;

export const ListMarketsQuery = Page.extend({
  status: MarketStatus.optional(),
});

export const ListMarketsResponse = z.object({
  markets: z.array(Market),
  nextCursor: z.string().nullable(),
});
