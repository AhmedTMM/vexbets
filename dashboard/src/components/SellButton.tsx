"use client";

import { useState } from "react";
import { credits, errorText } from "@/lib/format";
import { placeTrade } from "@/lib/trade";

/**
 * Sell from a holding: click Sell, choose how many (all by default), confirm.
 * Used in "Your shares" under the buy ticket and in the portfolio.
 */
export function SellButton({
  marketId,
  outcomeId,
  held,
  side,
  disabled = false,
}: {
  marketId: string;
  outcomeId: string;
  held: number;
  side: "YES" | "NO";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(String(held));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        {msg && <span className={`text-xs ${msg.ok ? "text-yes" : "text-no"}`}>{msg.text}</span>}
        <button
          type="button"
          disabled={disabled || held < 1}
          onClick={() => {
            setN(String(held));
            setMsg(null);
            setOpen(true);
          }}
          className="h-7 rounded-full border border-line-strong px-3 font-medium text-xs transition-colors duration-150 hover:border-ink/40 hover:bg-raised disabled:opacity-30"
        >
          Sell
        </button>
      </span>
    );
  }

  const count = Number.parseInt(n, 10);
  const valid = count >= 1 && count <= held;
  const sell = async () => {
    setBusy(true);
    try {
      const t = await placeTrade(marketId, outcomeId, "sell", count);
      setMsg({ ok: true, text: `Sold ${t.shares} for ${credits(t.credits)}` });
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        inputMode="numeric"
        aria-label={`Shares of ${side} to sell (you hold ${held})`}
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="num h-7 w-16 rounded-full border border-line-strong bg-bg px-2.5 text-right text-xs outline-none focus-visible:border-yes"
      />
      <button
        type="button"
        disabled={!valid || busy}
        onClick={sell}
        className="h-7 rounded-full bg-no px-3 font-semibold text-[#1a0508] text-xs transition-opacity duration-150 disabled:opacity-40"
      >
        {busy ? "…" : `Sell ${valid ? count : ""}`}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-7 rounded-full px-2 text-muted text-xs hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}
