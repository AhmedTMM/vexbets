/**
 * Money is shown in dollars. The contract counts whole credits and a winning share pays
 * SHARE_PAYOUT = 100 credits, so 1 credit = 1¢ and a winning share pays $1.
 */
export const credits = (n: number) =>
  `$${(Math.round(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const signedCredits = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${credits(Math.abs(n))}`;

export const cents = (c: number) => `${Math.round(c)}¢`;

export const bpsCents = (bps: number) => cents(bps / 100);

export function timeLeft(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) - nowMs;
  if (ms <= 0) return "closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function clock(t: string | number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
