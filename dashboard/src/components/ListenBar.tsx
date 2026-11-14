"use client";

import { useState } from "react";
import { clock } from "@/lib/format";
import { useListener } from "@/lib/listener";

/**
 * Listening, at the top of every page. Market agnostic: one band, and every market on it
 * settles from what it hears. One click connects the band, opens a session and starts
 * speech-to-text; it keeps running while you browse.
 */
export function ListenBar() {
  const l = useListener();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const listening = l.connected;
  const last = l.lines.at(-1);

  const onListen = async () => {
    setBusy(true);
    await l.listen();
    setBusy(false);
  };

  return (
    <section
      aria-label="Listening"
      className={`panel px-5 py-4 ${listening ? "border-yes/40 bg-yes/[0.04]" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${listening ? "live-dot bg-yes" : "bg-line-strong"}`}
          />
          <span className="font-semibold">{listening ? "Listening" : "Not listening"}</span>
          <span className="meta">band #{l.band}</span>
        </span>

        {listening && l.level && (
          <span className="meta num" title="What the band hears, and the room's noise floor">
            mic {l.level.db.toFixed(0)} dB · room {l.level.floor.toFixed(0)}
          </span>
        )}
        {(l.sent > 0 || l.waiting > 0) && (
          <span className="meta num">
            {l.sent} sent{l.waiting > 0 ? ` · ${l.waiting} waiting` : ""}
            {l.retrying ? " · retrying" : ""}
          </span>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-3">
          {l.notifications !== "unsupported" && l.notifications !== "granted" && (
            <button
              type="button"
              onClick={l.enableNotifications}
              disabled={l.notifications === "denied"}
              className="btn btn-ghost h-9 px-3 text-[13px]"
              title={l.notifications === "denied" ? "Blocked in the browser's site settings" : ""}
            >
              {l.notifications === "denied" ? "Notifications blocked" : "Notify me when markets settle"}
            </button>
          )}
          {!listening && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              People near the band agreed to be recorded
            </label>
          )}
          {listening ? (
            <button type="button" onClick={l.stop} className="btn btn-ghost h-9 px-4 text-[13px]">
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onListen}
              disabled={!consent || busy}
              className="btn btn-primary h-9 px-4 text-[13px]"
              title={consent ? "Double-tap the band first (blue blink)" : "Tick the consent box first"}
            >
              {busy ? "Connecting…" : "Listen"}
            </button>
          )}
        </span>
      </div>

      {(listening || l.lines.length > 0 || l.status) && (
        <p className="mt-3 truncate text-sm" aria-live="polite">
          {l.interim ? (
            <span className="text-muted">{l.interim}</span>
          ) : last ? (
            <>
              <span className="meta mr-2">{clock(last.at).slice(0, 5)}</span>
              {last.text}
            </>
          ) : (
            <span className="text-muted">{l.status || "Nothing heard yet."}</span>
          )}
        </p>
      )}

      {(l.problem || l.needKey) && (
        <div className="mt-3 space-y-2">
          {l.problem && <p className="text-no text-xs">{l.problem}</p>}
          {l.needKey && (
            <input
              type="password"
              autoComplete="off"
              aria-label="Deepgram key (kept in this tab only)"
              placeholder="Deepgram key (kept in this tab only)"
              value={l.manualKey}
              onChange={(e) => l.setManualKey(e.target.value)}
              className="field h-9 max-w-sm text-[13px]"
            />
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void l.say(typed);
          setTyped("");
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="No band? Type what was said and press Enter"
          aria-label="Test without the band: type what was said and press Enter"
          className="field h-8 max-w-md text-[13px]"
        />
      </form>
    </section>
  );
}
