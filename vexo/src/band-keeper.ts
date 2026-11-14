/**
 * Holds one band connection across Start/Stop, so pressing Start again does not reopen
 * Chrome's chooser (and need another double-tap). A different band, or switching between
 * the real and the pretend band, closes the old connection first.
 */
export interface Disconnectable {
  disconnect(): Promise<void>;
}

export function createBandKeeper<C extends Disconnectable>(connect: (key: string) => Promise<C>) {
  let conn: C | null = null;
  let key = "";
  return {
    /** The connection for `wanted`, reusing the current one if it is the same band. */
    async acquire(wanted: string): Promise<{ conn: C; fresh: boolean }> {
      if (conn && key === wanted) return { conn, fresh: false };
      await this.release();
      const next = await connect(wanted);
      conn = next;
      key = wanted;
      return { conn: next, fresh: true };
    },
    async release(): Promise<void> {
      const old = conn;
      conn = null;
      key = "";
      await old?.disconnect().catch(() => {});
    },
    get current(): C | null {
      return conn;
    },
  };
}
