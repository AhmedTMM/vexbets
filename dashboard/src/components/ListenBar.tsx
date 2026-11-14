"use client";

import { Button, Checkbox, Input } from "@heroui/react";
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
      className={`panel px-4 py-4 sm:px-5 ${listening ? "border-yes/40 bg-yes/[0.04]" : ""}`}
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

        {/* Phones: the controls take their own full-width row, Listen / Stop as a big button. */}
        <span className="flex w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto">
          {l.notifications !== "unsupported" && l.notifications !== "granted" && (
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => void l.enableNotifications()}
              isDisabled={l.notifications === "denied"}
              className="max-sm:h-10"
            >
              {l.notifications === "denied" ? "Notifications blocked" : "Notify me when markets settle"}
            </Button>
          )}
          {!listening && (
            <Checkbox
              isSelected={consent}
              onChange={setConsent}
              variant="secondary"
              className="max-sm:min-h-10 max-sm:w-full"
            >
              <Checkbox.Content className="text-sm">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                People near the band agreed to be recorded
              </Checkbox.Content>
            </Checkbox>
          )}
          {listening ? (
            <Button
              size="sm"
              variant="danger-soft"
              onPress={() => void l.stop()}
              className="max-sm:h-11 max-sm:w-full max-sm:text-base"
            >
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onPress={() => void onListen()}
              isDisabled={!consent}
              isPending={busy}
              className="max-sm:h-11 max-sm:w-full max-sm:text-base"
              aria-label={
                consent ? "Listen (double-tap the band first)" : "Listen (tick the consent box first)"
              }
            >
              {busy ? "Connecting…" : "Listen"}
            </Button>
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
            <Input
              type="password"
              autoComplete="off"
              aria-label="Deepgram key (kept in this tab only)"
              placeholder="Deepgram key (kept in this tab only)"
              value={l.manualKey}
              onChange={(e) => l.setManualKey(e.target.value)}
              className="w-full max-w-sm sm:text-[13px]"
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
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="No band? Type what was said and press Enter"
          aria-label="Test without the band: type what was said and press Enter"
          className="w-full max-w-md sm:text-[13px]"
        />
      </form>
    </section>
  );
}
