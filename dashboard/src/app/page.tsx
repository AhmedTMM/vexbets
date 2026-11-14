"use client";

import type { Market, Trade } from "@vexbets/contract";
import Link from "next/link";
import { Sparkline } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { cents, credits, timeLeft } from "@/lib/format";
import { useNow, usePoll } from "@/lib/hooks";
import { priceHistory, yesCents, yesChange, yesNo } from "@/lib/market";

export default function MarketsPage() {
  const now = useNow();
  const { data, error } = usePoll(async () => {
    const { markets } = await api("listMarkets", { query: { limit: 100 } });
    const trades = await Promise.all(
      markets.map((m) => api("listTrades", { params: { marketId: m.id }, query: { limit: 100 } })),
    );
    return markets.map((m, i) => ({ m, trades: trades[i]?.trades ?? [] }));
  }, "markets");

  if (error && !data) return <p className="text-rose-400">Could not load markets: {error.message}</p>;
  if (!data) return null;
  const open = data.filter((d) => d.m.status === "open");
  const done = data.filter((d) => d.m.status !== "open");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Markets</h1>
          <p className="text-sm text-white/50">
            Buy YES if you think the band will hear it before the market closes, NO if not.
          </p>
        </div>
        <Link
          href="/markets/new"
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-black hover:bg-sky-400"
        >
          + New market
        </Link>
      </div>

      {open.length === 0 && <p className="text-white/50">No open markets yet. Start one.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {open.map(({ m, trades }) => (
          <MarketCard key={m.id} m={m} trades={trades} now={now} />
        ))}
      </div>

      {done.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm uppercase tracking-wider text-white/40">Closed and settled</h2>
          <div className="divide-y divide-white/5 rounded-xl border border-white/10">
            {done.map(({ m }) => (
              <Link
                key={m.id}
                href={`/markets/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5"
              >
                <span>{m.question}</span>
                <StatusBadge market={m} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ m, trades, now }: { m: Market; trades: Trade[]; now: number }) {
  const yn = yesNo(m);
  if (!yn) return null;
  const pts = priceHistory(m, yn, trades, now);
  const yes = yesCents(m, yn);
  const change = yesChange(pts);
  return (
    <Link
      href={`/markets/${m.id}`}
      className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-sky-400/50"
    >
      <div className="text-xs text-white/40">
        {m.subjectName} · band #{m.bandNumber}
      </div>
      <div className="mt-1 font-medium leading-snug group-hover:text-sky-300">{m.question}</div>
      <div className="mt-0.5 text-xs text-white/50">{m.tagline}</div>
      <div className="mt-3">
        <Sparkline points={pts} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
          <div className="text-[11px] uppercase text-emerald-300/70">Yes</div>
          <div className="font-mono text-xl text-emerald-300">
            {cents(yes)}
            <span className={`ml-2 text-xs ${change >= 0 ? "text-emerald-300/70" : "text-rose-300/70"}`}>
              {change >= 0 ? "▲" : "▼"}
              {Math.abs(Math.round(change))}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-rose-500/10 px-3 py-2">
          <div className="text-[11px] uppercase text-rose-300/70">No</div>
          <div className="font-mono text-xl text-rose-300">{cents(100 - yes)}</div>
        </div>
      </div>
      <div className="mt-3 flex justify-between text-xs text-white/50">
        <span>Vol {credits(m.volumeCredits)}</span>
        <span>⏱ {timeLeft(m.closesAt, now)}</span>
      </div>
    </Link>
  );
}
