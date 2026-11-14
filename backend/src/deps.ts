import type { Db } from "./db/client";

export interface Config {
  /** Credits every new email gets on first sight. */
  startingBalance: number;
}

export const defaultConfig: Config = {
  startingBalance: 10_000,
};

/** Everything a handler may touch. Tests swap the clock, the judge and the database. */
export interface Deps {
  db: Db;
  now: () => Date;
  log: { error(err: unknown): void };
  config: Config;
}
