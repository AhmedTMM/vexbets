"use client";

import { lmsr, type Market } from "@vexbets/contract";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api, refreshAll } from "@/lib/api";
import { credits, errorText } from "@/lib/format";
import { FRIENDS, type Friend, friendLabel, requestListen } from "@/lib/friends";

const DURATIONS = [
  { label: "2m", title: "2 minutes (demo)", minutes: 2 },
  { label: "10m", title: "10 minutes", minutes: 10 },
  { label: "1h", title: "1 hour", minutes: 60 },
  { label: "6h", title: "Until tonight (6 h)", minutes: 360 },
  { label: "1d", title: "1 day", minutes: 1440 },
  { label: "2w", title: "2 weeks", minutes: 20160 },
];

/** LMSR liquidity for every market: how far one trade moves the price. */
const LIQUIDITY_B = 100;

const firstFriend = FRIENDS[0] as Friend;

/**
 * Open a YES / NO market on what a friend will say. It settles YES the moment the band
 * hears it, NO when it closes. Opening it starts listening to that friend's band.
 * The tagline and judging criteria are meant to be written by the backend's reasoning
 * model; until the contract lets the backend fill them, the question is sent for both.
 */
export function NewMarketForm({ onCreated }: { onCreated?: (m: Market) => void }) {
  const router = useRouter();
  const [friend, setFriend] = useState<Friend>(firstFriend);
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
          bandNumber: friend.band,
          subjectName: friend.name,
          closesAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          liquidityB: LIQUIDITY_B,
        },
      });
      refreshAll();
      requestListen({ friend, consent: true });
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
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="block">
          <span className="label mb-1.5 block">Who's it about</span>
          <select
            className="field"
            value={friend.band}
            onChange={(e) => setFriend(FRIENDS.find((f) => f.band === Number(e.target.value)) ?? firstFriend)}
          >
            {FRIENDS.map((f) => (
              <option key={f.band} value={f.band}>
                {friendLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Prediction</span>
          <input
            className="field"
            required
            minLength={5}
            maxLength={200}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Will ${friend.name} say "no cap"?`}
          />
          <span className="meta mt-1.5 block">Put the exact words in quotes.</span>
        </label>
      </div>

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
        settles YES the moment {friend.name}'s band hears it · opening it starts recording {friend.name}'s
        band, so make sure they agree · house backs it with up to {credits(lmsr.maxSubsidy(LIQUIDITY_B, 2))}
      </p>
    </form>
  );
}
