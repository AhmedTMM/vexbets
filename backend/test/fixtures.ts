import type { CreateMarketRequest } from "@vexbets/contract";

/**
 * Band number used only inside tests. The backend never connects to a band: it only uses the
 * number to match transcript to markets. The team's real number goes in the listener.
 */
export const TEST_BAND = 7;

export function yesNo(patch: Partial<CreateMarketRequest> = {}): CreateMarketRequest {
  return {
    question: "Will Sam say 'no cap' before midnight?",
    tagline: "Sam vs. his favourite phrase",
    criteria: "Anyone near the band says the words 'no cap'.",
    outcomes: [{ label: "Yes" }, { label: "No" }],
    fallbackOutcomeIndex: 1,
    bandNumber: TEST_BAND,
    subjectName: "Sam",
    closesAt: "2026-11-15T00:00:00.000Z",
    ...patch,
  };
}
