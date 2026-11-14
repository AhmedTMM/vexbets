import type { SttTokens } from "./types";

/**
 * Deepgram short-lived tokens (POST /v1/auth/grant). The listener opens Deepgram's live
 * websocket with this token, so DEEPGRAM_API_KEY never reaches the browser.
 */
export function deepgramTokens(apiKey: string, ttlSeconds = 300, fetchImpl: typeof fetch = fetch): SttTokens {
  return {
    provider: "deepgram",
    async mint() {
      const res = await fetchImpl("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl_seconds: ttlSeconds }),
      });
      if (!res.ok) throw new Error(`Deepgram token grant failed: HTTP ${res.status}`);
      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) throw new Error("Deepgram token grant returned no access_token");
      return {
        token: body.access_token,
        expiresAt: new Date(Date.now() + (body.expires_in ?? ttlSeconds) * 1000),
      };
    },
  };
}
