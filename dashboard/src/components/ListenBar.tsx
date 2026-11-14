"use client";

import { Button, Checkbox, Input, Modal, Switch } from "@heroui/react";
import { useState } from "react";
import { useListener } from "@/lib/listener";

/**
 * Listening, as one compact row at the top of every page. Market agnostic: one band, and
 * every market on it settles from what it hears. "Listen" opens a short setup dialog
 * (consent, notifications); its Start button connects the band straight from the click,
 * which Web Bluetooth requires.
 */
export function ListenBar() {
  const l = useListener();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const listening = l.connected;
  const notifyOn = l.notifications === "granted";

  const start = async (close: () => void) => {
    setBusy(true);
    await l.listen(); // first: the band chooser must open from this click
    setBusy(false);
    close();
  };

  return (
    <section
      aria-label="Listening"
      className={`panel px-4 py-3 sm:px-5 ${listening ? "border-yes/40 bg-yes/[0.04]" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${listening ? "live-dot bg-yes" : "bg-line-strong"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{listening ? "Listening" : "Not listening"}</span>
            <span className="meta">band #{l.band}</span>
            {listening && l.level && (
              <span className="meta num hidden sm:inline">
                · mic {l.level.db.toFixed(0)} dB · room {l.level.floor.toFixed(0)}
              </span>
            )}
            {(l.sent > 0 || l.waiting > 0) && (
              <span className="meta num">
                · {l.sent} sent{l.waiting > 0 ? ` · ${l.waiting} waiting` : ""}
                {l.retrying ? " · retrying" : ""}
              </span>
            )}
          </div>
          {/* What it hears shows as big captions at the bottom (LiveCaptions); here only
              the status while connecting. */}
          {l.status && !listening && <p className="mt-0.5 truncate text-muted text-sm">{l.status}</p>}
        </div>

        {listening ? (
          <Button size="sm" variant="danger-soft" onPress={() => void l.stop()}>
            Stop
          </Button>
        ) : (
          <Modal>
            <Button size="sm" isPending={busy}>
              {busy ? "Connecting…" : "Listen"}
            </Button>
            <Modal.Backdrop variant="blur">
              <Modal.Container placement="center" size="sm">
                <Modal.Dialog>
                  {({ close }) => (
                    <>
                      <Modal.CloseTrigger />
                      <Modal.Header>
                        <Modal.Heading>Listen to band #{l.band}</Modal.Heading>
                      </Modal.Header>
                      <Modal.Body className="space-y-4">
                        <p className="text-muted text-sm">
                          Double-tap the band until it blinks blue, then press Start and pick it in the list.
                          Its light stays solid blue while the microphone is on.
                        </p>
                        <Checkbox isSelected={consent} onChange={setConsent}>
                          <Checkbox.Content className="text-sm">
                            <Checkbox.Control className="border border-line-strong">
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            The people near the band agreed to be recorded
                          </Checkbox.Content>
                        </Checkbox>
                        {l.notifications !== "unsupported" && (
                          <Switch
                            className="flex items-center gap-3"
                            isSelected={notifyOn}
                            isDisabled={notifyOn || l.notifications === "denied"}
                            onChange={(on) => {
                              if (on) void l.enableNotifications();
                            }}
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <span className="text-sm">
                                {l.notifications === "denied"
                                  ? "Notifications blocked in the browser"
                                  : "Notify me when markets settle"}
                              </span>
                            </Switch.Content>
                          </Switch>
                        )}
                      </Modal.Body>
                      <Modal.Footer>
                        <Button variant="tertiary" onPress={close}>
                          Cancel
                        </Button>
                        <Button isDisabled={!consent} isPending={busy} onPress={() => void start(close)}>
                          Start
                        </Button>
                      </Modal.Footer>
                    </>
                  )}
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>
        )}
      </div>

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
              className="w-full max-w-sm text-base sm:text-[13px]"
            />
          )}
        </div>
      )}
    </section>
  );
}
