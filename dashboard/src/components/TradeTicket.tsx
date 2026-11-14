"use client";

import { lmsr, type Market, type Position, SHARE_PAYOUT } from "@vexbets/contract";
import { useState } from "react";
import { api, refreshAll } from "@/lib/api";
import { bpsCents, credits, errorText } from "@/lib/format";
import { outcomeFor, type Side, type YesNo } from "@/lib/market";

type Action = "buy" | "sell";

/** How far the price may move between the quote and the trade before we refuse it. */
const SLIPPAGE = 0.03;

/** Buy or sell YES / NO shares. Preview with the shared LMSR math; the backend's quote counts. */
export function TradeTicket({
  market,
  yn,
  balance,
  positions,
}: {
  market: Market;
  yn: YesNo;
  balance: number;
  positions: Position[];
}) {
  const [action, setAction] = useState<Action>("buy");
  const [side, setSide] = useState<Side>("YES");
  const [shares, setShares] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const outcome = outcomeFor(yn, side);
  const index = side === "YES" ? yn.yesIndex : yn.noIndex;
  const held = positions.find((p) => p.outcomeId === outcome.id)?.shares ?? 0;
  const n = Number.parseInt(shares, 10);

  let preview: ReturnType<typeof lmsr.quoteTrade> | null = null;
  let problem = "";
  if (!(n >= 1)) problem = "Enter at least 1 share.";
  else if (action === "sell" && n > held) problem = `You hold ${held} ${side}.`;
  else {
    try {
      preview = lmsr.quoteTrade(
        market.outcomes.map((o) => o.shares),
        market.liquidityB,
        index,
        action,
        n,
      );
      if (action === "buy" && preview.credits > balance)
        problem = `Costs ${credits(preview.credits)}; you have ${credits(balance)}.`;
    } catch (e) {
      problem = errorText(e);
    }
  }

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const params = { marketId: market.id };
      const q = await api("quote", { params, body: { outcomeId: outcome.id, side: action, shares: n } });
      const limitCredits =
        action === "buy" ? Math.ceil(q.credits * (1 + SLIPPAGE)) : Math.floor(q.credits * (1 - SLIPPAGE));
      const r = await api("trade", {
        params,
        body: {
          outcomeId: outcome.id,
          side: action,
          shares: n,
          limitCredits,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      setMsg({
        ok: true,
        text: `${action === "buy" ? "Bought" : "Sold"} ${r.trade.shares} ${side} for ${credits(r.trade.credits)}.`,
      });
      refreshAll();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const tab = (a: Action) =>
    `flex-1 rounded-md py-1.5 text-sm ${action === a ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-4 flex gap-1 rounded-lg bg-black/30 p-1">
        <button type="button" className={tab("buy")} onClick={() => setAction("buy")}>
          Buy
        </button>
        <button type="button" className={tab("sell")} onClick={() => setAction("sell")}>
          Sell
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["YES", "NO"] as const).map((s) => {
          const o = outcomeFor(yn, s);
          const active = side === s;
          const color = s === "YES" ? "bg-emerald-500 text-black" : "bg-rose-500 text-black";
          return (
            <button
              type="button"
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-lg py-3 font-semibold ${active ? color : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >
              {s} {bpsCents(o.priceBps)}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block text-sm text-white/60">
        Shares
        <input
          inputMode="numeric"
          value={shares}
          onChange={(e) => setShares(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-white outline-none focus:border-sky-400"
        />
      </label>
      <div className="mt-2 flex gap-2">
        {(action === "buy"
          ? [10, 50, 100, 250].map((v) => ({ label: String(v), v }))
          : [
              { label: "1", v: 1 },
              { label: "10", v: 10 },
              { label: "All", v: held },
            ]
        ).map(({ label, v }) => (
          <button
            type="button"
            key={label}
            onClick={() => setShares(String(v))}
            disabled={v < 1}
            className="flex-1 rounded-md bg-white/5 py-1 text-xs hover:bg-white/10 disabled:opacity-30"
          >
            {label}
          </button>
        ))}
      </div>

      {preview && !problem && (
        <dl className="mt-4 space-y-1 text-sm text-white/60">
          <Row label={action === "buy" ? "Cost" : "You receive"} value={credits(preview.credits)} />
          <Row label="Avg price / share" value={bpsCents(preview.avgPriceBps)} />
          {action === "buy" && (
            <>
              <Row label={`Pays if ${side}`} value={credits(n * SHARE_PAYOUT)} tone="up" />
              <Row label="Profit if right" value={credits(n * SHARE_PAYOUT - preview.credits)} />
            </>
          )}
          <Row
            label={`${side} price after`}
            value={bpsCents(preview.priceAfterBps[index] ?? 0)}
            tone={action === "buy" ? "up" : "down"}
          />
        </dl>
      )}
      {problem && <p className="mt-4 text-sm text-amber-300">{problem}</p>}

      <button
        type="button"
        disabled={!!problem || busy}
        onClick={submit}
        className="mt-4 w-full rounded-lg bg-sky-500 py-2.5 font-medium text-black hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Placing…" : `${action === "buy" ? "Buy" : "Sell"} ${n >= 1 ? n : ""} ${side}`}
      </button>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-400"}`}>{msg.text}</p>}
      <p className="mt-3 text-xs text-white/40">
        Each share pays {SHARE_PAYOUT} credits if its side wins, 0 if not. Prices move with every trade.
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd
        className={`font-mono ${tone === "up" ? "text-emerald-300" : tone === "down" ? "text-rose-300" : "text-white"}`}
      >
        {value}
      </dd>
    </div>
  );
}
