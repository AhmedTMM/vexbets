import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAPTION_WORDS, CaptionText, captionWords } from "../src/components/LiveCaptions";

const html = (current: string, speaking = false) =>
  renderToStaticMarkup(createElement(CaptionText, { current, speaking }));

/** The text a reader (or a line-breaker) sees: tags stripped. */
const text = (h: string) => h.replace(/<[^>]+>/g, "");

describe("karaoke captions", () => {
  it("regression: keeps real spaces between words, outside the word elements", () => {
    const h = html("i miss my ex so much");
    expect(text(h)).toContain("i miss my ex so much");
    // No word element ends with a space (a trailing space inside inline-block collapses).
    expect(h).not.toMatch(/ <\/span>/);
  });

  it("shows only the newest words of a long sentence", () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
    expect(captionWords(long)).toHaveLength(CAPTION_WORDS);
    expect(captionWords(long).at(-1)).toBe("w59");
    expect(text(html(long))).not.toContain("w0 ");
  });

  it("is a two-line, bottom-anchored box", () => {
    expect(html("hello there")).toMatch(/h-\[2lh\][^"]*flex-col[^"]*justify-end[^"]*overflow-hidden/);
  });

  it("highlights the word being spoken only while speaking", () => {
    expect(html("no cap", true)).toMatch(/text-yes">cap/);
    expect(html("no cap", false)).not.toContain("text-yes");
  });

  it("ignores extra whitespace", () => {
    expect(captionWords("  no   cap \n fr ")).toEqual(["no", "cap", "fr"]);
  });
});
