"use client";

import type { Market, Position, Trade } from "@vexbets/contract";
import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";
import { Flash } from "@/components/Flash";
import { Holdings } from "@/components/Holdings";
import { PriceChart } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { TradeTicket } from "@/components/TradeTicket";
import { api } from "@/lib/api";
import { credits } from "@/lib/format";
import { useMe, useNow, usePoll } from "@/lib/hooks";
import {
  type PricePoint,
  priceHistory,
  type Side,
  type YesNo,
  yesCents,
  yesChange,
  yesNo,
} from "@/lib/market";

const HOUR = 3_600_000;
const RANGES = [
  { key: "1H", ms: HOUR },
  { key: "1D", ms: 24 * HOUR },
  { key: "1W", ms: 7 * 24 * HOUR },
  { key: "ALL", ms: Number.POSITIVE_INFINITY },
] as const;
type Range = (typeof RANGES)[number]["key"];

/** The last `ms` of a series, starting with the price as it stood at the window's start. */
function windowed(points: PricePoint[], ms: number): PricePoint[] {
  const end = points.at(-1)?.t;
  const first = points[0];
  if (end === undefined || !first || !Number.isFinite(ms)) return points;
  const start = end - ms;
  if (first.t >= start) return points;
  const before = points.filter((p) => p.t <= start).at(-1) ?? first;
  return [{ ...before, t: start }, ...points.filter((p) => p.t > start)];
}

/** "just now", "2m ago", "3h ago", "4d ago". */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Price in cents of buying one share now (what the button costs), or the price if it can't be quoted. */

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[2px] shrink-0 text-yes">
      <path
        fill="currentColor"
        d="M8 1.5c.3 2.9 1.6 4.2 4.5 4.5-2.9.3-4.2 1.6-4.5 4.5-.3-2.9-1.6-4.2-4.5-4.5 2.9-.3 4.2-1.6 4.5-4.5Z"
      />
      <path
        fill="currentColor"
        opacity="0.7"
        d="M12.5 10c.15 1.4.8 2.05 2.2 2.2-1.4.15-2.05.8-2.2 2.2-.15-1.4-.8-2.05-2.2-2.2 1.4-.15 2.05-.8 2.2-2.2Z"
      />
    </svg>
  );
}

