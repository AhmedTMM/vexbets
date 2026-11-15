"use client";

import { Button } from "@heroui/react";
import type { Market, Position } from "@vexbets/contract";
import { cents, signedCredits } from "@/lib/format";
import type { YesNo } from "@/lib/market";
import { holdingRows } from "@/lib/ticket";

/** A quiet summary of your YES / NO shares in one market. Selling is in the ticket's SELL tab. */
export function Holdings({ market, yn, positions }: { market: Market; yn: YesNo; positions: Position[] }) {
  const rows = holdingRows(market, yn, positions);
  const open = market.status === "open" && Date.parse(market.closesAt) > Date.now();
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-line px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="label">Your position</div>
        {open && (
          <Button
            size="sm"
            variant="ghost"
            className="-mr-2 h-7 rounded-full px-2 font-semibold text-[11px] text-muted uppercase tracking-[0.12em] hover:text-ink"
            onPress={() =>
              window.dispatchEvent(
                new CustomEvent("vexbets:ticket-sell", { detail: { marketId: market.id } }),
              )
            }
          >
            Sell
          </Button>
        )}
      </div>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.side} className="num text-[15px]">
            <span className={`font-semibold ${r.side === "YES" ? "text-yes" : "text-no"}`}>
              {r.shares} {r.side === "YES" ? "Yes" : "No"}
            </span>
            <span className="text-muted">
              {" "}
              · avg {cents(r.avgCents)} · now {cents(r.nowCents)} ·{" "}
            </span>
            <span className={r.gain >= 0 ? "text-yes" : "text-no"}>{signedCredits(r.gain)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
