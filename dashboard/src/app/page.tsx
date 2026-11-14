"use client";

import { useState } from "react";
import { FeaturedMarket } from "@/components/FeaturedMarket";
import { MarketsPanel } from "@/components/MarketsPanel";
import { NewMarketForm } from "@/components/NewMarketForm";

/**
 * The demo screen: the featured market full width (empty until one is opened or
 * picked), then every market, with the New market form folded away under them.
 */
export default function Dashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-8">
      <FeaturedMarket marketId={selected} />
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
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        }
      />
    </div>
  );
}
