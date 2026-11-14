/**
 * Pretend to be the listener tab: send a transcript file to a backend, line by line, as if a
 * band were hearing it. Lets you test ingest -> judge -> payout with no band and no STT.
 *
 *   npx tsx scripts/replay.ts --band <n> --email you@example.com scripts/transcripts/no-cap.txt
 *
 * Options: --url (default http://localhost:3001), --subject (default "Wearer"),
 *          --batch <lines per request> (default 2), --delay <ms between batches> (default 0)
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@vexbets/contract";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string", default: "http://localhost:3001" },
    email: { type: "string" },
    band: { type: "string" },
    subject: { type: "string", default: "Wearer" },
    batch: { type: "string", default: "2" },
    delay: { type: "string", default: "0" },
  },
});

const file = positionals[0];
if (!file || !values.email || !values.band) {
  console.error("usage: replay.ts --band <your band number> --email <you@example.com> <transcript.txt>");
  process.exit(1);
}

const lines = readFileSync(file, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l);
    return m ? { speaker: m[1] ?? null, text: m[2] ?? "" } : { speaker: null, text: l };
  });

const call = createClient({
  baseUrl: values.url,
  headers: () => ({ authorization: `Bearer ${values.email}` }),
});

const session = await call("startSession", {
  body: { bandNumber: Number(values.band), subjectName: values.subject, consentConfirmed: true },
});
console.log(`session ${session.id} for band ${session.bandNumber}`);

const size = Math.max(1, Number(values.batch));
const delay = Math.max(0, Number(values.delay));
let t = Date.now();
for (let i = 0; i < lines.length; i += size) {
  const segments = lines.slice(i, i + size).map((l, j) => {
    const startMs = t;
    t += 3000;
    return { seq: i + j, startMs, endMs: startMs + 2500, text: l.text, confidence: 0.95, speaker: l.speaker };
  });
  const r = await call("appendSegments", { params: { sessionId: session.id }, body: { segments } });
  console.log(`+${r.accepted} segments (total ${r.segmentCount})`);
  if (delay) await new Promise((res) => setTimeout(res, delay));
}

await call("endSession", { params: { sessionId: session.id } });
console.log("session ended");
