// The one client every page uses: the contract's typed client.
// Mock mode answers in the browser (src/lib/mock); live mode calls the real backend.

import { type Client, createClient } from "@vexbets/contract";
import { mockFetch } from "./mock/server";
import { getEmail } from "./session";

export const API_MODE: "mock" | "live" = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";

export const api: Client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE ?? "",
  fetch: API_MODE === "mock" ? mockFetch : undefined,
  headers: (): Record<string, string> => {
    const email = getEmail();
    return email ? { authorization: `Bearer ${encodeURIComponent(email)}` } : {};
  },
});

/** Tell every polling hook to reload now (after a trade, a new market, ...). */
export function refreshAll(): void {
  window.dispatchEvent(new Event("vexbets:refresh"));
}
