"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FeaturedMarket } from "@/components/FeaturedMarket";
import { type MarketFilter, MarketsPanel } from "@/components/MarketsPanel";
import { api } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import type { Side } from "@/lib/market";

export default function Home() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

/**
 * The home screen, Kalshi style: the selected market across the full width at the top,
 * then every market as a grid of cards. The top bar's Open / Settled tabs filter the grid
 * through ?tab=.
 */
function Dashboard() {
  const tab = useSearchParams().get("tab");
  const filter: MarketFilter = tab === "open" || tab === "settled" ? tab : "all";
  const [selected, setSelected] = useState<string | null>(null);
  const marketRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Show a market straight away: the newest open one, until the user picks another.
  const { data: open } = usePoll(
    async () => (await api("listMarkets", { query: { status: "open", limit: 1 } })).markets,
    "newest-open",
    3000,
  );
  const newest = open?.[0]?.id ?? null;
  useEffect(() => {
    if (!selected && newest) setSelected(newest);
  }, [selected, newest]);

  // Picking Open or Settled in the top bar brings the filtered grid into view.
  // Waits a moment so a page opened straight on ?tab= has laid out the market above first.
  useEffect(() => {
    if (filter === "all") return;
    const t = setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => clearTimeout(t);
  }, [filter]);

  /** Show a market at the top and scroll back up to it. */
  const select = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => marketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  /** A Yes / No pill: select the market and load that side in its buy ticket. The ticket
   *  mounts once the market has loaded, so the pick is sent again shortly after. */
  const pick = (marketId: string, side: Side) => {
    select(marketId);
    const send = () =>
      window.dispatchEvent(new CustomEvent("vexbets:pick-side", { detail: { marketId, side } }));
    send();
    for (const ms of [250, 800]) setTimeout(send, ms);
  };

  return (
    <div className="space-y-12 sm:space-y-16">
      {/* scroll-mt clears the sticky two-row top bar. */}
      <div ref={marketRef} className="min-w-0 scroll-mt-[120px]">
        <FeaturedMarket marketId={selected} />
      </div>
      <div ref={listRef} className="scroll-mt-[120px]">
        <MarketsPanel
          filter={filter}
          selectedId={selected}
          onSelect={select}
          onPick={pick}
          onCreated={(m) => select(m.id)}
        />
      </div>
    </div>
  );
}
