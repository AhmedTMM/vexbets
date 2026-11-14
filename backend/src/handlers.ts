import type { Handlers } from "./http";
import { appendSegments, endSession, startSession } from "./services/ingest";
import { createMarket, getMarket, listMarkets } from "./services/markets";
import { getProof, judgeBand } from "./services/resolution";
import { listPositions, listTrades, quote, trade } from "./services/trading";
import { userForEmail } from "./services/users";

/** Contract endpoint name -> implementation. Endpoints not listed here answer "not implemented yet". */
export const handlers: Handlers = {
  async getMe({ deps, email }) {
    const u = await userForEmail(deps, email());
    return { id: u.id, handle: u.handle, displayName: u.displayName, balance: u.balance };
  },

  async createMarket({ deps, email, body }) {
    const u = await userForEmail(deps, email());
    return createMarket(deps, u, body);
  },

  async listMarkets({ deps, query }) {
    return listMarkets(deps, query);
  },

  async getMarket({ deps, params }) {
    return getMarket(deps, params.marketId ?? "");
  },

  async quote({ deps, params, body }) {
    return quote(deps, params.marketId ?? "", body);
  },

  async trade({ deps, email, params, body }) {
    const u = await userForEmail(deps, email());
    return trade(deps, u, params.marketId ?? "", body);
  },

  async listTrades({ deps, params, query }) {
    return listTrades(deps, params.marketId ?? "", query);
  },

  async listPositions({ deps, email }) {
    return listPositions(deps, await userForEmail(deps, email()));
  },

  async startSession({ deps, email, body }) {
    return startSession(deps, await userForEmail(deps, email()), body);
  },

  async appendSegments({ deps, email, params, body }) {
    email(); // any logged-in caller may feed a session (demo: no device tokens)
    const r = await appendSegments(deps, params.sessionId ?? "", body.segments);
    // New words heard: let the judge look at this band's markets (at most every 30 s each).
    if (r.accepted > 0) await judgeBand(deps, r.session.bandNumber);
    return { accepted: r.accepted, segmentCount: r.segmentCount, headHash: r.headHash };
  },

  async endSession({ deps, email, params }) {
    email();
    return endSession(deps, params.sessionId ?? "");
  },

  async getProof({ deps, params }) {
    return getProof(deps, params.marketId ?? "");
  },
};
