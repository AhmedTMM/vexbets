"use client";

import { useState } from "react";
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

  return (
    <div className="grid items-start gap-6 min-[1100px]:grid-cols-[340px_minmax(0,1fr)]">
      <div className="min-[1100px]:sticky min-[1100px]:top-[88px]">
        <MarketsPanel
          selectedId={selected}
          onSelect={setSelected}
          creating={creating}
          onToggleCreate={() => setCreating((c) => !c)}
          form={
            <NewMarketForm
              onCreated={(m) => {
                setSelected(m.id);
                setCreating(false);
              }}
            />
          }
        />
      </div>
      <FeaturedMarket marketId={selected} />
    </div>
  );
}
