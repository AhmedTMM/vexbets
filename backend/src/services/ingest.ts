import {
  type AppendSegmentsResponse,
  ContractError,
  GENESIS_HASH,
  hashSegment,
  type ListenSession,
  type SegmentInput as SegmentInputSchema,
} from "@vexbets/contract";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { listenSessions, segments } from "../db/schema";
import type { Deps } from "../deps";
import type { UserRow } from "./users";

type SessionRow = typeof listenSessions.$inferSelect;
type Segment = z.output<typeof SegmentInputSchema>;

export function toSession(s: SessionRow): ListenSession {
  return {
    id: s.id,
    bandNumber: s.bandNumber,
    subjectName: s.subjectName,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    segmentCount: s.segmentCount,
    headHash: s.headHash,
  };
}

export async function startSession(
  deps: Deps,
  user: UserRow,
  input: { bandNumber: number; subjectName: string },
): Promise<ListenSession> {
  const [row] = await deps.db
    .insert(listenSessions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      bandNumber: input.bandNumber,
      subjectName: input.subjectName,
      startedAt: deps.now(),
      headHash: GENESIS_HASH,
    })
    .returning();
  if (!row) throw new Error("insert returned nothing");
  return toSession(row);
}

export async function endSession(deps: Deps, sessionId: string): Promise<ListenSession> {
  const [row] = await deps.db
    .update(listenSessions)
    .set({ endedAt: deps.now() })
    .where(eq(listenSessions.id, sessionId))
    .returning();
  if (!row) throw new ContractError("not_found", "no such session");
  return toSession(row);
}

/**
 * Append final transcript segments, in order. A retry of a batch that was already accepted
 * is fine (same content, same seq): those segments are skipped. Anything else out of order
 * is refused, so the hash chain has no gaps.
 */
export async function appendSegments(
  deps: Deps,
  sessionId: string,
  input: Segment[],
): Promise<AppendSegmentsResponse & { session: SessionRow; newSegments: (typeof segments.$inferSelect)[] }> {
  return deps.db.transaction(async (tx) => {
    const [s] = await tx.select().from(listenSessions).where(eq(listenSessions.id, sessionId)).for("update");
    if (!s) throw new ContractError("not_found", "no such session");
    if (s.endedAt) throw new ContractError("conflict", "this session has ended");

    const ordered = [...input].sort((a, b) => a.seq - b.seq);
    const fresh: (typeof segments.$inferInsert)[] = [];
    let next = s.segmentCount;
    let head = s.headHash;

    for (const seg of ordered) {
      if (seg.seq < s.segmentCount) {
        const [stored] = await tx
          .select()
          .from(segments)
          .where(and(eq(segments.sessionId, s.id), eq(segments.seq, seg.seq)));
        const same =
          stored &&
          stored.seq === seg.seq &&
          stored.text === seg.text &&
          stored.startMs === seg.startMs &&
          stored.endMs === seg.endMs;
        if (!same)
          throw new ContractError(
            "segment_out_of_order",
            `seq ${seg.seq} was already accepted with other content`,
          );
        continue;
      }
      if (seg.seq !== next) {
        throw new ContractError("segment_out_of_order", `expected seq ${next}, got ${seg.seq}`, 409, {
          expected: next,
        });
      }
      const row = {
        id: crypto.randomUUID(),
        sessionId: s.id,
        seq: seg.seq,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text,
        confidence: seg.confidence,
        speaker: seg.speaker,
        prevHash: head,
        hash: "",
      };
      row.hash = await hashSegment(row, head);
      head = row.hash;
      next += 1;
      fresh.push(row);
    }

    const inserted = fresh.length ? await tx.insert(segments).values(fresh).returning() : [];
    const [updated] = await tx
      .update(listenSessions)
      .set({ segmentCount: next, headHash: head })
      .where(eq(listenSessions.id, s.id))
      .returning();
    return {
      accepted: inserted.length,
      segmentCount: next,
      headHash: head,
      session: updated ?? s,
      newSegments: inserted,
    };
  });
}
