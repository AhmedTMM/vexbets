"use client";

import type { Me } from "@vexbets/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { getEmail } from "./session";

/**
 * Loads data and loads it again every `ms` and after refreshAll(). The backend has no push
 * channel, so polling is how prices, balances and resolutions stay live.
 * `key` reloads immediately when it changes (e.g. a market id).
 */
export function usePoll<T>(load: () => Promise<T>, key: string, ms = 2000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the reload trigger
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) void reload();
    };
    run();
    const timer = setInterval(run, ms);
    window.addEventListener("vexbets:refresh", run);
    window.addEventListener("vexbets:session", run);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("vexbets:refresh", run);
      window.removeEventListener("vexbets:session", run);
    };
  }, [key, ms, reload]);

  return { data, error, reload };
}

/** The signed-in user, or null when this tab has no email yet. */
export function useMe() {
  return usePoll<Me | null>(async () => (getEmail() ? api("getMe") : null), "me", 3000);
}

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms = 1000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}
