"use client";

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
      <div className="grid grid-cols-2 gap-2">
        {(["YES", "NO"] as const).map((s) => {
          const o = outcomeFor(yn, s);
          const active = side === s;
          const tone =
            s === "YES"
              ? active
                ? "border-yes bg-yes/15 text-yes"
                : "border-yes/30 text-yes/80 hover:bg-yes/10"
              : active
                ? "border-no bg-no/15 text-no"
                : "border-no/30 text-no/80 hover:bg-no/10";
          return (
            <button
              type="button"
              key={s}
              onClick={() => setSide(s)}
              aria-pressed={active}
              className={`num h-11 rounded-full border font-semibold transition-colors duration-150 ${tone}`}
            >
              {s === "YES" ? "Yes" : "No"} {bpsCents(o.priceBps)}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="label mb-1.5 block">Shares</span>
        <input
          inputMode="numeric"
          value={shares}
          onChange={(e) => setShares(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="field num text-lg"
        />
      </label>
      <div className="mt-2 flex gap-1.5">
        {[10, 50, 100, 250].map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => setShares(String(v))}
            className="num h-7 flex-1 rounded-full border border-line text-muted text-xs transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            {v}
          </button>
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

      <button
        type="button"
        disabled={!!problem || busy}
        onClick={submit}
        className="btn btn-primary mt-4 h-11 w-full text-[15px]"
      >
        {busy ? "Placing…" : `Buy ${n >= 1 ? n : ""} ${side}`}
      </button>
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
