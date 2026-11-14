"use client";

import Link from "next/link";
import { Flash } from "@/components/Flash";
import { Holdings } from "@/components/Holdings";
import { PriceChart } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { TradeTicket } from "@/components/TradeTicket";
import { api } from "@/lib/api";
import { cents, credits, timeLeft } from "@/lib/format";
import { useMe, useNow, usePoll } from "@/lib/hooks";
import { priceHistory, yesCents, yesChange, yesNo } from "@/lib/market";

function Prices({ yes, change }: { yes: number; change: number }) {
  return (
    <div className="flex items-end gap-6 sm:gap-8">
      <div>
        <div className="label">Yes</div>
        <Flash value={yes} className="display text-[56px] text-yes sm:text-[68px]">
          {cents(yes)}
        </Flash>
        <span className={`display ml-2 text-xl ${change >= 0 ? "text-yes" : "text-no"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}¢
        </span>
      </div>
      <div>
        <div className="label">No</div>
        <Flash value={100 - yes} className="display text-[56px] text-no sm:text-[68px]">
          {cents(100 - yes)}
        </Flash>
      </div>
    </div>
  );
}

export function FeaturedMarket({ marketId }: { marketId: string | null }) {
  return marketId ? <LiveMarket marketId={marketId} /> : <NoMarket />;
}

function NoMarket() {
  return (
    <section className="panel flex min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="font-semibold text-xl tracking-tight">No market open</h2>
      <p className="text-muted text-sm">Pick one in the watchlist, or open a new one there.</p>
    </section>
  );
}

function LiveMarket({ marketId }: { marketId: string }) {
  const now = useNow();
  const { data: me } = useMe();
  const { data, error } = usePoll(
    async () => {
      const params = { marketId };
      const [market, { trades }, { positions }] = await Promise.all([
        api("getMarket", { params }),
        api("listTrades", { params, query: { limit: 100 } }),
        api("listPositions"),
      ]);
      return { market, trades, positions: positions.filter((p) => p.marketId === marketId) };
    },
    marketId,
    1500,
  );

  if (error && !data) return <section className="panel p-6 text-muted">{error.message}</section>;
  if (!data || !me) return <section className="panel h-[420px]" aria-busy="true" />;
  const { market: m, trades, positions } = data;
  const yn = yesNo(m);
  if (!yn) return null;
  const pts = priceHistory(m, yn, trades, now);
  const yes = yesCents(m, yn);
  const msLeft = Date.parse(m.closesAt) - now;
  const urgent = msLeft > 0 && msLeft < 60_000;
  const open = m.status === "open" && msLeft > 0;
  const r = m.resolution;

  return (
    <section className="panel p-4 sm:p-6" aria-label="Selected market">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="meta">
          {m.subjectName} · band #{m.bandNumber} · vol {credits(m.volumeCredits)}
        </span>
        <div className="flex items-center gap-3">
          {open && (
            <span className={`num text-sm ${urgent ? "font-semibold text-no" : "text-muted"}`}>
              closes in {timeLeft(m.closesAt, now)}
            </span>
          )}
          <StatusBadge market={m} />
        </div>
      </div>
      <h2 className="mt-2 font-semibold text-[22px] leading-tight sm:text-[28px] tracking-[-0.01em]">
        {m.question}
      </h2>

      {/* Phones: the left column dissolves (contents) so the buy ticket sits right under the
          prices, with the chart and details after it. */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-8 min-[1280px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 max-sm:contents">
          <Prices yes={yes} change={yesChange(pts)} />
          <div className="mt-5 h-[220px] max-sm:order-2 max-sm:mt-0 sm:h-[290px]">
            <PriceChart points={pts} height="100%" />
          </div>
          {r && (
            <div className="mt-4 rounded-xl max-sm:order-2 max-sm:mt-0 border border-line bg-raised p-4 text-sm">
              <p>{r.decision.rationale}</p>
              {r.decision.evidence[0] && (
                <p className="mt-1 text-muted italic">“{r.decision.evidence[0].quote}”</p>
              )}
            </div>
          )}
          <Link
            href={`/markets/${m.id}`}
            className="meta mt-3 inline-block underline-offset-4 max-sm:order-2 max-sm:mt-0 max-sm:justify-self-start max-sm:py-2 hover:text-ink hover:underline"
          >
            Trades, proof and details
          </Link>
        </div>
        <div className="space-y-3 max-sm:order-1">
          {open && <TradeTicket market={m} yn={yn} balance={me.balance} />}
          <Holdings market={m} yn={yn} positions={positions} />
        </div>
      </div>
    </section>
  );
}
