"use client";

import { Button } from "@heroui/react";
import type { Market } from "@vexbets/contract";
import type { ReactNode } from "react";
import { Flash } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { cents, timeLeft } from "@/lib/format";
import { useNow, usePoll } from "@/lib/hooks";
import { yesCents, yesNo } from "@/lib/market";

/**
 * All markets as small cards (picking one shows it in the chart above), with the New
 * market form folded away under "+ New market".
 */
export function MarketsPanel({
  selectedId,
  onSelect,
  creating,
  onToggleCreate,
  form,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  creating: boolean;
  onToggleCreate: () => void;
  form: ReactNode;
}) {
  const now = useNow();
  const { data, error } = usePoll(
    async () => (await api("listMarkets", { query: { limit: 100 } })).markets,
    "markets",
  );
  const open = data?.filter((m) => m.status === "open") ?? [];
  const done = data?.filter((m) => m.status !== "open") ?? [];

  return (
    <section
      aria-label="Markets"
      className="panel flex flex-col overflow-hidden min-[1100px]:max-h-[calc(100dvh-112px)]"
    >
      <div className="flex items-center justify-between gap-3 border-line border-b px-4 py-3.5">
        <h2 className="flex items-baseline gap-2">
          <span className="font-semibold text-[17px]">Open markets</span>
          <span className="meta">{open.length}</span>
        </h2>
        <Button
          size="sm"
          variant={creating ? "tertiary" : "primary"}
          onPress={onToggleCreate}
          aria-expanded={creating}
          aria-controls="new-market"
        >
          {creating ? "Close" : "+ New market"}
        </Button>
      </div>

      <div className="scroll-y min-h-0 flex-1">
        {creating && (
          <div id="new-market" className="fade-in border-line border-b bg-raised/40 p-4">
            {form}
          </div>
        )}
        {error && !data && <p className="p-4 text-no text-sm">Could not load markets: {error.message}</p>}
        {data && open.length === 0 && !creating && (
          <p className="px-4 py-6 text-muted text-sm">No open markets yet. Press New market to start one.</p>
        )}
        <ul className="divide-y divide-line">
          {open.map((m) => (
            <li key={m.id}>
              <MarketRow m={m} now={now} selected={m.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
        </ul>

        {done.length > 0 && (
          <>
            <h3 className="label border-line border-y bg-bg/40 px-4 py-2">Settled</h3>
            <ul className="divide-y divide-line">
              {done.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    aria-pressed={m.id === selectedId}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-raised aria-pressed:bg-raised"
                  >
                    <span className="truncate text-muted">{m.question}</span>
                    <StatusBadge market={m} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function MarketRow({
  m,
  now,
  selected,
  onSelect,
}: {
  m: Market;
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const yn = yesNo(m);
  if (!yn) return null;
  const yes = yesCents(m, yn);
  const msLeft = Date.parse(m.closesAt) - now;
  const urgent = msLeft > 0 && msLeft < 60_000;

  return (
    <button
      type="button"
      onClick={() => onSelect(m.id)}
      aria-pressed={selected}
      className={`relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-raised ${selected ? "bg-raised" : ""}`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-yes" />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-medium text-[15px] leading-snug">{m.question}</span>
        <span className="meta mt-1 block">
          {m.subjectName} · #{m.bandNumber} ·{" "}
          <span className={urgent ? "font-medium text-no" : ""}>{timeLeft(m.closesAt, now)}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Flash value={yes} className="display block text-[30px] text-yes">
          {cents(yes)}
        </Flash>
        <span className="display block text-[15px] text-no">NO {cents(100 - yes)}</span>
      </span>
    </button>
  );
}
