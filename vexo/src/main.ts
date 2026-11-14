import {
  createClient,
  createListener,
  type Market,
  type SttEngine,
  type SttToken,
  scriptedStt,
} from "@vexbets/contract";
import { type BandConnection, connectBand, samplePackets } from "./band-source";
import { openaiRealtimeStt } from "./openai-stt";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const startBtn = $<HTMLButtonElement>("start");
const stopBtn = $<HTMLButtonElement>("stop");
const transcriptEl = $("transcript");
const logEl = $("log");
const stateEl = $("state");
const sentEl = $("sent");
const levelEl = $("level");

// Remember the form between visits (per browser only; nothing secret is stored).
const fields = ["band", "email", "subject", "backend"] as const;
const params = new URLSearchParams(location.search);
for (const f of fields) {
  const el = $<HTMLInputElement>(f);
  el.value = params.get(f) ?? safeGet(`vexbets.${f}`) ?? "";
  el.addEventListener("change", () => safeSet(`vexbets.${f}`, el.value));
}
if (params.get("pretend") === "1") $<HTMLInputElement>("pretend").checked = true;

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

function log(msg: string) {
  const line = `${new Date().toLocaleTimeString()}  ${msg}\n`;
  logEl.textContent += line;
  logEl.scrollTop = logEl.scrollHeight;
  console.log("[vexbets]", msg);
}

let liveEl: HTMLDivElement | null = null;
function showLive(text: string) {
  if (!liveEl) {
    liveEl = document.createElement("div");
    liveEl.className = "line live";
    transcriptEl.append(liveEl);
  }
  liveEl.textContent = text;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}
function showFinal(text: string) {
  liveEl?.remove();
  liveEl = null;
  const el = document.createElement("div");
  el.className = "line";
  el.textContent = text;
  transcriptEl.append(el);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// "Listening for": the open and recent markets on the band number in the form.
const marketsEl = $("markets");
const noteEl = $("markets-note");
const pct = (bps: number) => `${Math.round(bps / 100)}%`;

function renderMarkets(markets: Market[]) {
  marketsEl.replaceChildren(
    ...markets.map((m) => {
      const el = document.createElement("div");
      el.className = "market";
      const prices = m.outcomes.map((o) => `${o.label} ${pct(o.priceBps)}`).join(" · ");
      const winner = m.outcomes.find((o) => o.id === m.resolution?.outcomeId);
      const closes = new Date(m.closesAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const q = document.createElement("div");
      q.className = "q";
      q.textContent = m.question;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent =
        m.status === "resolved"
          ? `resolved: ${winner?.label ?? "?"} (${m.resolution?.via})`
          : `${m.status} · ${prices} · closes ${closes} · ${m.criteria}`;
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("span");
      fill.style.width = pct(m.outcomes[0]?.priceBps ?? 0);
      bar.append(fill);
      el.append(q, meta, bar);
      const ev = m.resolution?.decision.evidence[0];
      if (m.resolution) {
        const proof = document.createElement("div");
        proof.className = "proof";
        proof.textContent = `${m.resolution.decision.rationale}${ev ? " Heard: " : ""}`;
        if (ev) {
          const quote = document.createElement("q");
          quote.textContent = ev.quote;
          proof.append(quote);
        }
        el.append(proof);
      }
      return el;
    }),
  );
  if (markets.length === 0) marketsEl.textContent = "No markets on this band yet.";
}

async function refreshMarkets() {
  const band = Number($<HTMLInputElement>("band").value);
  if (!band) {
    noteEl.textContent = "enter your band number";
    return;
  }
  const baseUrl = $<HTMLInputElement>("backend").value.trim().replace(/\/$/, "");
  try {
    const { markets } = await createClient({ baseUrl })("listMarkets", { query: { limit: 50 } });
    const mine = markets.filter((m) => m.bandNumber === band);
    noteEl.textContent = `band ${band} · ${mine.filter((m) => m.status === "open").length} open`;
    renderMarkets(mine);
  } catch (err) {
    noteEl.textContent = `backend not reachable (${err instanceof Error ? err.message : String(err)})`;
  }
}
void refreshMarkets();
setInterval(() => void refreshMarkets(), 5_000);
$<HTMLInputElement>("band").addEventListener("change", () => void refreshMarkets());

let conn: BandConnection | null = null;
let listener: ReturnType<typeof createListener> | null = null;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  startBtn.disabled = true;
  const number = Number($<HTMLInputElement>("band").value);
  const email = $<HTMLInputElement>("email").value.trim();
  const subjectName = $<HTMLInputElement>("subject").value.trim();
  const baseUrl = $<HTMLInputElement>("backend").value.trim().replace(/\/$/, "");
  const pretend = $<HTMLInputElement>("pretend").checked;

  try {
    const voice = pretend ? await samplePackets() : undefined;
    conn = await connectBand({ number, pretend, voice, onStatus: log });
    const band = conn;

    listener = createListener({
      client: createClient({ baseUrl, headers: () => ({ authorization: `Bearer ${email}` }) }),
      bandNumber: number,
      subjectName,
      batchMs: 5_000,
      stt: (token: SttToken): SttEngine => {
        log(`speech-to-text: ${token.provider}`);
        if (token.provider === "openai") {
          return openaiRealtimeStt({
            token: token.token,
            audio: band.audio,
            onLive: showLive,
            onLog: log,
            onLevel: (db, floor) => {
              levelEl.textContent = `mic ${db.toFixed(0)} dB (room ${floor.toFixed(0)})`;
            },
          });
        }
        // The backend runs fake STT (no OpenAI key): play a scripted conversation.
        return scriptedStt([
          { text: "ok what are we getting to eat", afterMs: 1500 },
          { text: "the new place, their crust is fire no cap", afterMs: 2500 },
        ]);
      },
      onEvent: (ev) => {
        if (ev.type === "heard") showFinal(ev.text);
        if (ev.type === "sent") sentEl.textContent = `${ev.segmentCount} sent`;
        if (ev.type === "retrying") log(`send failed, will retry: ${String(ev.error)}`);
        if (ev.type === "started") log(`session ${ev.sessionId}`);
        if (ev.type === "stopped") log(`stopped after ${ev.segmentCount} lines`);
      },
    });
    await listener.start();
    stateEl.textContent = "listening";
    stateEl.classList.add("on");
    stopBtn.disabled = false;
  } catch (err) {
    log(`could not start: ${err instanceof Error ? err.message : String(err)}`);
    await conn?.disconnect().catch(() => {});
    conn = null;
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  try {
    await listener?.stop();
    await conn?.disconnect();
  } catch (err) {
    log(`stop: ${String(err)}`);
  }
  listener = null;
  conn = null;
  stateEl.textContent = "off";
  stateEl.classList.remove("on");
  startBtn.disabled = false;
});

window.addEventListener("beforeunload", () => {
  void listener?.stop();
});
