"use client";

import { Button, Dropdown, Input, TextField, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { lmsr, type Market, SHARE_PAYOUT } from "@vexbets/contract";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { bpsCents, cents, credits, errorText, signedCredits } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { outcomeFor, type Side, type YesNo } from "@/lib/market";
import {
  cleanDollars,
  cleanShares,
  dollarsToCredits,
  holdingRows,
  sharesForBudget,
  shortDate,
} from "@/lib/ticket";
import { placeTrade } from "@/lib/trade";
import { SellButton } from "./SellButton";

type Tab = "buy" | "sell";
type Mode = "dollars" | "shares";

/** Fired by the chance table's Yes / No pills (and Holdings' Sell) to drive the ticket. */
interface PickSide {
  marketId: string;
  side: Side;
}

const tabText = "text-[13px] font-semibold uppercase tracking-[0.12em]";

/**
 * The trade ticket: BUY a side by dollars or by shares, or SELL what you hold.
 * Listens for "vexbets:pick-side" to switch sides from elsewhere on the page.
 */
export function TradeTicket({ market, yn, balance }: { market: Market; yn: YesNo; balance: number }) {
  const [tab, setTab] = useState<Tab>("buy");
  const [mode, setMode] = useState<Mode>("dollars");
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: positions } = usePoll(
    async () => (await api("listPositions")).positions.filter((p) => p.marketId === market.id),
    `ticket:${market.id}`,
    3000,
  );

  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<PickSide>).detail;
      if (!d || d.marketId !== market.id || (d.side !== "YES" && d.side !== "NO")) return;
      setTab("buy");
      setSide(d.side);
      setMsg(null);
      // The input mounts with the BUY tab, so focus after this render.
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    const onSell = (e: Event) => {
      const d = (e as CustomEvent<{ marketId: string }>).detail;
      if (d?.marketId === market.id) setTab("sell");
    };
    window.addEventListener("vexbets:pick-side", onPick);
    window.addEventListener("vexbets:ticket-sell", onSell);
    return () => {
      window.removeEventListener("vexbets:pick-side", onPick);
      window.removeEventListener("vexbets:ticket-sell", onSell);
    };
  }, [market.id]);

  const outcome = outcomeFor(yn, side);
  const index = side === "YES" ? yn.yesIndex : yn.noIndex;
  const q = market.outcomes.map((o) => o.shares);
  const b = market.liquidityB;
  const sideName = (s: Side) => (s === "YES" ? "Yes" : "No");
  const headline = side === "YES" ? yn.yes.label : yn.no.label;

  const settled = market.status === "resolved" && market.resolution;
  const open = market.status === "open" && Date.parse(market.closesAt) > Date.now();

  // Shares this ticket would buy, and what they cost.
  const budget = mode === "dollars" ? dollarsToCredits(amount) : 0;
  const shares = mode === "dollars" ? sharesForBudget(q, b, index, budget) : Number.parseInt(amount, 10) || 0;
  let cost = 0;
  let problem = "";
  if (shares >= 1) {
    try {
      cost = lmsr.quoteTrade(q, b, index, "buy", shares).credits;
      if (cost > balance) problem = `Costs ${credits(cost)}; you have ${credits(balance)}.`;
    } catch (e) {
      problem = errorText(e);
    }
  } else if (mode === "dollars" && budget > 0) {
    problem = `Too little for one share (${credits(lmsr.quoteTrade(q, b, index, "buy", 1).credits)}).`;
  }

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await placeTrade(market.id, outcome.id, "buy", shares);
      setMsg({ ok: true, text: `Bought ${t.shares} ${sideName(side)} for ${credits(t.credits)}` });
      setAmount("");
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const rows = holdingRows(market, yn, positions ?? []);
  const resultSide = settled ? (market.resolution?.outcomeId === yn.yes.id ? "YES" : "NO") : null;

  return (
    <section
      aria-label="Trade ticket"
      className="w-full overflow-hidden rounded-[20px] border border-line bg-surface"
    >
      {/* 1. BUY / SELL tabs and the Dollars / Shares mode. */}
      <div className="flex items-center justify-between border-line border-b px-5 py-3.5">
        <div role="tablist" aria-label="Buy or sell" className="flex gap-5">
          {(["buy", "sell"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setMsg(null);
              }}
              className={`${tabText} -my-1 py-1 transition-colors ${tab === t ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "buy" && open && (
          <Dropdown>
            <Dropdown.Trigger
              aria-label="Enter amount in"
              className={`${tabText} flex items-center gap-1 text-muted outline-none hover:text-ink`}
            >
              {mode}
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="mt-px">
                <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="min-w-36">
              <Dropdown.Menu
                aria-label="Amount mode"
                selectionMode="single"
                selectedKeys={[mode]}
                onAction={(k) => {
                  if (k === "dollars" || k === "shares") {
                    setMode(k);
                    setAmount("");
                    setMsg(null);
                  }
                }}
              >
                <Dropdown.Item id="dollars" textValue="Dollars">
                  Dollars
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
                <Dropdown.Item id="shares" textValue="Shares">
                  Shares
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}
      </div>

      <div className="px-5 pt-4 pb-5">
        {/* 2. Question and the selected outcome. */}
        <p className="line-clamp-2 text-[17px] text-ink leading-snug">{market.question}</p>

        {settled ? (
          <Settled side={resultSide ?? "NO"} label={resultSide === "YES" ? yn.yes.label : yn.no.label} />
        ) : !open ? (
          <div className="mt-5 rounded-2xl bg-raised px-4 py-5 text-center">
            <div className="headline text-[26px] text-ink">Trading closed</div>
            <p className="meta mt-1">Waiting for the judge…</p>
          </div>
        ) : tab === "buy" ? (
          <>
            <h3 className={`headline mt-1 text-[30px] ${side === "YES" ? "text-yes" : "text-no"}`}>
              {headline}
            </h3>

            {/* 3. YES / NO segmented pill. */}
            <div className="mt-4 flex items-center gap-3">
              <ToggleButtonGroup
                aria-label="Side"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[side]}
                onSelectionChange={(keys) => {
                  const k = [...keys][0];
                  if (k === "YES" || k === "NO") {
                    setSide(k);
                    setMsg(null);
                  }
                }}
                className="flex flex-1 gap-0 rounded-full bg-raised p-1"
              >
                {(["YES", "NO"] as const).map((s) => {
                  const o = outcomeFor(yn, s);
                  const fill =
                    s === "YES"
                      ? "data-[selected=true]:bg-yes data-[selected=true]:text-on-accent"
                      : "data-[selected=true]:bg-no data-[selected=true]:text-[#1a0207]";
                  return (
                    <ToggleButton
                      key={s}
                      id={s}
                      className={`num h-10 flex-1 rounded-full border-0 bg-transparent font-bold text-[13px] text-ink uppercase tracking-[0.1em] shadow-none hover:bg-line/60 data-[selected=true]:hover:opacity-95 ${fill}`}
                    >
                      {s} {bpsCents(o.priceBps)}
                    </ToggleButton>
                  );
                })}
              </ToggleButtonGroup>
              <span
                title={`Each winning share pays ${credits(SHARE_PAYOUT)}. Liquidity b = ${b}.`}
                className="meta shrink-0 cursor-help underline decoration-dotted underline-offset-4"
              >
                {credits(SHARE_PAYOUT)} / share
              </span>
            </div>

            {/* 4. Amount. */}
            {/* HeroUI's <Label> carries the global .label class (tiny caps), so the visible
                label is a plain span and the field is named with aria-label. */}
            <TextField
              aria-label={mode === "dollars" ? "Amount in dollars" : "Number of shares"}
              value={mode === "dollars" && amount ? `$${amount}` : amount}
              onChange={(v) => {
                setAmount(mode === "dollars" ? cleanDollars(v) : cleanShares(v));
                setMsg(null);
              }}
              className="mt-4 flex h-14 flex-row items-center justify-between gap-3 rounded-2xl border border-line-strong px-4 transition-colors focus-within:border-yes"
            >
              <span aria-hidden="true" className="shrink-0 text-[16px] text-ink">
                {mode === "dollars" ? "Dollars" : "Shares"}
              </span>
              <Input
                ref={inputRef}
                inputMode={mode === "dollars" ? "decimal" : "numeric"}
                placeholder={mode === "dollars" ? "$0" : "0"}
                autoComplete="off"
                style={{ outline: "none", boxShadow: "none", background: "transparent", border: 0 }}
                className="display h-full w-0 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-right text-[28px] text-ink shadow-none placeholder:text-muted focus:shadow-none"
              />
            </TextField>
            <p className="meta mt-1.5 min-h-[18px] text-right">
              {problem ? (
                <span className="text-mock">{problem}</span>
              ) : shares >= 1 ? (
                mode === "dollars" ? (
                  `${shares} shares · costs ${credits(cost)}`
                ) : (
                  `costs ${credits(cost)} · avg ${cents(cost / shares)}`
                )
              ) : (
                `balance ${credits(balance)}`
              )}
            </p>

            {/* 5. Odds and payout. */}
            <dl className="mt-2 space-y-3">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1 text-[15px] text-ink">
                  Odds
                  <span
                    title={`The market's chance that ${sideName(side)} wins, from the current price.`}
                    className="cursor-help text-muted text-xs"
                  >
                    ⓘ
                  </span>
                </dt>
                <dd className="num text-[15px] text-ink">{Math.round(outcome.priceBps / 100)}% chance</dd>
              </div>
              <div className="flex items-end justify-between">
                <dt>
                  <div className="text-[15px] text-ink">Max payout</div>
                  <div className="meta">{shortDate(market.closesAt)}</div>
                </dt>
                <dd className={`display text-[36px] ${shares >= 1 ? "text-yes" : "text-muted"}`}>
                  {credits(shares * SHARE_PAYOUT)}
                </dd>
              </div>
            </dl>

            {/* 6. CTA. */}
            <Button
              fullWidth
              variant={side === "YES" ? "primary" : "danger"}
              isDisabled={shares < 1 || !!problem}
              isPending={busy}
              onPress={() => void submit()}
              className="mt-5 h-14 rounded-full font-semibold text-[16px] tracking-[0.01em]"
            >
              {busy ? "Placing…" : shares < 1 ? "Enter an amount" : `Buy ${sideName(side)}`}
            </Button>
            <p
              aria-live="polite"
              className={`mt-2 min-h-5 text-center text-sm ${msg?.ok ? "text-yes" : "text-no"}`}
            >
              {msg?.text}
            </p>
          </>
        ) : (
          <>
            <SellList market={market} rows={rows} loading={!positions} onDone={setMsg} />
            <p
              aria-live="polite"
              className={`mt-1 min-h-5 text-center text-sm ${msg?.ok ? "text-yes" : "text-no"}`}
            >
              {msg?.text}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Settled({ side, label }: { side: Side; label: string }) {
  return (
    <div className="mt-5 rounded-2xl bg-raised px-4 py-5 text-center">
      <div className="label">Settled</div>
      <div className={`headline mt-1 text-[34px] ${side === "YES" ? "text-yes" : "text-no"}`}>
        Settled {side}
      </div>
      <p className="meta mt-1">{label} · winning shares paid $1.00</p>
    </div>
  );
}

function SellList({
  market,
  rows,
  loading,
  onDone,
}: {
  market: Market;
  rows: ReturnType<typeof holdingRows>;
  loading: boolean;
  onDone: (result: { ok: boolean; text: string }) => void;
}) {
  if (loading) return <p className="meta mt-5">Loading your holdings…</p>;
  if (rows.length === 0)
    return (
      <div className="mt-5 rounded-2xl bg-raised px-4 py-6 text-center">
        <div className="text-[15px] text-ink">Nothing to sell yet</div>
        <p className="meta mt-1">Buy Yes or No first.</p>
      </div>
    );
  return (
    <ul className="mt-4 divide-y divide-line">
      {rows.map((r) => (
        <li key={r.side} className="py-4 first:pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`headline text-[26px] ${r.side === "YES" ? "text-yes" : "text-no"}`}>
              {r.shares} {r.side === "YES" ? "Yes" : "No"}
            </span>
            <span className="display text-[26px] text-ink">{credits(r.value)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="meta">
              avg {cents(r.avgCents)} · now {cents(r.nowCents)} ·{" "}
              <span className={r.gain >= 0 ? "text-yes" : "text-no"}>{signedCredits(r.gain)}</span>
            </span>
          </div>
          <div className="mt-3 flex justify-end">
            <SellButton
              marketId={market.id}
              outcomeId={r.outcomeId}
              held={r.shares}
              side={r.side}
              onDone={onDone}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
