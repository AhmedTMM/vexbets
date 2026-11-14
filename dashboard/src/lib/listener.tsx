"use client";

// Listens to one friend's band: Web Bluetooth (Chrome / Edge) -> speech-to-text ->
// appendSegments. Lives in a provider around every page, so it keeps running while you
// browse. Opening a market for a friend starts listening to that friend automatically;
// the controls (connect, stop, test line) are shown on that market's card (BandStrip).

import type { ListenSession, Market } from "@vexbets/contract";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, refreshAll } from "./api";
import { credits, errorText } from "./format";
import type { Friend, ListenRequest } from "./friends";
import { usePoll } from "./hooks";
import { yesNo } from "./market";
import { SegmentQueue } from "./segments";

type BandLink = Awaited<ReturnType<typeof import("@/vendor/vexo-open/index.js")["Band"]["connect"]>>;
type SttLink = ReturnType<typeof import("@/vendor/vexo-open/deepgram.js")["deepgramLink"]>;

export interface Line {
  key: number;
  text: string;
  at: number;
}

export interface Listener {
  session: ListenSession | null;
  connected: boolean;
  status: string;
  problem: string;
  lines: Line[];
  interim: string;
  needKey: boolean;
  manualKey: string;
  setManualKey: (k: string) => void;
  sent: number;
  waiting: number;
  retrying: boolean;
  start: (f: Friend) => Promise<void>;
  stop: () => Promise<void>;
  connectBand: () => Promise<void>;
  /** Test without the band: send a line as if it had been heard. */
  say: (text: string) => void;
}

const Ctx = createContext<Listener | null>(null);

export function useListener(): Listener {
  const l = useContext(Ctx);
  if (!l) throw new Error("useListener must be inside ListenerProvider");
  return l;
}

export function ListenerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ListenSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [needKey, setNeedKey] = useState(false);
  const [, bump] = useState(0);

  const queue = useRef<SegmentQueue | null>(null);
  const bandRef = useRef<BandLink | null>(null);
  const stt = useRef<SttLink | null>(null);
  const sentenceStart = useRef<number | null>(null);
  const lineKey = useRef(0);
  const sessionRef = useRef<ListenSession | null>(null);
  sessionRef.current = session;

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

  const start = async (f: Friend) => {
    setProblem("");
    try {
      const s = await api("startSession", {
        body: { bandNumber: f.band, subjectName: f.name, consentConfirmed: true },
      });
      queue.current = new SegmentQueue(api, s.id, () => bump((x) => x + 1));
      setLines([]);
      setSession(s);
      setStatus("Connect the band, or type a test line.");
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  const stop = async () => {
    stt.current?.stop();
    stt.current = null;
    const b = bandRef.current;
    bandRef.current = null;
    setConnected(false);
    if (b) {
      await b.configure({ audio: false }).catch(() => {});
      await b.disconnect().catch(() => {});
    }
    await queue.current?.flush();
    const s = sessionRef.current;
    if (s) await api("endSession", { params: { sessionId: s.id } }).catch(() => {});
    setSession(null);
    setStatus("");
    refreshAll();
  };

  // A market was opened for a friend: listen to them (switching bands if needed).
  const startRef = useRef(start);
  startRef.current = start;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const onRequest = async (e: Event) => {
      const { friend: f, consent } = (e as CustomEvent<ListenRequest>).detail;
      if (!consent) return;
      const current = sessionRef.current;
      if (current?.bandNumber === f.band) return;
      if (current) await stopRef.current();
      await startRef.current(f);
    };
    window.addEventListener("vexbets:listen", onRequest);
    return () => window.removeEventListener("vexbets:listen", onRequest);
  }, []);

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
      setProblem("No speech-to-text token yet. Paste a Deepgram key, or type a test line.");
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
        setStatus(st === "listening" ? "Listening. The band's light is solid blue." : "Speech-to-text off."),
      onError: (p) => setProblem(`Speech-to-text stopped (${p}). Check the key and connect again.`),
    });
    return link;
  };

  const connectBand = async () => {
    const s = sessionRef.current;
    if (!s) return;
    setProblem("");
    try {
      setStatus("Double-tap the band (blue blink), then pick it in the list…");
      const { Band } = await import("@/vendor/vexo-open/index.js");
      const b = await Band.connect(s.bandNumber, { autoReconnect: true });
      bandRef.current = b;
      setConnected(true);
      const link = await startStt(s);
      if (!link) return;
      stt.current = link;
      b.on("audio", (a) => link.packet(a.opus));
      await b.configure({ audio: true });
      setStatus(`Connected to ${b.name}.`);
    } catch (e) {
      setProblem(`${errorText(e)}. Use Chrome or Edge, double-tap the band, and try again.`);
    }
  };

  const say = (text: string) => {
    if (!text.trim()) return;
    const t = Date.now();
    addFinal(text, t - 1500, t);
  };

  const q = queue.current;
  const value: Listener = {
    session,
    connected,
    status,
    problem,
    lines,
    interim,
    needKey,
    manualKey,
    setManualKey,
    sent: q?.sent ?? 0,
    waiting: q?.waiting ?? 0,
    retrying: !!q?.lastError,
    start,
    stop,
    connectBand,
    say,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {banner && <SettledBanner market={banner} />}
    </Ctx.Provider>
  );
}

/** The newest market on this band that resolved while listening. */
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
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
      <div
        className={`toast-in w-full max-w-2xl rounded-[24px] border-2 bg-surface p-12 text-center shadow-2xl ${yes ? "border-yes" : "border-no"}`}
      >
        <div className="text-6xl">{yes ? "🎉" : "⌛"}</div>
        <div className="mt-5 font-semibold text-4xl tracking-tight">{market.question}</div>
        <div className={`num mt-3 font-semibold text-2xl ${yes ? "text-yes" : "text-no"}`}>
          SETTLED {yes ? "YES" : "NO"}
        </div>
        {r?.decision.evidence[0] && (
          <div className="mt-4 text-muted text-xl italic">“{r.decision.evidence[0].quote}”</div>
        )}
        {total > 0 && (
          <div className="num mt-8 text-xl text-yes">
            {credits(total)} paid to {r?.payouts.length} trader{r?.payouts.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
