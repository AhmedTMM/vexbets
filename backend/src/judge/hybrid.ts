import type { JudgeOutput } from "@vexbets/contract";
import type { Judge, JudgeInput } from "./types";

/**
 * Two judges in one:
 *
 * 1. Heuristic, instant and free: a yes/no market whose question quotes the exact words
 *    ("Will anyone say 'no cap'?") resolves the moment a transcript line contains them,
 *    quoting that line. No model call, so the delay is only speech-to-text's.
 * 2. Semantic, the model: everything else, judged by meaning ("Will they talk about their
 *    ex?"), and quoted phrases the heuristic did not find (speech-to-text may have misheard
 *    them, which the model can recognise).
 */

export const HEURISTIC_MODEL = "heuristic-exact-phrase";

/** A quoted span: the quote marks must not touch letters, so "Sam's" or "don't" never open one. */
const QUOTED = /(?<![\p{L}\p{N}])["“'‘]([^"”'’]{2,80})["”'’](?![\p{L}\p{N}])/gu;

/**
 * The exact words a market's question quotes ("Will anyone say 'no cap'?"). Only the
 * question: success criteria often quote examples ("e.g. 'my ex'"), which are for the
 * semantic judge, not exact triggers.
 */
export function quotedPhrases(input: JudgeInput): string[] {
  const out = new Set<string>();
  for (const m of input.market.question.matchAll(QUOTED)) {
    const p = (m[1] ?? "").trim();
    if (p && p.split(/\s+/).length <= 8) out.add(p);
  }
  return [...out];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where `phrase` occurs in `line` as whole words, ignoring case, punctuation between words
 * and extra spaces ("No cap!", "no, cap" both match "no cap"). Returns the exact slice of
 * the line, so the quote is always a substring of the transcript.
 */
export function findPhrase(line: string, phrase: string): string | null {
  const words = phrase
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)
    .map(escapeRegex);
  if (words.length === 0) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`, "iu");
  const m = re.exec(line);
  return m ? m[0] : null;
}

/** The outcome that wins when the phrase is heard: the one that is not the fallback. */
function heardOutcome(input: JudgeInput) {
  const { outcomes, fallbackOutcomeId } = input.market;
  if (outcomes.length !== 2) return null;
  return outcomes.find((o) => o.id !== fallbackOutcomeId) ?? null;
}

export function heuristicVerdict(input: JudgeInput): JudgeOutput | null {
  const winner = heardOutcome(input);
  if (!winner) return null;
  for (const phrase of quotedPhrases(input)) {
    for (const line of input.transcript) {
      const quote = findPhrase(line.text, phrase);
      if (quote) {
        return {
          verdict: winner.label,
          confidence: 1,
          rationale: `The exact words "${phrase}" were heard.`,
          evidence: [{ segmentId: line.segmentId, quote }],
        };
      }
    }
  }
  return null;
}

export function hybridJudge(semantic: Judge): Judge {
  return {
    model: semantic.model,
    async judge(input) {
      const quick = heuristicVerdict(input);
      if (quick) return { ...quick, model: HEURISTIC_MODEL };
      return semantic.judge(input);
    },
  };
}
