"use client";

// Listens to the team's band: Web Bluetooth (Chrome / Edge) -> speech-to-text ->
// appendSegments. Market agnostic: every market on the band settles from what it hears.
// Lives in a provider around every page, so it keeps running while you browse; the
// controls are the ListenBar at the top.
//
// Speech-to-text follows the backend: an "openai" token runs OpenAI Realtime transcription
// (@vexbets/vexo/openai-stt, the engine tested on the real band); a "deepgram" token, or a
// pasted Deepgram key, runs the kit's Deepgram link.

import type { ListenSession, Market, SttEngine } from "@vexbets/contract";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, refreshAll } from "./api";
import { TEAM_BAND, WEARER } from "./band";
import { bandAudioSource } from "./band-audio";
import { credits, errorText } from "./format";
import { usePoll } from "./hooks";
import { yesNo } from "./market";
import { SegmentQueue } from "./segments";

type BandLink = Awaited<ReturnType<typeof import("@/vendor/vexo-open/index.js")["Band"]["connect"]>>;
type SttLink = ReturnType<typeof import("@/vendor/vexo-open/deepgram.js")["deepgramLink"]>;
type NotifyState = NotificationPermission | "unsupported";

/** Load the band and STT code before the click: Web Bluetooth must open from the click itself. */
function preload() {
  void import("@/vendor/vexo-open/index.js");
  void import("@vexbets/vexo/openai-stt");
}

function notifyState(): NotifyState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

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
  /** Microphone loudness while OpenAI STT runs: dB, and the room's noise floor. */
  level: { db: number; floor: number } | null;
  /** Browser notifications for settled markets. */
  notifications: NotifyState;
  enableNotifications: () => Promise<void>;
  band: number;
  /** Connect the band, open a session and start speech-to-text, in one click. */
  listen: () => Promise<void>;
  stop: () => Promise<void>;
  /** Test without the band: send a line as if it had been heard. */
  say: (text: string) => Promise<void>;
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
  const [level, setLevel] = useState<{ db: number; floor: number } | null>(null);
  const [notifications, setNotifications] = useState<NotifyState>("default");
  const [, bump] = useState(0);

  useEffect(() => {
    preload();
    setNotifications(notifyState());
  }, []);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    setNotifications(await Notification.requestPermission());
  };

  const queue = useRef<SegmentQueue | null>(null);
  const bandRef = useRef<BandLink | null>(null);
  const stt = useRef<SttLink | null>(null);
  const engine = useRef<SttEngine | null>(null);
  const sentenceStart = useRef<number | null>(null);
  const lineKey = useRef(0);
  const sessionRef = useRef<ListenSession | null>(null);
  sessionRef.current = session;

  // Every market, so a settlement shows up (banner + notification) whatever page you are on.
  const { data: markets } = usePoll(
    async () => (await api("listMarkets", { query: { limit: 100 } })).markets,
    "all-markets",
    1500,
  );
  const [banner, dismissBanner] = useResolvedBanner(markets);

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

  const start = async (): Promise<ListenSession | null> => {
    setProblem("");
    try {
      const s = await api("startSession", {
        body: { bandNumber: TEAM_BAND, subjectName: WEARER, consentConfirmed: true },
      });
      queue.current = new SegmentQueue(api, s.id, () => bump((x) => x + 1));
      sessionRef.current = s;
      setLines([]);
      setSession(s);
      setStatus("Connect the band, or type a test line.");
      return s;
    } catch (e) {
      setProblem(errorText(e));
      return null;
    }
  };

  const stop = async () => {
    stt.current?.stop();
    stt.current = null;
    const eng = engine.current;
    engine.current = null;
    await eng?.stop().catch(() => {});
    setLevel(null);
    setInterim("");
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

  /** OpenAI Realtime transcription from the band's samples (the backend minted the token). */
  const startOpenAI = async (b: BandLink, token: string) => {
    const { openaiRealtimeStt } = await import("@vexbets/vexo/openai-stt");
    const eng = openaiRealtimeStt({
      token,
      audio: bandAudioSource(b, setStatus),
      onLive: setInterim,
      onLog: (m) => console.log("[vexbets stt]", m),
      onLevel: (db, floor) => setLevel({ db, floor }),
    });
    await eng.start((t) => {
      addFinal(t.text, t.startMs, t.endMs);
      setInterim("");
    });
    engine.current = eng;
    setStatus(`Listening to ${b.name}. The band's light is solid blue.`);
  };

  /** The kit's Deepgram link: a pasted key, or a Deepgram token from the backend. */
  const startDeepgram = async (b: BandLink, key: string, scheme: "token" | "bearer") => {
    const { deepgramLink } = await import("@/vendor/vexo-open/deepgram.js");
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
    stt.current = link;
    b.on("audio", (a) => link.packet(a.opus));
    await b.configure({ audio: true });
  };

  const listen = async () => {
    setProblem("");
    setNeedKey(false);
    try {
      // The band first: Chrome only opens its chooser straight from the click.
      setStatus("Double-tap the band (blue blink), then pick it in the list…");
      let b = bandRef.current;
      if (!b) {
        const { Band } = await import("@/vendor/vexo-open/index.js");
        b = await Band.connect(TEAM_BAND, { autoReconnect: true });
        bandRef.current = b;
      }
      setConnected(true);

      const s = sessionRef.current ?? (await start());
      if (!s) return;

      // Then speech-to-text, whichever the backend serves.
      const key = manualKey.trim();
      if (key) return await startDeepgram(b, key, "token");
      const t = await api("sttToken", { body: { sessionId: s.id } }).catch(() => null);
      const provider = t?.provider.toLowerCase();
      if (t && provider === "openai") return await startOpenAI(b, t.token);
      if (t && provider === "deepgram") {
        return await startDeepgram(b, t.token, t.token.includes(".") ? "bearer" : "token");
      }
      setNeedKey(true);
      setProblem("The backend has no speech-to-text key. Paste a Deepgram key, or type a test line.");
    } catch (e) {
      setProblem(`${errorText(e)}. Use Chrome or Edge, double-tap the band, and try again.`);
    }
  };

  const say = async (text: string) => {
    if (!text.trim()) return;
    if (!sessionRef.current && !(await start())) return;
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
    level,
    notifications,
    enableNotifications,
    band: TEAM_BAND,
    listen,
    stop,
    say,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {banner && <SettledBanner market={banner} onClose={dismissBanner} />}
    </Ctx.Provider>
  );
}

