"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Holdings } from "@/components/Holdings";
import { PriceChart } from "@/components/PriceChart";
import { ResolutionPanel } from "@/components/ResolutionPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { TradeTicket } from "@/components/TradeTicket";
import { api } from "@/lib/api";
import { cents, clock, credits, timeLeft } from "@/lib/format";
import { useMe, useNow, usePoll } from "@/lib/hooks";
import { priceHistory, sideOf, yesCents, yesChange, yesNo } from "@/lib/market";

export default function MarketPage() {
  const { id } = useParams<{ id: string }>();
  const now = useNow();
  const { data: me } = useMe();
  const { data, error } = usePoll(
    async () => {
      const params = { marketId: id };
      const [market, { trades }, { positions }] = await Promise.all([
        api("getMarket", { params }),
        api("listTrades", { params, query: { limit: 100 } }),
        api("listPositions"),
      ]);
      return { market, trades, positions: positions.filter((p) => p.marketId === id) };
    },
    id,
    1500,
  );

  if (error && !data) {
    return (
      <p className="text-muted">
        {error.message}.{" "}
        <Link href="/" className="text-accent">
          Back to markets
        </Link>
      </p>
    );
  }
  if (!data || !me) return null;
  const { market: m, trades, positions } = data;
  const yn = yesNo(m);
  if (!yn)
    return (
      <p className="text-muted">This market has more than two outcomes; the dashboard shows YES / NO only.</p>
    );

  const pts = priceHistory(m, yn, trades, now);
  const yes = yesCents(m, yn);
  const change = yesChange(pts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <Link href="/" className="text-sm text-muted hover:text-ink">
            ← Markets
          </Link>
          <h1 className="mt-1 text-3xl font-semibold leading-tight">{m.question}</h1>
          <p className="mt-1 text-muted">{m.tagline}</p>
          <p className="mt-2 text-sm text-muted">
            Band #{m.bandNumber} on {m.subjectName} · YES if: {m.criteria}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge market={m} />
          {m.status === "open" && (
            <div className="display mt-2 text-2xl">closes in {timeLeft(m.closesAt, now)}</div>
          )}
          <div className="mt-1 text-xs text-muted">
            by @{m.creator.handle} · vol {credits(m.volumeCredits)}
          </div>
        </div>
      </div>

      {m.resolution && <ResolutionPanel market={m} yn={yn} meId={me.id} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-[14px] border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <div className="text-xs uppercase text-yes/80">Yes</div>
                <span className="num text-4xl text-yes">{cents(yes)}</span>
                <span className={`ml-2 num text-sm ${change >= 0 ? "text-yes" : "text-no"}`}>
                  {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}¢
                </span>
              </div>
              <div>
                <div className="text-xs uppercase text-no/80">No</div>
                <span className="num text-4xl text-no">{cents(100 - yes)}</span>
              </div>
              <div className="text-sm text-muted">= the crowd thinks YES is {Math.round(yes)}% likely</div>
            </div>
            <PriceChart points={pts} />
          </div>

          <div className="rounded-[14px] border border-line">
            <div className="border-b border-line px-4 py-2 text-xs uppercase tracking-wider text-muted">
              Trades
            </div>
            {trades.length === 0 && <p className="px-4 py-3 text-sm text-muted">No trades yet. Be first.</p>}
            <div className="max-h-72 divide-y divide-line overflow-y-auto">
              {trades.map((t) => {
                const side = sideOf(yn, t.outcomeId);
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>
                      <span className="text-ink">@{t.user.handle}</span>{" "}
                      <span className="text-muted">{t.side === "buy" ? "bought" : "sold"}</span>{" "}
                      <span className={side === "YES" ? "text-yes" : "text-no"}>
                        {t.shares} {side}
                      </span>
                    </span>
                    <span className="num text-muted">
                      {credits(t.credits)} · {clock(t.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {m.status === "open" && Date.parse(m.closesAt) > now ? (
            <TradeTicket market={m} yn={yn} balance={me.balance} />
          ) : (
            m.status !== "resolved" && (
              <div className="rounded-[14px] border border-line p-4 text-sm text-muted">
                Trading has stopped. Waiting for the judge…
              </div>
            )
          )}
          <Holdings market={m} yn={yn} positions={positions} />
        </div>
      </div>
    </div>
  );
}
