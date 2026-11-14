import type { Db } from "./db/client";
import type { Judge } from "./judge/types";
import type { SttTokens } from "./stt/types";

export interface Config {
  /** Credits every new email gets on first sight. */
  startingBalance: number;
  /** Requests close due markets lazily, at most this often per process. */
  closeEveryMs: number;
}

export const defaultConfig: Config = {
  startingBalance: 10_000,
  closeEveryMs: 10_000,
};

/** Everything a handler may touch. Tests swap the clock, the judge and the database. */
export interface Deps {
  db: Db;
  now: () => Date;
  log: { error(err: unknown): void };
  judge: Judge;
  /**
   * Run slow work (judging) without making the caller wait for it. Next.js: after(); tests
   * await it, so results are deterministic.
   */
  afterResponse: (task: () => Promise<void>) => void | Promise<void>;
  /** Unset when no STT provider key is configured. */
  stt?: SttTokens;
  config: Config;
}