const SHOWN = "vexbets.settled-banners";

function readShown(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SHOWN) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveShown(ids: Set<string>) {
  try {
    sessionStorage.setItem(SHOWN, JSON.stringify([...ids]));
  } catch {}
}

/**
 * A market that just settled, shown once. Markets already settled when the page loads are
 * never replayed, and a market whose banner was shown (or dismissed) is never shown again
 * in this tab, even after a reload.
 */
function useResolvedBanner(markets: Market[] | undefined): [Market | null, () => void] {
  const shown = useRef<Set<string> | null>(null);
  const [banner, setBanner] = useState<Market | null>(null);
  useEffect(() => {
    if (!markets) return;
    if (shown.current === null) {
      // First load: everything settled so far counts as seen.
      shown.current = readShown();
      for (const m of markets) if (m.status === "resolved") shown.current.add(m.id);
      saveShown(shown.current);
      return;
    }
    for (const m of markets) {
      if (m.status !== "resolved" || shown.current.has(m.id)) continue;
      shown.current.add(m.id);
      saveShown(shown.current);
      setBanner(m);
      notifySettled(m);
    }
  }, [markets]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6_000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBanner(null);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [banner]);
  return [banner, () => setBanner(null)];
}

/** A system notification, so a settlement is seen even with the tab in the background. */
function notifySettled(m: Market) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const r = m.resolution;
  const yn = yesNo(m);
  const side = r && yn ? (r.outcomeId === yn.yes.id ? "YES" : "NO") : "";
  const quote = r?.decision.evidence[0]?.quote;
  try {
    const n = new Notification(`Settled ${side}: ${m.question}`, {
      body: quote
        ? `Heard: “${quote}”`
        : r?.via === "fallback"
          ? "Nothing decisive was heard before it closed."
          : "",
      tag: `vexbets-${m.id}`,
    });
    n.onclick = () => {
      window.focus();
      window.location.assign(`/markets/${m.id}`);
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the banner still shows.
  }
}

function SettledBanner({ market, onClose }: { market: Market; onClose: () => void }) {
  const r = market.resolution;
  const yn = yesNo(market);
  const yes = !!r && !!yn && r.outcomeId === yn.yes.id;
  const total = r?.payouts.reduce((a, p) => a + p.credits, 0) ?? 0;
  return createPortal(
    // Click anywhere, press Esc, or wait 6 s to close.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes it (window listener above)
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop is a click-to-close layer
    <div
      onClick={onClose}
      className="fade-in fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        role="alertdialog"
        aria-label={`Settled ${yes ? "YES" : "NO"}: ${market.question}`}
        className={`toast-in relative max-h-full w-full max-w-2xl overflow-y-auto break-words rounded-[24px] border-2 bg-surface px-5 py-10 text-center shadow-2xl sm:p-12 ${yes ? "border-yes" : "border-no"}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-5 text-2xl text-muted max-sm:top-2 max-sm:right-2 max-sm:flex max-sm:h-11 max-sm:w-11 max-sm:items-center max-sm:justify-center transition-colors duration-150 hover:text-ink"
        >
          ×
        </button>
        <div className="text-5xl sm:text-6xl">{yes ? "🎉" : "⌛"}</div>
        <div className="mt-5 font-semibold text-4xl tracking-tight max-sm:text-[26px] max-sm:leading-tight">
          {market.question}
        </div>
        <div className={`num mt-3 font-semibold text-2xl ${yes ? "text-yes" : "text-no"}`}>
          SETTLED {yes ? "YES" : "NO"}
        </div>
        {r?.decision.evidence[0] && (
          <div className="mt-4 text-lg text-muted italic sm:text-xl">“{r.decision.evidence[0].quote}”</div>
        )}
        {total > 0 && (
          <div className="num mt-6 text-lg text-yes sm:mt-8 sm:text-xl">
            {credits(total)} paid to {r?.payouts.length} trader{r?.payouts.length === 1 ? "" : "s"}
          </div>
        )}
        <div className="meta mt-6">click anywhere or press Esc to close</div>
      </div>
    </div>,
    document.body,
  );
}
