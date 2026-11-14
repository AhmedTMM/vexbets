// Sends final transcript lines to the backend in order, with seq 0, 1, 2, ... and no gaps.
// A failed batch is sent again as it was: the backend skips segments it already accepted.

import type { Client, SegmentInput } from "@vexbets/contract";

const MAX_BATCH = 50;

export class SegmentQueue {
  private nextSeq = 0;
  private pending: SegmentInput[] = [];
  lastError: string | null = null;
  sent = 0;

  constructor(
    private readonly call: Client,
    private readonly sessionId: string,
    private readonly onChange: () => void = () => {},
  ) {}

  /** Add one final line. Empty text is ignored. */
  push(text: string, startMs: number, endMs: number, confidence = 0.9, speaker: string | null = null): void {
    const t = text.trim().slice(0, 5000);
    if (!t) return;
    const start = Math.max(0, Math.round(startMs));
    this.pending.push({
      seq: this.nextSeq++,
      startMs: start,
      endMs: Math.max(start, Math.round(endMs)),
      text: t,
      confidence: Math.min(1, Math.max(0, confidence)),
      speaker,
    });
    void this.flush();
  }

  get waiting(): number {
    return this.pending.length;
  }

  /**
   * Send everything waiting; resolves when the queue is empty or a send failed.
   * Safe to call often: callers share the one run in progress, so only one request is
   * ever in flight and segments stay in order.
   */
  flush(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private running: Promise<void> | null = null;

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending.slice(0, MAX_BATCH);
      try {
        await this.call("appendSegments", {
          params: { sessionId: this.sessionId },
          body: { segments: batch },
        });
        this.pending.splice(0, batch.length);
        this.sent += batch.length;
        this.lastError = null;
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        return; // retried by the next flush (the listen page calls it every few seconds)
      } finally {
        this.onChange();
      }
    }
  }
}
