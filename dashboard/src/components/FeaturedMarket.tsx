"use client";

import Link from "next/link";
import { BandStrip } from "@/components/BandStrip";
import { Flash } from "@/components/Flash";
import { Holdings } from "@/components/Holdings";
import { PriceChart } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { TradeTicket } from "@/components/TradeTicket";
import { api } from "@/lib/api";
import { cents, credits, timeLeft } from "@/lib/format";
import { useMe, useNow, usePoll } from "@/lib/hooks";
import { type PricePoint, priceHistory, yesCents, yesChange, yesNo } from "@/lib/market";

// An illustration of how a market moves, shown until a real market is opened or picked.
const EXAMPLE_PROMPT = `Will Ahmed say "no cap" before lunch?`;
const EXAMPLE_YES = [50, 50, 54, 47, 52, 61, 58, 66, 63, 71, 69, 77, 74, 100];
const EXAMPLE: PricePoint[] = EXAMPLE_YES.map((yes, i) => ({ t: i * 50_000, yes, no: 100 - yes }));
const minutes = (t: number) =>
  `${Math.floor(t / 60_000)}:${String(Math.floor((t % 60_000) / 1000)).padStart(2, "0")}`;

function Prices({ yes, change }: { yes: number; change: number }) {
  return (
    <div className="flex items-end gap-8">
      <div>
        <div className="label">Yes</div>
        <Flash value={yes} className="num font-semibold text-[44px] text-yes leading-none tracking-tight">
          {cents(yes)}
        </Flash>
        <span className={`num ml-2 text-sm ${change >= 0 ? "text-yes" : "text-no"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}¢
        </span>
      </div>
      <div>
        <div className="label">No</div>
        <Flash
          value={100 - yes}
          className="num font-semibold text-[44px] text-no leading-none tracking-tight"
        >
          {cents(100 - yes)}
        </Flash>
      </div>
    </div>
  );
}

export function FeaturedMarket({ marketId }: { marketId: string | null }) {
  return marketId ? <LiveMarket marketId={marketId} /> : <ExampleMarket />;
}

function ExampleMarket() {
  return (
    <section className="panel p-6" aria-label="Example market">
      <div className="flex items-center justify-between gap-3">
        <span className="meta">example · Ahmed · band #41</span>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-medium text-muted text-xs">
          Example
        </span>
      </div>
      <h2 className="mt-2 font-semibold text-3xl tracking-tight">{EXAMPLE_PROMPT}</h2>
      <div className="mt-5">
        <Prices yes={74} change={24} />
      </div>
      <div className="mt-5">
        <PriceChart points={EXAMPLE} height={360} timeFormat={minutes} />
      </div>
      <p className="mt-4 text-muted text-sm">
        Friends buy YES or NO shares, and the price moves with every trade. When the band hears it, YES pays
        $1 a share. Open a market to see yours here.
      </p>
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
    <section className="panel p-6" aria-label="Selected market">
      <div className="flex items-center justify-between gap-3">
        <span className="meta">
          {m.subjectName} · band #{m.bandNumber} · vol {credits(m.volumeCredits)}
        </span>
        <div className="flex items-center gap-3">
          {open && (
            <span className={`num text-sm ${urgent ? "font-semibold text-no" : "text-muted"}`}>
              ⏱ {timeLeft(m.closesAt, now)}
            </span>
          )}
          <StatusBadge market={m} />
        </div>
      </div>
      <h2 className="mt-2 font-semibold text-3xl tracking-tight">{m.question}</h2>

      <div className="mt-6 grid gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Prices yes={yes} change={yesChange(pts)} />
          <div className="mt-5">
            <PriceChart points={pts} height={360} />
          </div>
          {r && (
            <div className="mt-4 rounded-xl border border-line bg-raised p-4 text-sm">
              <p>{r.decision.rationale}</p>
              {r.decision.evidence[0] && (
                <p className="mt-1 text-muted italic">“{r.decision.evidence[0].quote}”</p>
              )}
            </div>
          )}
          <Link
            href={`/markets/${m.id}`}
            className="meta mt-3 inline-block underline-offset-4 hover:text-ink hover:underline"
          >
            Trades, proof and details
          </Link>
        </div>
        <div className="space-y-3">
          {open && <TradeTicket market={m} yn={yn} balance={me.balance} />}
          <Holdings market={m} yn={yn} positions={positions} />
        </div>
      </div>
      {open && (
        <div className="mt-6">
          <BandStrip market={m} />
        </div>
      )}
    </section>
  );
}
