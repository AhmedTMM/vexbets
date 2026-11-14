import type { Market } from "@vexbets/contract";
import { yesNo } from "@/lib/market";

function Pill({ tone, children }: { tone: string; children: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-medium text-xs ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusBadge({ market }: { market: Market }) {
  switch (market.status) {
    case "open":
      return <Pill tone="border-accent/25 bg-accent/10 text-accent">Open</Pill>;
    case "closed":
      return <Pill tone="border-line-strong bg-raised text-muted">Closed · judging</Pill>;
    case "voided":
      return <Pill tone="border-line-strong bg-raised text-muted">Voided · refunded</Pill>;
    case "resolved": {
      const yn = yesNo(market);
      const yes = yn && market.resolution?.outcomeId === yn.yes.id;
      return yes ? (
        <Pill tone="border-yes/25 bg-yes/10 text-yes">Settled YES</Pill>
      ) : (
        <Pill tone="border-no/25 bg-no/10 text-no">Settled NO</Pill>
      );
    }
  }
}
