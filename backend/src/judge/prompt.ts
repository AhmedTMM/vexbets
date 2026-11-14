import type { JudgeInput } from "./types";

export const SYSTEM_PROMPT = `You are the judge of a friendly prediction market about what people say out loud.
A wristband microphone records the people around it, and speech-to-text turns it into the transcript below.
Speech-to-text makes mistakes: accept obvious mishearings of the same words, but never invent words.

Judge by meaning. Paraphrases, synonyms, slang and clear context count when the criteria are about a
topic, an intent or an event ("talks about their ex" is met by "we broke up last week" or "I miss her").
When the criteria put exact words in quotes, those words (or an obvious mishearing of them) must be said;
a paraphrase does not count.

Rules:
- Decide only from the transcript. Do not assume anything that is not in it.
- "verdict" is exactly one outcome label from the list, word for word without the quotes, or "UNDETERMINED".
- In EARLY mode the window is still open: answer an outcome only if the transcript already proves it beyond doubt. Otherwise answer UNDETERMINED.
- In FINAL mode the window is closed: answer the outcome the transcript supports. If nothing decisive was said, answer UNDETERMINED.
- For any outcome verdict, quote the exact words that prove it in "evidence", with the [id] of the line they come from. Copy the words exactly as written in that line.
- Keep "rationale" to one or two sentences.`;

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function buildPrompt({ market, mode, transcript }: JudgeInput): string {
  const outcomes = market.outcomes
    .map((o) => `- "${o.label}"${o.criteria ? ` (counts when: ${o.criteria})` : ""}`)
    .join("\n");
  const lines = transcript.length
    ? transcript
        .map(
          (l) =>
            `[${l.segmentId}] ${clock(l.startMs)}${l.speaker !== null ? ` speaker ${l.speaker}` : ""}: ${l.text}`,
        )
        .join("\n")
    : "(nothing heard yet)";
  return `MODE: ${mode.toUpperCase()}

QUESTION: ${market.question}
SUCCESS CRITERIA: ${market.criteria}
THE BAND IS WORN BY: ${market.subjectName}
WINDOW: ${market.opensAt} to ${market.closesAt}

OUTCOMES:
${outcomes}

TRANSCRIPT (oldest first):
${lines}`;
}
