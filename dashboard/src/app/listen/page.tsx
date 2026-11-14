"use client";

import type { ListenSession, Market } from "@vexbets/contract";
import { useEffect, useRef, useState } from "react";
import { api, refreshAll } from "@/lib/api";
import { cents, clock, credits, errorText, timeLeft } from "@/lib/format";
import { useNow, usePoll } from "@/lib/hooks";
import { yesCents, yesNo } from "@/lib/market";
import { SegmentQueue } from "@/lib/segments";

// The listener tab: connects to the team's band over Web Bluetooth (Chrome / Edge), streams
// its microphone to speech-to-text, and sends each finished sentence to the backend with
// appendSegments. Keep this tab open and in front during the demo; it doubles as the
// projector screen.

type BandLink = Awaited<ReturnType<typeof import("@/vendor/vexo-open/index.js")["Band"]["connect"]>>;
type SttLink = ReturnType<typeof import("@/vendor/vexo-open/deepgram.js")["deepgramLink"]>;

interface Line {
  key: number;
  text: string;
  at: number;
}

export default function ListenPage() {
  const now = useNow();
  const [band, setBand] = useState("");
  const [subject, setSubject] = useState("");
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<ListenSession | null>(null);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [needKey, setNeedKey] = useState(false);
  const [, bump] = useState(0);

  const queue = useRef<SegmentQueue | null>(null);
  const bandRef = useRef<BandLink | null>(null);
  const stt = useRef<SttLink | null>(null);
  const sentenceStart = useRef<number | null>(null);
  const lineKey = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const bandNumber = Number.parseInt(band, 10);
  const { data: markets } = usePoll(
    async () =>
      session
        ? (await api("listMarkets", { query: { limit: 100 } })).markets.filter(
            (m) => m.bandNumber === session.bandNumber,
          )
        : [],
    session?.id ?? "none",
    1500,
  );
  const banner = useResolvedBanner(markets);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when lines change
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, interim]);

  // Retry sending every few seconds if the network dropped.
  useEffect(() => {
    const i = setInterval(() => void queue.current?.flush(), 3000);
    return () => clearInterval(i);
  }, []);

  const addFinal = (text: string, startMs: number, endMs: number) => {
    queue.current?.push(text, startMs, endMs);
    lineKey.current += 1;
    const key = lineKey.current;
    setLines((l) => [...l.slice(-40), { key, text, at: endMs }]);
  };

  const start = async () => {
    setProblem("");
    try {
      const s = await api("startSession", {
        body: { bandNumber, subjectName: subject, consentConfirmed: true },
      });
      queue.current = new SegmentQueue(api, s.id, () => bump((x) => x + 1));
      setSession(s);
      setStatus("Session started. Connect the band, or type lines below to test.");
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  const startStt = async (s: ListenSession): Promise<SttLink | null> => {
    const { deepgramLink } = await import("@/vendor/vexo-open/deepgram.js");
    let key = manualKey.trim();
    let scheme: "token" | "bearer" = "token";
    if (!key) {
      const t = await api("sttToken", { body: { sessionId: s.id } }).catch(() => null);
      if (t && t.provider.toLowerCase() === "deepgram") {
        key = t.token;
        scheme = t.token.includes(".") ? "bearer" : "token"; // short-lived JWT vs. plain key
      }
    }
    if (!key) {
      setNeedKey(true);
      setProblem(
        "No speech-to-text token from the backend. Paste a Deepgram key below, or type lines to test.",
      );
      return null;
    }
    const link = deepgramLink({ key, scheme });
    link.start({
      onText: ({ final, text }) => {
        sentenceStart.current ??= Date.now();
        if (final) {
          addFinal(text, sentenceStart.current, Date.now());
          sentenceStart.current = null;
          setInterim("");
        } else setInterim(text);
      },
      onState: (st) =>
        setStatus(st === "listening" ? "Listening: the band's light is solid blue." : "Speech-to-text off."),
      onError: (p) => setProblem(`Speech-to-text stopped (${p}). Check the key and press Connect again.`),
    });
    return link;
  };

  const connectBand = async () => {
    if (!session) return;
    setProblem("");
    try {
      setStatus("Double-tap the band (blue blink), then pick it in the browser's list…");
      const { Band } = await import("@/vendor/vexo-open/index.js");
      const b = await Band.connect(session.bandNumber, { autoReconnect: true });
      bandRef.current = b;
      const link = await startStt(session);
      if (!link) return;
      stt.current = link;
      b.on("audio", (a) => link.packet(a.opus));
      await b.configure({ audio: true });
      setStatus(`Connected to ${b.name}. Listening.`);
    } catch (e) {
      setProblem(`${errorText(e)}. Use Chrome or Edge, double-tap the band, and try again.`);
    }
  };

  const stop = async () => {
    stt.current?.stop();
    stt.current = null;
    const b = bandRef.current;
    bandRef.current = null;
    if (b) {
      await b.configure({ audio: false }).catch(() => {});
      await b.disconnect().catch(() => {});
    }
    await queue.current?.flush();
    if (session) await api("endSession", { params: { sessionId: session.id } }).catch(() => {});
    setSession(null);
    setStatus("Stopped.");
    refreshAll();
  };

  const input = "rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-sky-400";

  if (!session) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
        className="mx-auto max-w-xl space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold">Listen</h1>
          <p className="text-sm text-white/50">
            This tab connects to the band and sends what it hears to the judge. Use Chrome or Edge on a
            laptop, and keep the tab open.
          </p>
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-white/70">Band number</span>
            <input
              className={`${input} w-full`}
              required
              inputMode="numeric"
              value={band}
              onChange={(e) => setBand(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="17"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-white/70">Who wears it?</span>
            <input
              className={`${input} w-full`}
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 accent-amber-300"
          />
          <span>
            The person wearing the band and the people near them know they are being recorded and agree. The
            sound goes to a speech-to-text company, and the band's light stays solid blue while it listens.
          </span>
        </label>
        {problem && <p className="text-sm text-rose-400">{problem}</p>}
        <button
          type="submit"
          disabled={!consent || !(bandNumber >= 1 && bandNumber <= 999) || !subject.trim()}
          className="w-full rounded-lg bg-sky-500 py-2.5 font-medium text-black hover:bg-sky-400 disabled:opacity-40"
        >
          Start listening session
        </button>
      </form>
    );
  }

  const q = queue.current;
  const open = (markets ?? []).filter((m) => m.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Listening · band #{session.bandNumber} on {session.subjectName}
          </h1>
          <p className="text-sm text-white/50">{status}</p>
        </div>
        <div className="flex gap-2">
          {!bandRef.current && (
            <button
              type="button"
              onClick={connectBand}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-black hover:bg-sky-400"
            >
              Connect band
            </button>
          )}
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          >
            Stop
          </button>
        </div>
      </div>

      {problem && <p className="text-sm text-rose-400">{problem}</p>}
      {needKey && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/60">Deepgram key (kept in this tab only):</span>
          <input
            type="password"
            autoComplete="off"
            value={manualKey}
            onChange={(e) => setManualKey(e.target.value)}
            className={`${input} min-w-64 flex-1`}
          />
        </label>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-black/30">
          <div className="flex justify-between border-b border-white/10 px-4 py-2 text-xs uppercase tracking-wider text-white/50">
            <span>Transcript</span>
            <span>
              sent {q?.sent ?? 0}
              {q && q.waiting > 0 ? ` · waiting ${q.waiting}` : ""}
              {q?.lastError ? ` · retrying (${q.lastError})` : ""}
            </span>
          </div>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto px-4 py-3">
            {lines.length === 0 && !interim && <p className="text-white/40">Nothing heard yet.</p>}
            {lines.map((l) => (
              <p key={l.key} className="text-2xl leading-snug">
                <span className="mr-2 font-mono text-sm text-white/30">{clock(l.at)}</span>
                {l.text}
              </p>
            ))}
            {interim && <p className="text-2xl leading-snug text-white/40">{interim}</p>}
            <div ref={bottom} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!typed.trim()) return;
              const t = Date.now();
              addFinal(typed, t - 1500, t);
              setTyped("");
            }}
            className="flex gap-2 border-t border-white/10 p-3"
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Test without the band: type what was said and press Enter"
              className={`${input} flex-1 text-sm`}
            />
            <button type="submit" className="rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20">
              Send
            </button>
          </form>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">Markets on this band</div>
          {open.length === 0 && (
            <p className="text-sm text-white/40">No open markets for band #{session.bandNumber}.</p>
          )}
          {open.map((m) => {
            const yn = yesNo(m);
            if (!yn) return null;
            const yes = yesCents(m, yn);
            return (
              <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-lg leading-snug">{m.question}</div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-mono text-3xl">
                    <span className="text-emerald-300">{cents(yes)}</span>{" "}
                    <span className="text-base text-rose-300">/ {cents(100 - yes)}</span>
                  </span>
                  <span className="font-mono text-white/50">⏱ {timeLeft(m.closesAt, now)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {banner && <SettledBanner market={banner} />}
    </div>
  );
}

/** The newest market on this band that resolved while the tab was open. */
function useResolvedBanner(markets: Market[] | undefined): Market | null {
  const known = useRef<Map<string, string> | null>(null);
  const [banner, setBanner] = useState<Market | null>(null);
  useEffect(() => {
    if (!markets) return;
    if (known.current === null) {
      known.current = new Map(markets.map((m) => [m.id, m.status]));
      return;
    }
    for (const m of markets) {
      const before = known.current.get(m.id);
      if (m.status === "resolved" && before !== "resolved") setBanner(m);
      known.current.set(m.id, m.status);
    }
  }, [markets]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 12_000);
    return () => clearTimeout(t);
  }, [banner]);
  return banner;
}

function SettledBanner({ market }: { market: Market }) {
  const r = market.resolution;
  const yn = yesNo(market);
  const yes = !!r && !!yn && r.outcomeId === yn.yes.id;
  const total = r?.payouts.reduce((a, p) => a + p.credits, 0) ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8">
      <div
        className={`toast-in max-w-3xl rounded-3xl border-2 p-10 text-center ${yes ? "border-emerald-400 bg-emerald-950" : "border-rose-400 bg-rose-950"}`}
      >
        <div className="text-6xl">{yes ? "🎉" : "⌛"}</div>
        <div className="mt-4 text-4xl font-semibold">{market.question}</div>
        <div className="mt-2 text-2xl">Settled {yes ? "YES" : "NO"}</div>
        {r?.decision.evidence[0] && (
          <div className="mt-3 text-xl italic text-white/80">“{r.decision.evidence[0].quote}”</div>
        )}
        {total > 0 && (
          <div className="mt-6 font-mono text-2xl text-emerald-300">
            {credits(total)} paid to {r?.payouts.length} trader{r?.payouts.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
