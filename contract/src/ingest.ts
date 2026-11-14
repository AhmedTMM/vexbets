import { z } from "zod";
import { BandNumber, EpochMs, Id, Sha256Hex, Timestamp } from "./common";

/**
 * Ingest: how speech gets from the band to the backend.
 *
 * Vercel functions cannot hold a Bluetooth link or a long-lived audio stream, so the
 * listener is a browser tab (dashboard/listen) connected to the band:
 *
 *   band --BLE--> listener tab --audio--> STT provider (short-lived token from backend)
 *                 listener tab --final transcript segments--> backend (this file)
 *
 * The backend chains every segment's hash to the one before it, so a transcript cannot be
 * edited after the fact without breaking the chain (see evidence.ts).
 */

export const ListenSession = z.object({
  id: Id,
  bandNumber: BandNumber,
  /** Who is wearing the band. */
  subjectName: z.string().trim().min(1).max(50),
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  /** Number of segments accepted so far; the next segment's seq. */
  segmentCount: z.int().nonnegative(),
  /** Hash of the last accepted segment, or GENESIS_HASH. */
  headHash: Sha256Hex,
});
export type ListenSession = z.infer<typeof ListenSession>;

export const StartSessionRequest = z.object({
  bandNumber: BandNumber,
  subjectName: z.string().trim().min(1).max(50),
  /** The wearer and the people near them agreed to be recorded. Required. */
  consentConfirmed: z.literal(true),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;

/** One final (not interim) piece of transcript, as the listener sends it. */
export const SegmentInput = z
  .object({
    /** 0, 1, 2, ... within the session, no gaps. */
    seq: z.int().nonnegative(),
    startMs: EpochMs,
    endMs: EpochMs,
    text: z.string().trim().min(1).max(5_000),
    /** Provider's confidence, 0..1. */
    confidence: z.number().min(0).max(1),
    /** Speaker label from diarization, if the provider gives one ("0", "1", ...). */
    speaker: z.string().max(20).nullable().default(null),
  })
  .refine((s) => s.endMs >= s.startMs, { message: "endMs must be >= startMs", path: ["endMs"] });
export type SegmentInput = z.input<typeof SegmentInput>;

/** A stored segment: what the backend returns and what proofs contain. */
export const TranscriptSegment = z.object({
  id: Id,
  sessionId: Id,
  seq: z.int().nonnegative(),
  startMs: EpochMs,
  endMs: EpochMs,
  text: z.string(),
  confidence: z.number().min(0).max(1),
  speaker: z.string().nullable(),
  prevHash: Sha256Hex,
  hash: Sha256Hex,
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const AppendSegmentsRequest = z.object({
  segments: z.array(SegmentInput).min(1).max(50),
});
export type AppendSegmentsRequest = z.input<typeof AppendSegmentsRequest>;

export const AppendSegmentsResponse = z.object({
  accepted: z.int().nonnegative(),
  segmentCount: z.int().nonnegative(),
  headHash: Sha256Hex,
});
export type AppendSegmentsResponse = z.infer<typeof AppendSegmentsResponse>;

export const SttTokenRequest = z.object({ sessionId: Id });

/** A short-lived token so the listener talks to the STT provider without the real key. */
export const SttToken = z.object({
  provider: z.string().min(1),
  token: z.string().min(1),
  expiresAt: Timestamp,
});
export type SttToken = z.infer<typeof SttToken>;
