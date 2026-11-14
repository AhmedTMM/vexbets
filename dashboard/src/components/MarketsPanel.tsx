"use client";

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
    <section aria-label="Markets" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2">
          <span className="font-semibold text-xl">Open markets</span>
          <span className="meta">{open.length}</span>
        </h2>
        <button
          type="button"
          onClick={onToggleCreate}
          aria-expanded={creating}
          aria-controls="new-market"
          className={`btn h-9 ${creating ? "btn-ghost" : "btn-primary"}`}
        >
          {creating ? "Close" : "+ New market"}
        </button>
      </div>
      {creating && (
        <div id="new-market" className="panel fade-in p-6">
          <h3 className="mb-4 font-semibold text-lg">New market</h3>
          {form}
        </div>
      )}
      {error && !data && <p className="text-no text-sm">Could not load markets: {error.message}</p>}
      {data && open.length === 0 && !creating && (
        <p className="panel border-dashed px-5 py-6 text-muted text-sm">
          No open markets yet. Press New market to start one.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {open.map((m) => (
          <MarketCard key={m.id} m={m} now={now} selected={m.id === selectedId} onSelect={onSelect} />
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="label pt-3">Settled</h2>
          <div className="panel divide-y divide-line overflow-hidden">
            {done.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => onSelect(m.id)}
                aria-pressed={m.id === selectedId}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-raised aria-pressed:bg-raised"
              >
                <span className="truncate">{m.question}</span>
                <StatusBadge market={m} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MarketCard({
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
      className={`panel flex flex-col gap-3 p-4 text-left transition-[border-color,box-shadow] duration-150 hover:border-line-strong ${selected ? "border-ink! shadow-[0_0_0_1px_var(--color-ink)]" : ""}`}
    >
      <span className="meta">
        {m.subjectName} · #{m.bandNumber}
      </span>
      <span className="font-semibold leading-snug">{m.question}</span>
      <span className="mt-auto flex items-end justify-between gap-3">
        <span className="flex gap-4">
          <span>
            <span className="label block">Yes</span>
            <Flash value={yes} className="num font-semibold text-xl text-yes">
              {cents(yes)}
            </Flash>
          </span>
          <span>
            <span className="label block">No</span>
            <Flash value={100 - yes} className="num font-semibold text-xl text-no">
              {cents(100 - yes)}
            </Flash>
          </span>
        </span>
        <span className={`num text-sm ${urgent ? "font-semibold text-no" : "text-muted"}`}>
          ⏱ {timeLeft(m.closesAt, now)}
        </span>
      </span>
    </button>
  );
}
