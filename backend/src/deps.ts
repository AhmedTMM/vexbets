import type { Db } from "./db/client";
import type { Judge } from "./judge/types";
import type { SttTokens } from "./stt/types";

export interface Config {
  /** Credits every new email gets on first sight. */
  startingBalance: number;
  /** A market is judged at most once per this many ms while its window is open. */
  judgeEveryMs: number;
  /** Requests close due markets lazily, at most this often per process. */
  closeEveryMs: number;
}

export const defaultConfig: Config = {
  startingBalance: 10_000,
  judgeEveryMs: 30_000,
  closeEveryMs: 10_000,
};

/** Everything a handler may touch. Tests swap the clock, the judge and the database. */
export interface Deps {
  db: Db;
  now: () => Date;
  log: { error(err: unknown): void };
  judge: Judge;
  /** Unset when no STT provider key is configured. */
  stt?: SttTokens;
  config: Config;
}
