"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { MarketView } from "@/components/FeaturedMarket";
import { ResolutionPanel } from "@/components/ResolutionPanel";
import { api } from "@/lib/api";
import { clock, credits } from "@/lib/format";
import { useMe, useNow, usePoll } from "@/lib/hooks";
import { sideOf, yesNo } from "@/lib/market";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
    1000,
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

  return (
    <div>
      <Link href="/" className="meta mb-3 inline-flex h-9 items-center hover:text-ink">
        ← Markets
      </Link>
      <MarketView m={m} yn={yn} trades={trades} positions={positions} balance={me.balance} now={now}>
        {m.resolution && <ResolutionPanel market={m} yn={yn} meId={me.id} />}

        <section aria-label="Trades" className="border-line border-t pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="headline text-[26px]">Trades</h2>
            <span className="meta">{trades.length}</span>
          </div>
          {trades.length === 0 && <p className="mt-3 text-muted text-sm">No trades yet. Be first.</p>}
          {trades.length > 0 && (
            <div className="scroll-y mt-3 max-h-80 divide-y divide-line border-line border-t">
              {trades.map((t) => {
                const side = sideOf(yn, t.outcomeId);
                return (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 py-2.5 text-sm"
                  >
                    <span>
                      <span className="text-ink">@{t.user.handle}</span>{" "}
                      <span className="text-muted">{t.side === "buy" ? "bought" : "sold"}</span>{" "}
                      <span className={`num font-semibold ${side === "YES" ? "text-yes" : "text-no"}`}>
                        {t.shares} {side}
                      </span>
                    </span>
                    <span className="meta num">
                      {credits(t.credits)} · {clock(t.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section aria-label="Rules" className="border-line border-t pt-6">
          <h2 className="headline text-[26px]">Rules</h2>
          <p className="mt-3 text-[15px] text-ink leading-relaxed">{m.tagline}</p>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="text-muted">Settles YES if</dt>
            <dd>{m.criteria}</dd>
            <dt className="text-muted">Otherwise</dt>
            <dd>Settles NO when the market closes.</dd>
            <dt className="text-muted">Listening</dt>
            <dd>
              Band #{m.bandNumber} on {m.subjectName}
            </dd>
            <dt className="text-muted">Opened</dt>
            <dd className="num">
              {when(m.opensAt)} by @{m.creator.handle}
            </dd>
            <dt className="text-muted">Closes</dt>
            <dd className="num">{when(m.closesAt)}</dd>
          </dl>
        </section>
      </MarketView>
    </div>
  );
}
