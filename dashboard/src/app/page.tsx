"use client";

import { useEffect, useRef, useState } from "react";
import { FeaturedMarket } from "@/components/FeaturedMarket";
import { MarketsPanel } from "@/components/MarketsPanel";
import { NewMarketForm } from "@/components/NewMarketForm";
import { api } from "@/lib/api";
import { usePoll } from "@/lib/hooks";

/**
 * The demo screen, everything visible at once: open markets as a watchlist on the left
 * (with New market folded inside it), the selected market with its buy ticket on the right.
 */
export default function Dashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const marketRef = useRef<HTMLDivElement>(null);

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

  /** Open a market. On a phone the market sits above the list, so scroll back up to it. */
  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1099.98px)").matches) {
      requestAnimationFrame(() => marketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="grid items-start gap-6 min-[1100px]:grid-cols-[340px_minmax(0,1fr)]">
      <div className="min-[1100px]:sticky min-[1100px]:top-[88px]">
        <MarketsPanel
          selectedId={selected}
          onSelect={select}
          creating={creating}
          onToggleCreate={() => setCreating((c) => !c)}
          form={
            <NewMarketForm
              onCreated={(m) => {
                select(m.id);
                setCreating(false);
              }}
            />
          }
        />
      </div>
      {/* scroll-mt clears the sticky top bar (two rows on a phone) when scrolled to. */}
      {/* On a phone the selected market comes first, above the list; with none, nothing. */}
      <div
        ref={marketRef}
        className={`order-first min-w-0 scroll-mt-[120px] md:scroll-mt-[88px] min-[1100px]:order-none ${selected ? "" : "hidden min-[1100px]:block"}`}
      >
        <FeaturedMarket marketId={selected} />
      </div>
    </div>
  );
}
