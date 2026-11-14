"use client";

import { Button, Input, Label, TextField, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { lmsr, type Market, SHARE_PAYOUT } from "@vexbets/contract";
import { useState } from "react";
import { bpsCents, credits, errorText } from "@/lib/format";
import { outcomeFor, type Side, type YesNo } from "@/lib/market";
import { placeTrade } from "@/lib/trade";

/** Buy YES or NO shares. Selling happens from your holdings. */
export function TradeTicket({ market, yn, balance }: { market: Market; yn: YesNo; balance: number }) {
  const [side, setSide] = useState<Side>("YES");
  const [shares, setShares] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const outcome = outcomeFor(yn, side);
  const index = side === "YES" ? yn.yesIndex : yn.noIndex;
  const n = Number.parseInt(shares, 10);

  let preview: ReturnType<typeof lmsr.quoteTrade> | null = null;
  let problem = "";
  if (!(n >= 1)) problem = "Enter at least 1 share.";
  else {
    try {
      preview = lmsr.quoteTrade(
        market.outcomes.map((o) => o.shares),
        market.liquidityB,
        index,
        "buy",
        n,
      );
      if (preview.credits > balance)
        problem = `Costs ${credits(preview.credits)}; you have ${credits(balance)}.`;
    } catch (e) {
      problem = errorText(e);
    }
  }

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await placeTrade(market.id, outcome.id, "buy", n);
      setMsg({ ok: true, text: `Bought ${t.shares} ${side} for ${credits(t.credits)}.` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-raised/60 p-4">
      <div className="label mb-3">Buy</div>
      <ToggleButtonGroup
        aria-label="Side"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[side]}
        onSelectionChange={(keys) => {
          const k = [...keys][0];
          if (k === "YES" || k === "NO") setSide(k);
        }}
        className="grid w-full grid-cols-2 gap-2"
      >
        {(["YES", "NO"] as const).map((s) => {
          const o = outcomeFor(yn, s);
          const tone =
            s === "YES"
              ? "border-yes/30 text-yes/80 data-[selected=true]:border-yes data-[selected=true]:bg-yes/15 data-[selected=true]:text-yes"
              : "border-no/30 text-no/80 data-[selected=true]:border-no data-[selected=true]:bg-no/15 data-[selected=true]:text-no";
          return (
            <ToggleButton
              key={s}
              id={s}
              className={`num h-11 w-full rounded-full border bg-transparent font-semibold ${tone}`}
            >
              {s === "YES" ? "Yes" : "No"} {bpsCents(o.priceBps)}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>

      <TextField
        className="mt-4"
        value={shares}
        onChange={(v) => setShares(v.replace(/\D/g, "").slice(0, 6))}
        aria-label="Shares"
      >
        <Label className="label mb-1.5 block">Shares</Label>
        <Input inputMode="numeric" className="num w-full text-lg" />
      </TextField>
      <div className="mt-2 flex gap-1.5">
        {[10, 50, 100, 250].map((v) => (
          <Button
            key={v}
            size="sm"
            variant="tertiary"
            onPress={() => setShares(String(v))}
            className="num flex-1 max-sm:h-10"
          >
            {v}
          </Button>
        ))}
      </div>

      {preview && !problem && (
        <dl className="mt-4 space-y-1.5 text-muted text-sm">
          <Row label="Cost" value={credits(preview.credits)} />
          <Row label="Avg price" value={bpsCents(preview.avgPriceBps)} />
          <Row label={`Pays if ${side}`} value={credits(n * SHARE_PAYOUT)} tone="up" />
          <Row label="Profit if right" value={credits(n * SHARE_PAYOUT - preview.credits)} />
        </dl>
      )}
      {problem && <p className="mt-4 text-mock text-sm">{problem}</p>}

      <Button
        size="lg"
        fullWidth
        variant={side === "YES" ? "primary" : "danger"}
        isDisabled={!!problem}
        isPending={busy}
        onPress={() => void submit()}
        className="mt-4"
      >
        {busy ? "Placing…" : `Buy ${n >= 1 ? n : ""} ${side}`}
      </Button>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-yes" : "text-no"}`}>{msg.text}</p>}
      <p className="meta mt-3">
        each share pays {credits(SHARE_PAYOUT)} if its side wins · sell from your holdings
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={`num ${tone === "up" ? "text-yes" : tone === "down" ? "text-no" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}
