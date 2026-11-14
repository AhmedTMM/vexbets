import type { Db } from "./db/client";
import type { Judge } from "./judge/types";

export interface Config {
  /** Credits every new email gets on first sight. */
  startingBalance: number;
  /** A market is judged at most once per this many ms while its window is open. */
  judgeEveryMs: number;
}

export const defaultConfig: Config = {
  startingBalance: 10_000,
  judgeEveryMs: 30_000,
};

/** Everything a handler may touch. Tests swap the clock, the judge and the database. */
export interface Deps {
  db: Db;
  now: () => Date;
  log: { error(err: unknown): void };
  judge: Judge;
  config: Config;
}
