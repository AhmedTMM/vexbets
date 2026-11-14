"use client";

import type { Market } from "@vexbets/contract";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { credits } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { yesNo } from "@/lib/market";

interface Toast {
  id: string;
  marketId: string;
  won: boolean;
  title: string;
  body: string;
}

const SEEN = "vexbets.seen-resolutions";

function readSeen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN) ?? "null") ?? [];
  } catch {
    return [];
  }
}

/** "You won" / "You lost" when a market you hold shares in resolves. */
export function WinToaster({ meId }: { meId: string }) {
  const { data } = usePoll(
    async () => {
      const [{ positions }, { markets }] = await Promise.all([
        api("listPositions"),
        api("listMarkets", { query: { status: "resolved", limit: 100 } }),
      ]);
      const held = new Set(positions.filter((p) => p.shares > 0 || p.costBasis !== 0).map((p) => p.marketId));
      return markets.filter((m) => held.has(m.id) || m.resolution?.payouts.some((p) => p.userId === meId));
    },
    meId,
    2500,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const primed = useRef(false);

  useEffect(() => {
    if (!data) return;
    const seen = readSeen();
    // On the first load of a fresh tab, don't replay old results.
    if (!primed.current) {
      primed.current = true;
      if (sessionStorage.getItem(SEEN) === null) {
        sessionStorage.setItem(SEEN, JSON.stringify(data.map((m) => m.id)));
        return;
      }
    }
    const fresh = data.filter((m) => !seen.includes(m.id));
    if (fresh.length === 0) return;
    sessionStorage.setItem(SEEN, JSON.stringify([...seen, ...fresh.map((m) => m.id)]));
    setToasts((t) => [...t, ...fresh.map((m) => toToast(m, meId))]);
  }, [data, meId]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 10_000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((t) => (
        <Link
          key={t.id}
          href={`/markets/${t.marketId}`}
          onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          className={`toast-in w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
            t.won ? "border-yes bg-surface" : "border-line-strong bg-surface"
          }`}
        >
          <div className="text-2xl font-semibold">{t.title}</div>
          <div className="mt-1 text-sm text-muted">{t.body}</div>
        </Link>
      ))}
    </div>
  );
}

function toToast(m: Market, meId: string): Toast {
  const r = m.resolution;
  const yn = yesNo(m);
  const side = r && yn ? (r.outcomeId === yn.yes.id ? "YES" : "NO") : "?";
  const payout = r?.payouts.find((p) => p.userId === meId)?.credits ?? 0;
  const why = r?.via === "fallback" ? "Nothing was heard before it closed." : "The band heard it.";
  return payout > 0
    ? {
        id: m.id,
        marketId: m.id,
        won: true,
        title: `🎉 You won ${credits(payout)}`,
        body: `“${m.question}” settled ${side}. ${why}`,
      }
    : {
        id: m.id,
        marketId: m.id,
        won: false,
        title: "Market settled",
        body: `“${m.question}” settled ${side}. ${why}`,
      };
}
