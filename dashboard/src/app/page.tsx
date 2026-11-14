"use client";

import { useRef, useState } from "react";
import { FeaturedMarket } from "@/components/FeaturedMarket";
import { MarketsPanel } from "@/components/MarketsPanel";
import { NewMarketForm } from "@/components/NewMarketForm";

/**
 * The demo screen, everything visible at once: open markets as a watchlist on the left
 * (with New market folded inside it), the selected market with its buy ticket on the right.
 */
export default function Dashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const marketRef = useRef<HTMLDivElement>(null);

  /** Open a market. On a phone the market sits below the list, so scroll it into view. */
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
      <div ref={marketRef} className="min-w-0 scroll-mt-[120px] md:scroll-mt-[88px]">
        <FeaturedMarket marketId={selected} />
      </div>
    </div>
  );
}
