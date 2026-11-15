"use client";

import type { Market } from "@vexbets/contract";
import type { ReactNode } from "react";
import { timeLeft } from "@/lib/format";
import { yesNo } from "@/lib/market";

type Tone = "live" | "yes" | "no" | "muted";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  // No red pulsing dot: it read like a "recording" light.
  live: { pill: "border-line-strong text-ink", dot: "" },
  yes: { pill: "border-yes/35 bg-yes/10 text-yes", dot: "bg-yes" },
  no: { pill: "border-no/35 bg-no/10 text-no", dot: "bg-no" },
  muted: { pill: "border-line-strong text-muted", dot: "bg-muted" },
};

function Pill({ tone, children, big }: { tone: Tone; children: ReactNode; big?: boolean }) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${t.pill} ${
        big ? "h-8 px-3 text-[13px]" : "h-6 px-2.5 text-xs"
      }`}
    >
      {t.dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Where a market stands. Open markets read "Live"; pass `now` to add the countdown
 * ("Live · closes in 12:34"), as the market header does.
 */
export function StatusBadge({ market, now, big }: { market: Market; now?: number; big?: boolean }) {
  switch (market.status) {
    case "open": {
      const left = now === undefined ? null : Date.parse(market.closesAt) - now;
      if (left !== null && left <= 0)
        return (
          <Pill tone="muted" big={big}>
            Closed · judging
          </Pill>
        );
      return (
        <Pill tone="live" big={big}>
          Live
          {left !== null && now !== undefined && (
            <span className={`num font-normal ${left < 60_000 ? "text-no" : "text-muted"}`}>
              closes in {timeLeft(market.closesAt, now)}
            </span>
          )}
        </Pill>
      );
    }
    case "closed":
      return (
        <Pill tone="muted" big={big}>
          Closed · judging
        </Pill>
      );
    case "voided":
      return (
        <Pill tone="muted" big={big}>
          Voided · refunded
        </Pill>
      );
    case "resolved": {
      const yn = yesNo(market);
      const yes = yn && market.resolution?.outcomeId === yn.yes.id;
      return (
        <Pill tone={yes ? "yes" : "no"} big={big}>
          Settled {yes ? "YES" : "NO"}
        </Pill>
      );
    }
  }
}