function Delta({ change }: { change: number }) {
  const d = Math.round(change);
  if (d === 0) return <span className="num text-muted text-xs">0</span>;
  return (
    <span className={`num font-semibold text-xs ${d > 0 ? "text-yes" : "text-no"}`}>
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}

/** The judge's one-line digest: what it decided, or what it is listening for. */
function JudgeLine({ m, now }: { m: Market; now: number }) {
  const r = m.resolution;
  let text: ReactNode;
  let right: string;
  if (r) {
    const quote = r.decision.evidence[0]?.quote;
    text = (
      <>
        {r.decision.rationale}
        {quote && <span className="text-muted italic"> “{quote}”</span>}
      </>
    );
    right = `settled ${ago(r.resolvedAt, now)}`;
  } else if (m.status === "voided") {
    text = "Voided. Every trade was refunded.";
    right = "voided";
  } else if (m.status === "closed" || Date.parse(m.closesAt) <= now) {
    text = "Trading has stopped. Reading the transcript to settle it.";
    right = "judging";
  } else {
    text = `Listening on band #${m.bandNumber}: settles YES the moment it's heard`;
    right = "live";
  }
  return (
    <div className="flex items-start gap-2.5 border-line border-t py-4 text-sm">
      <Sparkle />
      <p className="line-clamp-2 min-w-0 flex-1 @min-[640px]:line-clamp-1">
        <strong className="font-semibold">Judge</strong>
        <span className="text-muted"> · </span>
        {text}
      </p>
      <span className="meta shrink-0">{right}</span>
    </div>
  );
}

/** "Chance" table: one row for the YES outcome with its big %, and Yes / No buy pills. */
function ChanceTable({
  m,
  yn,
  change,
  open,
  onPick,
}: {
  m: Market;
  yn: YesNo;
  change: number;
  open: boolean;
  onPick: (side: Side) => void;
}) {
  const yes = yesCents(m, yn);
  // The current price of each side, the same figures the ticket shows.
  const yesBuy = Math.round(yes);
  const noBuy = 100 - yesBuy;
  const label = yn.yes.label.toLowerCase() === "yes" ? "Heard" : yn.yes.label;
  const pill =
    "h-12 w-full rounded-full border font-semibold text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 @min-[620px]:w-[210px]";
  return (
    <div className="@container border-line border-t">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-2.5 @min-[620px]:grid-cols-[minmax(0,1fr)_112px_auto]">
        <span />
        <span className="text-center text-muted text-xs">Chance</span>
        <span className="hidden @min-[620px]:block @min-[620px]:w-[432px]" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-line border-t py-4 @min-[620px]:grid-cols-[minmax(0,1fr)_112px_auto]">
        <div className="min-w-0 truncate text-[17px]">{label}</div>
        <div className="flex items-center justify-center gap-1.5">
          <Flash value={yes} className="display text-[36px]">
            {Math.round(yes)}%
          </Flash>
          <Delta change={change} />
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3 @min-[620px]:col-span-1 @min-[620px]:flex">
          <button
            type="button"
            disabled={!open}
            data-pick="YES"
            onClick={() => onPick("YES")}
            className={`${pill} border-yes/40 bg-yes/[0.06] text-yes enabled:hover:bg-yes/15`}
          >
            Yes {yesBuy}¢
          </button>
          <button
            type="button"
            disabled={!open}
            data-pick="NO"
            onClick={() => onPick("NO")}
            className={`${pill} border-no/40 bg-no/[0.06] text-no enabled:hover:bg-no/15`}
          >
            No {noBuy}¢
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A market laid out like a prediction-market page: header, legend, chart, range tabs,
 * the judge's digest and the chance table on the left; the buy ticket in a sticky column
 * on the right. In a narrow container (under ~960 px: phones, or the home page next to the
 * watchlist) it stacks as header, chance, ticket, chart and the rest.
 */
export function MarketView({
  m,
  yn,
  trades,
  positions,
  balance,
  now,
  children,
}: {
  m: Market;
  yn: YesNo;
  trades: Trade[];
  positions: Position[];
  balance: number;
  now: number;
  /** Extra sections under the chance table (trades, proof, details). */
  children?: ReactNode;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const ticketRef = useRef<HTMLDivElement>(null);
  const all = priceHistory(m, yn, trades, now);
  const pts = windowed(all, RANGES.find((r) => r.key === range)?.ms ?? Number.POSITIVE_INFINITY);
  const yes = yesCents(m, yn);
  const change = yesChange(all);
  const open = m.status === "open" && Date.parse(m.closesAt) > now;

  // Tell the trade ticket which side to buy (the TradeTicket listens for this event). On a
  // stacked layout the ticket sits above the pills, so bring it back into view.
  const onPick = (side: Side) => {
    window.dispatchEvent(new CustomEvent("vexbets:pick-side", { detail: { marketId: m.id, side } }));
    const box = ticketRef.current?.getBoundingClientRect();
    if (box && box.top < 80) ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="@container">
      <div className="grid items-start @min-[960px]:grid-cols-[minmax(0,1fr)_380px] @min-[960px]:gap-x-10">
        <div className="min-w-0 @max-[960px]:contents">
          <header className="order-1">
            <div className="flex items-center justify-between gap-3">
              <span className="label truncate">
                Band #{m.bandNumber} · {m.subjectName}
              </span>
              <StatusBadge market={m} now={now} big />
            </div>
            <h1 className="headline mt-3 text-[32px] @min-[640px]:text-[44px]">{m.question}</h1>
            <p className="mt-2 truncate text-[15px] text-muted">{m.criteria}</p>
          </header>

          <div className="order-2 mt-6">
            <div className="mb-3 flex items-baseline gap-2 @min-[960px]:hidden">
              <Flash value={yes} className="display text-[44px] text-yes">
                {Math.round(yes)}%
              </Flash>
              <span className="text-muted text-sm">chance</span>
              <Delta change={change} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-yes" aria-hidden="true" />
                {yn.yes.label}
                <strong className="num font-semibold">{Math.round(yes)}%</strong>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-no" aria-hidden="true" />
                {yn.no.label}
                <strong className="num font-semibold">{Math.round(100 - yes)}%</strong>
              </span>
            </div>
          </div>

          <div className="order-4 mt-6 h-[220px] @min-[960px]:mt-4 @min-[640px]:h-[300px]">
            <PriceChart points={pts} height="100%" />
          </div>

          <div className="order-5 mt-3 flex items-center justify-between gap-4 pb-3">
            <span className="meta num">{credits(m.volumeCredits)} vol</span>
            <fieldset className="flex items-center gap-1" aria-label="Chart range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={`h-8 min-w-9 rounded-md px-2 font-semibold text-xs transition-colors hover:text-ink ${
                    range === r.key ? "bg-raised text-ink" : "text-muted"
                  }`}
                >
                  {r.key}
                </button>
              ))}
            </fieldset>
          </div>

          <div className="order-6">
            <JudgeLine m={m} now={now} />
          </div>

          <div className="order-7">
            <ChanceTable m={m} yn={yn} change={change} open={open} onPick={onPick} />
          </div>

          {children && <div className="order-8 mt-2 space-y-10">{children}</div>}
        </div>

        <div
          ref={ticketRef}
          className="order-3 mt-6 w-full space-y-3 self-start @min-[960px]:sticky @min-[960px]:top-[88px] @min-[960px]:mt-0 @max-[960px]:max-w-[520px]"
        >
          {open ? (
            <TradeTicket market={m} yn={yn} balance={balance} />
          ) : (
            m.status !== "resolved" &&
            m.status !== "voided" && (
              <div className="rounded-2xl border border-line p-4 text-muted text-sm">
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

export function FeaturedMarket({ marketId }: { marketId: string | null }) {
  return marketId ? <LiveMarket marketId={marketId} /> : <NoMarket />;
}

function NoMarket() {
  return (
    <section className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-line border-dashed p-6 text-center">
      <h2 className="headline text-[26px]">No market open</h2>
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

  if (error && !data) return <section className="p-6 text-muted">{error.message}</section>;
  if (!data || !me) return <section className="h-[420px]" aria-busy="true" />;
  const { market: m, trades, positions } = data;
  const yn = yesNo(m);
  if (!yn) return null;

  return (
    <section aria-label="Selected market">
      <MarketView
        key={m.id}
        m={m}
        yn={yn}
        trades={trades}
        positions={positions}
        balance={me.balance}
        now={now}
      >
        <Link
          href={`/markets/${m.id}`}
          className="meta inline-flex h-10 items-center underline-offset-4 hover:text-ink hover:underline"
        >
          Trades, proof and details →
        </Link>
      </MarketView>
    </section>
  );
}
