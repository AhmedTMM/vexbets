"use client";

import { useListener } from "@/lib/listener";

/** How many of the newest words to render; the box shows at most two lines of them. */
export const CAPTION_WORDS = 24;

export function captionWords(text: string, max = CAPTION_WORDS): string[] {
  return text.split(/\s+/).filter(Boolean).slice(-max);
}

/**
 * The caption text itself, no hooks, so it can be tested. Words are separate elements
 * (each fades in as it arrives) with real spaces BETWEEN them, so lines wrap at spaces.
 * The box is exactly two lines tall and bottom-anchored: the newest words always show,
 * older ones scroll up out of view, like karaoke.
 */
export function CaptionText({
  previous,
  current,
  speaking,
}: {
  previous?: string;
  current: string;
  speaking: boolean;
}) {
  const words = captionWords(current);
  return (
    <div className="mx-auto max-w-4xl text-center">
      {previous && (
        <p className="caption-fade mb-1 truncate font-medium text-base text-muted sm:text-lg">{previous}</p>
      )}
      {words.length > 0 ? (
        <div className="flex h-[2lh] flex-col justify-end overflow-hidden font-semibold text-2xl leading-snug tracking-tight sm:text-4xl">
          <p>
            {words.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: words grow in place as the sentence is spoken
              <span key={`${i}-${w}`}>
                {i > 0 && " "}
                <span
                  className={`caption-word ${speaking && i === words.length - 1 ? "text-yes" : "text-ink"}`}
                >
                  {w}
                </span>
              </span>
            ))}
          </p>
        </div>
      ) : (
        <p className="font-medium text-lg text-muted sm:text-2xl">
          <span aria-hidden="true" className="live-dot mr-2 inline-block h-2.5 w-2.5 rounded-full bg-yes" />
          Listening…
        </p>
      )}
    </div>
  );
}

/**
 * What the band hears, as big karaoke-style captions pinned to the bottom of the screen,
 * while listening, on every page.
 */
export function LiveCaptions() {
  const l = useListener();
  if (!l.connected) return null;

  const finished = l.lines.slice(-2);
  const previous = l.interim ? finished.at(-1) : finished.at(-2);
  const current = l.interim || finished.at(-1)?.text || "";

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
        <CaptionText previous={previous?.text} current={current} speaking={Boolean(l.interim)} />
      </div>
    </>
  );
}
