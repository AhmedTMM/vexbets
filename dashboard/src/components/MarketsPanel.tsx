"use client";

import { Button, Modal } from "@heroui/react";
import type { Market } from "@vexbets/contract";
import { Flash } from "@/components/Flash";
import { NewMarketForm } from "@/components/NewMarketForm";
import { api } from "@/lib/api";
import { cents, credits, timeLeft } from "@/lib/format";
import { useNow, usePoll } from "@/lib/hooks";
import { type Side, yesCents, yesNo } from "@/lib/market";

export type MarketFilter = "all" | "open" | "settled";

const TITLES: Record<MarketFilter, string> = {
  all: "Markets",
  open: "Open markets",
  settled: "Settled markets",
};

/**
 * Every market as a grid of cards, Kalshi style: band label, question, YES chance with its
 * move, a probability bar and Yes / No pills. A card selects the market (shown above);
 * a pill selects it and also tells the buy ticket which side to load. "+ New market" opens
 * the form in a dialog.
 */
export function MarketsPanel({
  filter,
  selectedId,
  onSelect,
  onPick,
  onCreated,
}: {
  filter: MarketFilter;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPick: (id: string, side: Side) => void;
  onCreated: (m: Market) => void;
}) {
  const now = useNow();
  const { data, error } = usePoll(
    async () => (await api("listMarkets", { query: { limit: 100 } })).markets,
    "markets",
  );
  const open = data?.filter((m) => m.status === "open") ?? [];
  const done = data?.filter((m) => m.status !== "open") ?? [];
  const shown = filter === "open" ? open : filter === "settled" ? done : [...open, ...done];

  return (
    <section aria-labelledby="markets-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="markets-title" className="flex items-baseline gap-3">
          <span className="headline text-[28px] sm:text-[32px]">{TITLES[filter]}</span>
          {data && <span className="meta">{shown.length}</span>}
        </h2>
        <Modal>
          <Button className="h-10 shrink-0 rounded-full px-5 font-semibold">+ New market</Button>
          <Modal.Backdrop variant="blur">
            <Modal.Container placement="center" size="md">
              <Modal.Dialog>
                {({ close }) => (
                  <>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                      <Modal.Heading className="headline text-[26px]">New market</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body className="pb-2">
                      <NewMarketForm
                        onCreated={(m) => {
                          close();
                          onCreated(m);
                        }}
                      />
                    </Modal.Body>
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>

      {error && !data && <p className="mt-6 text-no text-sm">Could not load markets: {error.message}</p>}
      {data && shown.length === 0 && (
        <p className="mt-6 text-muted text-sm">
          {filter === "settled"
            ? "Nothing has settled yet."
            : "No open markets yet. Press + New market to start one."}
        </p>
      )}

      <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {shown.map((m) => (
          <li key={m.id} className="min-w-0">
            <MarketCard m={m} now={now} selected={m.id === selectedId} onSelect={onSelect} onPick={onPick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketCard({
  m,
  now,
  selected,
  onSelect,
  onPick,
}: {
  m: Market;
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onPick: (id: string, side: Side) => void;
}) {
  const yn = yesNo(m);
  if (!yn) return null;
  const yes = Math.round(yesCents(m, yn));
  const isOpen = m.status === "open" && Date.parse(m.closesAt) > now;
  // LMSR markets open at 50/50, so the move since opening is the distance from 50.
  const change = yes - 50;
  const msLeft = Date.parse(m.closesAt) - now;
  const urgent = msLeft > 0 && msLeft < 60_000;
  const wonYes = m.resolution?.outcomeId === yn.yes.id;

  return (
    <article
      className={`group relative flex h-full flex-col rounded-2xl border bg-surface/50 p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface sm:p-5 ${selected ? "border-yes/45" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label">Band #{m.bandNumber}</span>
        <span className={`meta ${urgent ? "font-medium text-no" : ""}`}>
          {m.status === "open" ? timeLeft(m.closesAt, now) : `vol ${credits(m.volumeCredits)}`}
        </span>
      </div>

      {/* The question is the card's button; its ::after stretches over the whole card so a
          click anywhere selects it. The pills sit above it. */}
      <h3 className="mt-2.5 min-h-[2lh] font-medium text-[16px] leading-snug">
        <button
          type="button"
          onClick={() => onSelect(m.id)}
          aria-pressed={selected}
          className="line-clamp-2 text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-yes"
        >
          {m.question}
        </button>
      </h3>

      <div className="mt-4 flex items-end gap-2">
        <Flash value={yes} className="display text-[32px]">
          {yes}%
        </Flash>
        <span className="pb-1 text-muted text-xs">chance</span>
        {isOpen && change !== 0 && (
          <span className={`display ml-auto pb-1 text-[15px] ${change > 0 ? "text-yes" : "text-no"}`}>
            {change > 0 ? "▲" : "▼"} {Math.abs(change)}
          </span>
        )}
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div
          className="h-full rounded-full bg-yes transition-[width] duration-300"
          style={{ width: `${yes}%` }}
        />
      </div>

      <div className="mt-auto pt-4">
        {isOpen ? (
          <div className="relative z-10 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPick(m.id, "YES")}
              className="num h-10 rounded-full bg-yes/12 font-semibold text-[14px] text-yes transition-colors duration-150 hover:bg-yes/22"
            >
              Yes {cents(yes)}
            </button>
            <button
              type="button"
              onClick={() => onPick(m.id, "NO")}
              className="num h-10 rounded-full bg-no/12 font-semibold text-[14px] text-no transition-colors duration-150 hover:bg-no/22"
            >
              No {cents(100 - yes)}
            </button>
          </div>
        ) : (
          <div className="flex h-10 items-center">
            <SettledChip status={m.status} wonYes={wonYes} />
          </div>
        )}
      </div>
    </article>
  );
}

function SettledChip({ status, wonYes }: { status: Market["status"]; wonYes: boolean }) {
  const [text, tone] =
    status === "resolved"
      ? wonYes
        ? ["Settled YES", "bg-yes/12 text-yes"]
        : ["Settled NO", "bg-no/12 text-no"]
      : status === "voided"
        ? ["Voided · refunded", "bg-raised text-muted"]
        : ["Closed · judging", "bg-raised text-muted"];
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-semibold text-[12px] ${tone}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}
