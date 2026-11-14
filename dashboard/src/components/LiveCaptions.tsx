"use client";

import { useListener } from "@/lib/listener";

/**
 * What the band hears, as big karaoke-style captions pinned to the bottom of the screen:
 * the words being spoken right now, large and bright as they arrive, with the line before
 * them faded above. Shown while listening, on every page.
 */
export function LiveCaptions() {
  const l = useListener();
  if (!l.connected) return null;

  const finished = l.lines.slice(-2);
  const previous = l.interim ? finished.at(-1) : finished.at(-2);
  const current = l.interim || finished.at(-1)?.text || "";
  const speaking = Boolean(l.interim);
  const words = current.split(/\s+/).filter(Boolean);

  return (
    <>
      {/* Room at the end of the page, so nothing stays hidden under the captions. */}
      <div aria-hidden="true" className="h-36 sm:h-44" />
      <div
        role="log"
        aria-live="polite"
        aria-label="Live transcript"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pt-10 pb-5 sm:pb-7"
      >
        <div className="mx-auto max-w-4xl text-center">
          {previous && (
            <p className="caption-fade mb-1 truncate font-medium text-base text-muted sm:text-lg">
              {previous.text}
            </p>
          )}
          {words.length > 0 ? (
            <p
              key={finished.at(-1)?.key ?? "live"}
              className="font-semibold text-2xl leading-snug tracking-tight sm:text-4xl"
            >
              {words.map((w, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: words re-render in place as the sentence grows
                  key={i}
                  className={`caption-word ${speaking && i === words.length - 1 ? "text-yes" : "text-ink"}`}
                >
                  {w}{" "}
                </span>
              ))}
            </p>
          ) : (
            <p className="font-medium text-lg text-muted sm:text-2xl">
              <span
                aria-hidden="true"
                className="live-dot mr-2 inline-block h-2.5 w-2.5 rounded-full bg-yes"
              />
              Listening…
            </p>
          )}
        </div>
      </div>
    </>
  );
}
