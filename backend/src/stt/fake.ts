import type { SttTokens } from "./types";

/**
 * STT_PROVIDER=fake: hands out tokens for the scripted STT engine (contract's scriptedStt),
 * so the whole listener path works with no band and no provider key.
 */
export const fakeSttTokens: SttTokens = {
  provider: "fake",
  async mint() {
    return { token: `fake-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 300_000) };
  },
};
