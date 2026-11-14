"use client";

import { Button, Input } from "@heroui/react";
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
        <Button
          size="sm"
          variant="outline"
          isDisabled={disabled || held < 1}
          className="max-sm:h-10"
          onPress={() => {
            setN(String(held));
            setMsg(null);
            setOpen(true);
          }}
        >
          Sell
        </Button>
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
      <Input
        inputMode="numeric"
        aria-label={`Shares of ${side} to sell (you hold ${held})`}
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="num h-10 w-16 text-right text-base sm:h-8 sm:text-xs"
      />
      <Button
        size="sm"
        variant="danger"
        isDisabled={!valid}
        isPending={busy}
        onPress={() => void sell()}
        className="max-sm:h-10"
      >
        {`Sell ${valid ? count : ""}`}
      </Button>
      <Button size="sm" variant="ghost" onPress={() => setOpen(false)} className="max-sm:h-10">
        Cancel
      </Button>
    </span>
  );
}
