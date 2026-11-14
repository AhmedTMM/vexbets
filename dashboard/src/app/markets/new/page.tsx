"use client";

import { lmsr } from "@vexbets/contract";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api, refreshAll } from "@/lib/api";
import { credits, errorText } from "@/lib/format";

const DURATIONS = [
  { label: "2 minutes (demo)", minutes: 2 },
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "Until tonight (6 h)", minutes: 360 },
  { label: "1 day", minutes: 1440 },
  { label: "2 weeks", minutes: 20160 },
];

const LIQUIDITY = [
  { label: "Jumpy (prices move a lot)", b: 50 },
  { label: "Normal", b: 100 },
  { label: "Steady", b: 300 },
];

export default function NewMarketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [band, setBand] = useState("");
  const [question, setQuestion] = useState("");
  const [tagline, setTagline] = useState("");
  const [criteria, setCriteria] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [b, setB] = useState(100);
  const [early, setEarly] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const bandNumber = Number.parseInt(band, 10);
    if (!(bandNumber >= 1 && bandNumber <= 999))
      return setError("Band number is 1 to 999 (it's on the band's bag).");
    setBusy(true);
    try {
      const m = await api("createMarket", {
        body: {
          question,
          tagline: tagline || question,
          criteria,
          outcomes: [
            { label: "Yes", criteria },
            {
              label: "No",
              criteria: "Nothing that meets the YES criteria is heard before the market closes.",
            },
          ],
          fallbackOutcomeIndex: 1,
          resolveEarly: early,
          bandNumber,
          subjectName: subject,
          closesAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          liquidityB: b,
        },
      });
      refreshAll();
      router.push(`/markets/${m.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-sky-400";

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">New market</h1>
        <p className="text-sm text-white/50">
          A YES / NO market. YES shares pay out if the band hears it before the market closes; otherwise NO
          shares do. Both start at 50¢.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_8rem] gap-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-white/70">Who wears the band?</span>
          <input
            className={input}
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Haris"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/70">Band number</span>
          <input
            className={input}
            required
            inputMode="numeric"
            value={band}
            onChange={(e) => setBand(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="17"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-white/70">Question</span>
        <input
          className={input}
          required
          minLength={5}
          maxLength={200}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will Haris mention his ex today?"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-white/70">Tagline (shown on the card)</span>
        <input
          className={input}
          maxLength={120}
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="He swears he's over it"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-white/70">What counts as YES? (the judge reads this)</span>
        <textarea
          className={`${input} min-h-24`}
          required
          maxLength={1000}
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder={`Haris talks about his ex-girlfriend, for example says "my ex".`}
        />
        <span className="block text-xs text-white/40">
          Put exact phrases in quotes. The AI judge understands other wordings too; the test judge only
          matches quoted phrases.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-white/70">Closes in</span>
          <select className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/70">Price movement</span>
          <select className={input} value={b} onChange={(e) => setB(Number(e.target.value))}>
            {LIQUIDITY.map((l) => (
              <option key={l.b} value={l.b}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={early}
          onChange={(e) => setEarly(e.target.checked)}
          className="accent-sky-400"
        />
        Settle YES the moment it's heard (instead of waiting for the close)
      </label>

      <p className="text-xs text-white/40">
        The house backs this market with up to {credits(lmsr.maxSubsidy(b, 2))} of play credits.
      </p>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-sky-500 py-2.5 font-medium text-black hover:bg-sky-400 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open the market"}
      </button>
    </form>
  );
}
