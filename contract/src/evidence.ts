import { z } from "zod";
import { type TranscriptSegment, TranscriptSegment as TranscriptSegmentSchema } from "./ingest";
import { Market } from "./markets";

/**
 * Proof: why a market resolved the way it did, checkable by anyone with the bundle.
 *
 * Each stored segment's hash covers its content and the previous segment's hash, so the
 * backend cannot quietly edit a line once it is accepted. verifyProof() recomputes the
 * chain and checks that every quoted line really is in the transcript and in the window.
 */

export const GENESIS_HASH = "0".repeat(64);

export interface HashableSegment {
  sessionId: string;
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The one hash function backend and verifiers share. Do not change without a version bump. */
export function hashSegment(seg: HashableSegment, prevHash: string): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "vexbets.segment.v1",
      prevHash,
      seg.sessionId,
      seg.seq,
      seg.startMs,
      seg.endMs,
      seg.text,
      seg.speaker,
    ]),
  );
}

export const ProofBundle = z.object({
  market: Market,
  /** Every segment of every session that overlaps the market window, from seq 0. */
  segments: z.array(TranscriptSegmentSchema),
});
export type ProofBundle = z.infer<typeof ProofBundle>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ProofResult = { ok: true } | { ok: false; problems: string[] };

export async function verifyProof(bundle: ProofBundle): Promise<ProofResult> {
  const problems: string[] = [];
  const { market, segments } = bundle;
  const resolution = market.resolution;
  if (market.status !== "resolved" || !resolution) {
    return { ok: false, problems: ["market is not resolved"] };
  }

  // 1. Hash chains, per session, contiguous from seq 0.
  const bySession = new Map<string, TranscriptSegment[]>();
  for (const s of segments) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const heads = new Set<string>();
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.seq - b.seq);
    let prev = GENESIS_HASH;
    for (const [i, s] of list.entries()) {
      if (s.seq !== i) {
        problems.push(`session ${sessionId}: expected seq ${i}, got ${s.seq}`);
        break;
      }
      if (s.prevHash !== prev) problems.push(`segment ${s.id}: prevHash does not match chain`);
      const h = await hashSegment(s, prev);
      if (h !== s.hash) problems.push(`segment ${s.id}: hash does not match its content`);
      prev = s.hash;
      heads.add(s.hash);
    }
  }

  // 2. The decision is consistent with the resolution.
  const { decision } = resolution;
  if (decision.marketId !== market.id) problems.push("decision is for another market");
  // GENESIS_HASH means the judge saw no transcript at all (only valid with no evidence).
  const sawNothing = decision.headHash === GENESIS_HASH && decision.evidence.length === 0;
  if (!sawNothing && !heads.has(decision.headHash))
    problems.push("decision headHash is not in the transcript");
  if (resolution.via === "evidence") {
    if (decision.status !== "decided") problems.push("resolved via evidence but judge was undetermined");
    else if (decision.outcomeId !== resolution.outcomeId) problems.push("judge outcome != resolved outcome");
  } else if (resolution.outcomeId !== market.fallbackOutcomeId) {
    problems.push("resolved via fallback but outcome is not the fallback outcome");
  }

  // 3. Every quote is really in a segment inside the window.
  const byId = new Map(segments.map((s) => [s.id, s]));
  const opens = Date.parse(market.opensAt);
  const closes = Date.parse(market.closesAt);
  for (const ev of decision.evidence) {
    const seg = byId.get(ev.segmentId);
    if (!seg) {
      problems.push(`evidence cites unknown segment ${ev.segmentId}`);
      continue;
    }
    if (!normalize(seg.text).includes(normalize(ev.quote))) {
      problems.push(`quote not found in segment ${seg.id}: "${ev.quote}"`);
    }
    if (seg.startMs < opens || seg.endMs > closes) {
      problems.push(`segment ${seg.id} is outside the market window`);
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
