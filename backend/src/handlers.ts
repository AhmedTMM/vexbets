import type { Handlers } from "./http";
import { createMarket, getMarket, listMarkets } from "./services/markets";
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
};
