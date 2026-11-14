"use client";

import type { Market, Position, Trade } from "@vexbets/contract";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { cents, clock, credits, signedCredits } from "@/lib/format";
import { useMe, usePoll } from "@/lib/hooks";
import { sideOf, yesCents, yesNo } from "@/lib/market";
import { type ValuePoint, valueSeries } from "@/lib/portfolio";
import { SellButton } from "./SellButton";

type Tab = "positions" | "history" | "fills";

interface Row {
  m: Market;
  p: Position;
  side: "YES" | "NO";
  price: number;
}

/**
 * Your account, Kalshi style: total balance with its change and a graph over time, then
 * your positions (sell from here), settled history and every fill.
 */
export function PortfolioPanel() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>("positions");
  const { data } = usePoll(
    async () => {
      const [{ positions }, { markets }] = await Promise.all([
        api("listPositions"),
        api("listMarkets", { query: { limit: 100 } }),
      ]);
      const traded = new Set(positions.map((p) => p.marketId));
      const lists = await Promise.all(
        markets
          .filter((m) => traded.has(m.id))
          .map((m) => api("listTrades", { params: { marketId: m.id }, query: { limit: 100 } })),
      );
      return { positions, markets, trades: lists.flatMap((l) => l.trades) };
    },
    "portfolio",
    2500,
  );
  if (!data || !me) return null;

  const byId = new Map(data.markets.map((m) => [m.id, m]));
  const mine = data.trades.filter((t) => t.user.id === me.id);

  // Positions you still hold in markets that haven't settled.
  const open: Row[] = data.positions
    .map((p) => {
      const m = byId.get(p.marketId);
      const yn = m && yesNo(m);
      if (!m || !yn || p.shares <= 0 || m.status === "resolved" || m.status === "voided") return null;
      const side = sideOf(yn, p.outcomeId);
      const yes = yesCents(m, yn);
      return { m, p, side, price: side === "YES" ? yes : 100 - yes };
    })
    .filter((r): r is Row => r !== null);
  const openValue = open.reduce((a, r) => a + r.p.shares * r.price, 0);

  // Settled markets you traded in.
  const history = data.markets
    .filter((m) => m.status === "resolved" && data.positions.some((p) => p.marketId === m.id))
    .map((m) => {
      const yn = yesNo(m);
      const ps = data.positions.filter((p) => p.marketId === m.id);
      const paid = ps.reduce((a, p) => a + p.costBasis, 0);
      const payout = m.resolution?.payouts.find((x) => x.userId === me.id)?.credits ?? 0;
      const sides = yn
        ? [...new Set(mine.filter((t) => t.marketId === m.id).map((t) => sideOf(yn, t.outcomeId)))]
        : [];
      const won = yn ? (m.resolution?.outcomeId === yn.yes.id ? "YES" : "NO") : "?";
      return { m, paid, payout, sides, won, at: m.resolution?.resolvedAt ?? m.closesAt };
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  const total = me.balance + openValue;
  const series = valueSeries(mine, data.markets, me.id, me.balance, total);
  const start = series[0]?.v ?? total;
  const change = total - start;
  const pct = start > 0 ? (change / start) * 100 : 0;

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "positions", label: "Positions", n: open.length },
    { id: "history", label: "History", n: history.length },
    { id: "fills", label: "Fills", n: mine.length },
  ];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="label">Total balance</div>
        <div className="num mt-1 font-bold text-[52px] leading-none tracking-tight">{credits(total)}</div>
        <div className={`num mt-2 font-semibold text-lg ${change >= 0 ? "text-yes" : "text-no"}`}>
          {signedCredits(change)} ({change >= 0 ? "+" : "−"}
          {Math.abs(pct).toFixed(1)}%)
        </div>
        <div className="meta mt-1">
          cash {credits(me.balance)} · in positions {credits(openValue)}
        </div>
        <div className="mt-6">
          <ValueChart points={series} up={change >= 0} />
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-line border-b px-5 py-4">
          <h2 className="font-semibold text-xl">Predictions</h2>
          <div className="flex gap-1 rounded-full border border-line bg-bg p-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`h-8 rounded-full px-4 text-sm transition-colors duration-150 ${tab === t.id ? "bg-raised font-bold text-ink" : "text-muted hover:text-ink"}`}
              >
                {t.label} <span className="num">({t.n})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === "positions" && <PositionsTable rows={open} />}
          {tab === "history" && <HistoryTable rows={history} />}
          {tab === "fills" && <FillsTable trades={mine} byId={byId} />}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- tables

const th = "label whitespace-nowrap px-4 py-3 text-left font-semibold";
const thR = `${th} text-right`;
const td = "px-4 py-3";
const tdR = "num px-4 py-3 text-right";

function SidePill({ side }: { side: "YES" | "NO" | string }) {
  const yes = side === "YES";
  return (
    <span
      className={`num inline-flex h-6 items-center rounded-md px-2 font-bold text-[11px] tracking-wider ${yes ? "bg-yes/12 text-yes" : "bg-no/12 text-no"}`}
    >
      {side}
    </span>
  );
}

