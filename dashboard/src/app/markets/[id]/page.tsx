"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PriceChart } from "@/components/PriceChart";
import { ResolutionPanel } from "@/components/ResolutionPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { TradeTicket } from "@/components/TradeTicket";
import { api } from "@/lib/api";
import { cents, clock, credits, signedCredits, timeLeft } from "@/lib/format";
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
      <p className="text-white/60">
        {error.message}.{" "}
        <Link href="/" className="text-sky-400">
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
      <p className="text-white/60">
        This market has more than two outcomes; the dashboard shows YES / NO only.
      </p>
    );

  const pts = priceHistory(m, yn, trades, now);
  const yes = yesCents(m, yn);
  const change = yesChange(pts);
  const yesHeld = positions.find((p) => p.outcomeId === yn.yes.id);
  const noHeld = positions.find((p) => p.outcomeId === yn.no.id);
  const holding = (yesHeld?.shares ?? 0) + (noHeld?.shares ?? 0) > 0;
  const value = (yesHeld?.shares ?? 0) * yes + (noHeld?.shares ?? 0) * (100 - yes);
  const basis = (yesHeld?.costBasis ?? 0) + (noHeld?.costBasis ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <Link href="/" className="text-sm text-white/40 hover:text-white">
            ← Markets
          </Link>
          <h1 className="mt-1 text-3xl font-semibold leading-tight">{m.question}</h1>
          <p className="mt-1 text-white/60">{m.tagline}</p>
          <p className="mt-2 text-sm text-white/40">
            Band #{m.bandNumber} on {m.subjectName} · YES if: {m.criteria}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge market={m} />
          {m.status === "open" && <div className="mt-2 font-mono text-lg">⏱ {timeLeft(m.closesAt, now)}</div>}
          <div className="mt-1 text-xs text-white/40">
            by @{m.creator.handle} · vol {credits(m.volumeCredits)}
          </div>
        </div>
      </div>

      {m.resolution && <ResolutionPanel market={m} yn={yn} meId={me.id} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <div className="text-xs uppercase text-emerald-300/70">Yes</div>
                <span className="font-mono text-4xl text-emerald-300">{cents(yes)}</span>
                <span
                  className={`ml-2 font-mono text-sm ${change >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}¢
                </span>
              </div>
              <div>
                <div className="text-xs uppercase text-rose-300/70">No</div>
                <span className="font-mono text-4xl text-rose-300">{cents(100 - yes)}</span>
              </div>
              <div className="text-sm text-white/40">= the crowd thinks YES is {Math.round(yes)}% likely</div>
            </div>
            <PriceChart points={pts} />
          </div>

          <div className="rounded-xl border border-white/10">
            <div className="border-b border-white/10 px-4 py-2 text-xs uppercase tracking-wider text-white/50">
              Trades
            </div>
            {trades.length === 0 && (
              <p className="px-4 py-3 text-sm text-white/40">No trades yet. Be first.</p>
            )}
            <div className="max-h-72 divide-y divide-white/5 overflow-y-auto">
              {trades.map((t) => {
                const side = sideOf(yn, t.outcomeId);
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>
                      <span className="text-white/80">@{t.user.handle}</span>{" "}
                      <span className="text-white/40">{t.side === "buy" ? "bought" : "sold"}</span>{" "}
                      <span className={side === "YES" ? "text-emerald-300" : "text-rose-300"}>
                        {t.shares} {side}
                      </span>
                    </span>
                    <span className="font-mono text-white/50">
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
            <TradeTicket market={m} yn={yn} balance={me.balance} positions={positions} />
          ) : (
            m.status !== "resolved" && (
              <div className="rounded-xl border border-white/10 p-4 text-sm text-white/60">
                Trading has stopped. Waiting for the judge…
              </div>
            )
          )}

          <div className="rounded-xl border border-white/10 p-4 text-sm">
            <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Your shares</div>
            {holding ? (
              <div className="space-y-1 font-mono">
                {!!yesHeld?.shares && (
                  <div className="flex justify-between text-emerald-300">
                    <span>{yesHeld.shares} YES</span>
                    <span>{credits(yesHeld.shares * yes)}</span>
                  </div>
                )}
                {!!noHeld?.shares && (
                  <div className="flex justify-between text-rose-300">
                    <span>{noHeld.shares} NO</span>
                    <span>{credits(noHeld.shares * (100 - yes))}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-1 text-white/60">
                  <span>Paid</span>
                  <span>{credits(basis)}</span>
                </div>
                <div
                  className={`flex justify-between ${value - basis >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  <span>Gain / loss</span>
                  <span>{signedCredits(value - basis)}</span>
                </div>
              </div>
            ) : (
              <p className="text-white/40">None yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
