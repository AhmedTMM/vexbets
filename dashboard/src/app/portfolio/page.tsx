"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { cents, credits, signedCredits } from "@/lib/format";
import { useMe, usePoll } from "@/lib/hooks";
import { yesCents, yesNo } from "@/lib/market";

export default function PortfolioPage() {
  const { data: me } = useMe();
  const { data } = usePoll(async () => {
    const [{ positions }, { markets }] = await Promise.all([
      api("listPositions"),
      api("listMarkets", { query: { limit: 100 } }),
    ]);
    return { positions, markets };
  }, "portfolio");
  if (!data || !me) return null;

  const rows = data.markets
    .map((m) => {
      const yn = yesNo(m);
      const mine = data.positions.filter((p) => p.marketId === m.id);
      if (!yn || mine.length === 0) return null;
      const yesP = mine.find((p) => p.outcomeId === yn.yes.id);
      const noP = mine.find((p) => p.outcomeId === yn.no.id);
      const yes = yesCents(m, yn);
      const value = (yesP?.shares ?? 0) * yes + (noP?.shares ?? 0) * (100 - yes);
      const basis = (yesP?.costBasis ?? 0) + (noP?.costBasis ?? 0);
      const paid = m.resolution?.payouts.find((p) => p.userId === me.id)?.credits ?? 0;
      return { m, yesShares: yesP?.shares ?? 0, noShares: noP?.shares ?? 0, yes, value, basis, paid };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const open = rows.filter((r) => r.m.status === "open");
  const openValue = open.reduce((a, r) => a + r.value, 0);
  const realised = rows.filter((r) => r.m.status === "resolved").reduce((a, r) => a + r.paid - r.basis, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Portfolio</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Cash" value={credits(me.balance)} />
        <Stat label="Open shares worth" value={credits(openValue)} />
        <Stat
          label="Won / lost on settled"
          value={signedCredits(realised)}
          tone={realised >= 0 ? "up" : "down"}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-4 py-2 font-normal">Market</th>
              <th className="px-4 py-2 text-right font-normal">YES</th>
              <th className="px-4 py-2 text-right font-normal">NO</th>
              <th className="px-4 py-2 text-right font-normal">Paid</th>
              <th className="px-4 py-2 text-right font-normal">Worth / paid out</th>
              <th className="px-4 py-2 text-right font-normal">Gain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-white/40">
                  No shares yet.{" "}
                  <Link href="/" className="text-sky-400">
                    Find a market
                  </Link>
                  .
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const worth = r.m.status === "resolved" ? r.paid : r.value;
              const gain = worth - r.basis;
              return (
                <tr key={r.m.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/markets/${r.m.id}`} className="hover:text-sky-300">
                      {r.m.question}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/40">
                      <StatusBadge market={r.m} />
                      {r.m.status === "open" && <span>YES {cents(r.yes)}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-300">{r.yesShares || "–"}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-300">{r.noShares || "–"}</td>
                  <td className="px-4 py-3 text-right font-mono">{credits(r.basis)}</td>
                  <td className="px-4 py-3 text-right font-mono">{credits(worth)}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${gain >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                  >
                    {signedCredits(gain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl ${tone === "up" ? "text-emerald-300" : tone === "down" ? "text-rose-300" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
