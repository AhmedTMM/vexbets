"use client";

import { Button, Input } from "@heroui/react";
import { useState } from "react";
import { credits, errorText } from "@/lib/format";
import { placeTrade } from "@/lib/trade";

const pill =
  "h-10 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.12em] sm:h-9 max-sm:min-w-10";

/**
 * Sell from a holding: press Sell, choose how many (all by default), confirm.
 * Used in the ticket's SELL tab and in the portfolio.
 */
export function SellButton({
  marketId,
  outcomeId,
  held,
  side,
  disabled = false,
  onDone,
}: {
  marketId: string;
  outcomeId: string;
  held: number;
  side: "YES" | "NO";
  disabled?: boolean;
  /** Also told the result, for a parent that outlives this button (selling all removes the row). */
  onDone?: (result: { ok: boolean; text: string }) => void;
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
          className={`${pill} border-line-strong text-ink`}
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
    let result: { ok: boolean; text: string };
    try {
      const t = await placeTrade(marketId, outcomeId, "sell", count);
      result = {
        ok: true,
        text: `Sold ${t.shares} ${side === "YES" ? "Yes" : "No"} for ${credits(t.credits)}`,
      };
    } catch (e) {
      result = { ok: false, text: errorText(e) };
    }
    setBusy(false);
    setOpen(false);
    if (onDone) onDone(result);
    else setMsg(result);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        aria-label={`Shares of ${side} to sell (you hold ${held})`}
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="num h-10 w-16 rounded-full border border-line-strong bg-transparent px-3 text-right text-base shadow-none sm:h-9 sm:text-sm"
      />
      <Button
        size="sm"
        variant="danger"
        isDisabled={!valid}
        isPending={busy}
        onPress={() => void sell()}
        className={pill}
      >
        {`Sell ${valid ? count : ""}`}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Cancel"
        onPress={() => setOpen(false)}
        className={`${pill} px-3 text-muted`}
      >
        ✕
      </Button>
    </span>
  );
}
