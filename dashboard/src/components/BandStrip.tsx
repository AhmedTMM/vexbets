"use client";

import type { Market } from "@vexbets/contract";
import { useState } from "react";
import { clock } from "@/lib/format";
import { findFriend } from "@/lib/friends";
import { useListener } from "@/lib/listener";

/** The band for this market: listening status, connect / stop, latest line, test box. */
export function BandStrip({ market }: { market: Market }) {
  const l = useListener();
  const [typed, setTyped] = useState("");
  const mine = l.session?.bandNumber === market.bandNumber;
  const friend = findFriend(market.bandNumber) ?? { name: market.subjectName, band: market.bandNumber };
  const last = l.lines.at(-1);

  if (!mine) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-line-strong" />
          Not listening to {friend.name}'s band
        </span>
        <button type="button" onClick={() => l.start(friend)} className="btn btn-ghost h-8 px-3 text-[13px]">
          Listen to {friend.name}
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-yes/25 bg-yes/[0.04]" aria-label="Band">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="live-dot h-2 w-2 shrink-0 rounded-full bg-yes" />
          <span className="text-sm">
            Listening to <span className="font-semibold">{friend.name}</span>
            <span className="meta"> · band #{market.bandNumber}</span>
          </span>
          {l.status && <span className="meta hidden truncate min-[1700px]:inline">· {l.status}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="meta">
            sent {l.sent}
            {l.waiting > 0 ? ` · waiting ${l.waiting}` : ""}
            {l.retrying ? " · retrying" : ""}
          </span>
          {!l.connected && (
            <button
              type="button"
              onClick={l.connectBand}
              className="btn btn-primary h-8 whitespace-nowrap px-3 text-[13px]"
            >
              Connect band
            </button>
          )}
          <button type="button" onClick={l.stop} className="btn btn-ghost h-8 px-3 text-[13px]">
            Stop
          </button>
        </div>
      </div>

      {(l.problem || l.needKey) && (
        <div className="space-y-2 border-line border-t px-4 py-2.5">
          {l.problem && <p className="text-no text-xs">{l.problem}</p>}
          {l.needKey && (
            <input
              type="password"
              autoComplete="off"
              aria-label="Deepgram key (kept in this tab only)"
              placeholder="Deepgram key (kept in this tab only)"
              value={l.manualKey}
              onChange={(e) => l.setManualKey(e.target.value)}
              className="field h-9 text-[13px]"
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-line border-t px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-sm" aria-live="polite">
          {l.interim ? (
            <span className="text-muted">{l.interim}</span>
          ) : last ? (
            <>
              <span className="meta mr-2">{clock(last.at).slice(0, 5)}</span>
              {last.text}
            </>
          ) : (
            <span className="text-muted">Nothing heard yet.</span>
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            l.say(typed);
            setTyped("");
          }}
          className="flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a test line"
            aria-label="Test without the band: type what was said and press Enter"
            className="field h-8 w-56 text-[13px]"
          />
          <button type="submit" className="btn btn-ghost h-8 px-3 text-[13px]">
            Send
          </button>
        </form>
      </div>
    </section>
  );
}
