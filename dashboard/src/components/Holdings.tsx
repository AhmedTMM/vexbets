"use client";

import type { Market, Position } from "@vexbets/contract";
import { cents, credits, signedCredits } from "@/lib/format";
import { type YesNo, yesCents } from "@/lib/market";
import { SellButton } from "./SellButton";

/** Your YES / NO shares in one market, with a Sell button on each. */
export function Holdings({ market, yn, positions }: { market: Market; yn: YesNo; positions: Position[] }) {
  const yes = yesCents(market, yn);
  const open = market.status === "open" && Date.parse(market.closesAt) > Date.now();
  const rows = (["YES", "NO"] as const)
    .map((side) => {
      const o = side === "YES" ? yn.yes : yn.no;
      const p = positions.find((x) => x.outcomeId === o.id);
      const price = side === "YES" ? yes : 100 - yes;
      return p && p.shares > 0 ? { side, o, p, price, value: p.shares * price } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="label mb-2">Your shares</div>
      {rows.length === 0 && <p className="text-muted text-sm">None yet.</p>}
      <div className="divide-y divide-line">
        {rows.map((r) => {
          const gain = r.value - r.p.costBasis;
          return (
            <div key={r.side} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm">
                <span className={`num font-semibold ${r.side === "YES" ? "text-yes" : "text-no"}`}>
                  {r.p.shares} {r.side}
                </span>
                <span className="meta ml-2">
                  @ {cents(r.price)} · {credits(r.value)}{" "}
                  <span className={gain >= 0 ? "text-yes" : "text-no"}>{signedCredits(gain)}</span>
                </span>
              </div>
              {open && <SellButton marketId={market.id} outcomeId={r.o.id} held={r.p.shares} side={r.side} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
