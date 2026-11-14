import type { Market } from "@vexbets/contract";
import { yesNo } from "@/lib/market";

export function StatusBadge({ market }: { market: Market }) {
  const base = "rounded-full px-2.5 py-0.5 text-xs";
  switch (market.status) {
    case "open":
      return <span className={`${base} bg-sky-500/15 text-sky-300`}>Open</span>;
    case "closed":
      return <span className={`${base} bg-white/10 text-white/70`}>Closed · judging</span>;
    case "voided":
      return <span className={`${base} bg-white/10 text-white/50`}>Voided · refunded</span>;
    case "resolved": {
      const yn = yesNo(market);
      const yes = yn && market.resolution?.outcomeId === yn.yes.id;
      return yes ? (
        <span className={`${base} bg-emerald-500/15 text-emerald-300`}>Settled YES</span>
      ) : (
        <span className={`${base} bg-rose-500/15 text-rose-300`}>Settled NO</span>
      );
    }
  }
}
