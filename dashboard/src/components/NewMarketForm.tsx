"use client";

import { lmsr, type Market } from "@vexbets/contract";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api, refreshAll } from "@/lib/api";
import { TEAM_BAND, WEARER } from "@/lib/band";
import { credits, errorText } from "@/lib/format";

const DURATIONS = [
  { label: "2m", title: "2 minutes (demo)", minutes: 2 },
  { label: "10m", title: "10 minutes", minutes: 10 },
  { label: "1h", title: "1 hour", minutes: 60 },
  { label: "6h", title: "Until tonight (6 h)", minutes: 360 },
  { label: "1d", title: "1 day", minutes: 1440 },
  { label: "2w", title: "2 weeks", minutes: 20160 },
];

/**
 * LMSR liquidity for every market: how far one trade moves the price. 30 is the contract's
 * default; the backend charges the creator maxSubsidy(30, 2) = 2,080 credits ($20.80) as the
 * market maker's deposit and returns what is left when the market settles.
 */
const LIQUIDITY_B = 30;
const DEPOSIT = lmsr.maxSubsidy(LIQUIDITY_B, 2);

/**
 * Open a YES / NO market on what will be said near the team's band. It settles YES the
 * moment the band hears it, NO when it closes. Listening is separate (the ListenBar).
 * The tagline and judging criteria are meant to be written by the backend's reasoning
 * model; until the contract lets the backend fill them, the question is sent for both.
 */
export function NewMarketForm({ onCreated }: { onCreated?: (m: Market) => void }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const m = await api("createMarket", {
        body: {
          question,
          tagline: question,
          criteria: question,
          outcomes: [
            { label: "Yes", criteria: question },
            {
              label: "No",
              criteria: "Nothing that meets the YES criteria is heard before the market closes.",
            },
          ],
          fallbackOutcomeIndex: 1,
          resolveEarly: true,
          bandNumber: TEAM_BAND,
          subjectName: WEARER,
          closesAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          liquidityB: LIQUIDITY_B,
        },
      });
      refreshAll();
      setQuestion("");
      setBusy(false);
      if (onCreated) onCreated(m);
      else router.push(`/markets/${m.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="label mb-1.5 block">Prediction</span>
        <input
          className="field"
          required
          minLength={5}
          maxLength={200}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`Will anyone say "no cap"?`}
        />
        <span className="meta mt-1.5 block">Put the exact words in quotes.</span>
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="min-w-[280px] flex-1">
          <legend className="label mb-1.5">Closes in</legend>
          <div className="seg">
            {DURATIONS.map((d) => (
              <button
                key={d.minutes}
                type="button"
                title={d.title}
                aria-pressed={minutes === d.minutes}
                onClick={() => setMinutes(d.minutes)}
                className="num"
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={busy} className="btn btn-primary h-11 min-w-44 px-6">
          {busy ? "Opening…" : "Open market"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-[10px] border border-no/30 bg-no/5 px-3 py-2 text-no text-sm">
          {error}
        </p>
      )}
      <p className="meta">
        settles YES the moment band #{TEAM_BAND} hears it · you put up {credits(DEPOSIT)} as the market maker
        and get back what's left when it settles
      </p>
    </form>
  );
}
