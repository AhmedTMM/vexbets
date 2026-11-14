import { Chip } from "@heroui/react";
import type { Market } from "@vexbets/contract";
import { yesNo } from "@/lib/market";

type Tone = "accent" | "default" | "success" | "danger";

function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <Chip size="sm" variant="soft" color={tone} className="whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}

export function StatusBadge({ market }: { market: Market }) {
  switch (market.status) {
    case "open":
      return <Pill tone="accent">Open</Pill>;
    case "closed":
      return <Pill tone="default">Closed · judging</Pill>;
    case "voided":
      return <Pill tone="default">Voided · refunded</Pill>;
    case "resolved": {
      const yn = yesNo(market);
      const yes = yn && market.resolution?.outcomeId === yn.yes.id;
      return yes ? <Pill tone="success">Settled YES</Pill> : <Pill tone="danger">Settled NO</Pill>;
    }
  }
}