function Empty({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}

function MarketCell({ m }: { m: Market }) {
  return (
    <td className={`${td} max-w-[340px]`}>
      <Link
        href={`/markets/${m.id}`}
        className="block truncate font-medium hover:text-yes"
        title={m.question}
      >
        {m.question}
      </Link>
      <span className="meta">
        {m.subjectName} · #{m.bandNumber}
      </span>
    </td>
  );
}

function PositionsTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-line border-b">
        <tr>
          <th className={th}>Market</th>
          <th className={th}>Side</th>
          <th className={thR}>Shares</th>
          <th className={thR}>Avg</th>
          <th className={thR}>Last</th>
          <th className={thR}>Value</th>
          <th className={thR}>P/L</th>
          <th className={thR}>
            <span className="sr-only">Sell</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.length === 0 && (
          <Empty cols={8}>
            No open positions.{" "}
            <Link href="/" className="text-yes hover:underline">
              Find a market
            </Link>
          </Empty>
        )}
        {rows.map((r) => {
          const value = r.p.shares * r.price;
          const pl = value - r.p.costBasis;
          const canSell = r.m.status === "open" && Date.parse(r.m.closesAt) > Date.now();
          return (
            <tr
              key={`${r.m.id}-${r.p.outcomeId}`}
              className="transition-colors duration-150 hover:bg-raised/60"
            >
              <MarketCell m={r.m} />
              <td className={td}>
                <SidePill side={r.side} />
              </td>
              <td className={tdR}>{r.p.shares}</td>
              <td className={tdR}>{cents(r.p.costBasis / r.p.shares)}</td>
              <td className={tdR}>{cents(r.price)}</td>
              <td className={tdR}>{credits(value)}</td>
              <td className={`${tdR} ${pl >= 0 ? "text-yes" : "text-no"}`}>{signedCredits(pl)}</td>
              <td className={`${td} whitespace-nowrap text-right`}>
                <SellButton
                  marketId={r.m.id}
                  outcomeId={r.p.outcomeId}
                  held={r.p.shares}
                  side={r.side}
                  disabled={!canSell}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryTable({
  rows,
}: {
  rows: { m: Market; paid: number; payout: number; sides: string[]; won: string; at: string }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-line border-b">
        <tr>
          <th className={th}>Market</th>
          <th className={th}>You held</th>
          <th className={th}>Result</th>
          <th className={thR}>Paid</th>
          <th className={thR}>Payout</th>
          <th className={thR}>P/L</th>
          <th className={thR}>Settled</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.length === 0 && <Empty cols={7}>No settled markets yet.</Empty>}
        {rows.map((r) => {
          const pl = r.payout - r.paid;
          return (
            <tr key={r.m.id} className="transition-colors duration-150 hover:bg-raised/60">
              <MarketCell m={r.m} />
              <td className={td}>
                <span className="flex gap-1">
                  {r.sides.map((s) => (
                    <SidePill key={s} side={s} />
                  ))}
                </span>
              </td>
              <td className={td}>
                <span className={`font-semibold ${r.payout > 0 ? "text-yes" : "text-no"}`}>
                  {r.payout > 0 ? "Won" : "Lost"}
                </span>{" "}
                <span className="meta">· settled {r.won}</span>
              </td>
              <td className={tdR}>{credits(r.paid)}</td>
              <td className={tdR}>{credits(r.payout)}</td>
              <td className={`${tdR} ${pl >= 0 ? "text-yes" : "text-no"}`}>{signedCredits(pl)}</td>
              <td className={`${tdR} text-muted`}>{clock(r.at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FillsTable({ trades, byId }: { trades: Trade[]; byId: Map<string, Market> }) {
  const sorted = [...trades].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <table className="w-full text-sm">
      <thead className="border-line border-b">
        <tr>
          <th className={th}>Time</th>
          <th className={th}>Market</th>
          <th className={th}>Action</th>
          <th className={th}>Side</th>
          <th className={thR}>Shares</th>
          <th className={thR}>Credits</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {sorted.length === 0 && <Empty cols={6}>No trades yet.</Empty>}
        {sorted.map((t) => {
          const m = byId.get(t.marketId);
          const yn = m && yesNo(m);
          return (
            <tr key={t.id} className="transition-colors duration-150 hover:bg-raised/60">
              <td className={`${td} num whitespace-nowrap text-muted`}>{clock(t.createdAt)}</td>
              {m ? <MarketCell m={m} /> : <td className={td}>?</td>}
              <td className={td}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td className={td}>{yn && <SidePill side={sideOf(yn, t.outcomeId)} />}</td>
              <td className={tdR}>{t.shares}</td>
              <td className={`${tdR} ${t.side === "buy" ? "" : "text-yes"}`}>
                {t.side === "buy" ? "−" : "+"}
                {credits(t.credits)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- balance graph

function ValueChart({ points, up }: { points: ValuePoint[]; up: boolean }) {
  const color = up ? "#00d394" : "#ff4f6a";
  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const pad = Math.max(50, (hi - lo) * 0.25);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2f35" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => clock(v).slice(0, 5)}
          stroke="#6b727a"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          fontFamily="var(--font-mono)"
          minTickGap={60}
        />
        <YAxis domain={[lo - pad, hi + pad]} hide />
        <Tooltip
          contentStyle={{
            background: "#1d2024",
            border: "1px solid #343a41",
            borderRadius: 10,
            color: "#f2f4f5",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
          labelFormatter={(v) => clock(v as number)}
          formatter={(v) => [credits(v as number), "Balance"]}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2.5}
          fill="url(#value-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
