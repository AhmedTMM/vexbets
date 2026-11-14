import type { JudgeOutput, Market } from "@vexbets/contract";

export interface TranscriptLine {
  segmentId: string;
  startMs: number;
  speaker: string | null;
  text: string;
}

export interface JudgeInput {
  market: Market;
  /**
   * "early": the window is still open. Decide only if the transcript already proves an
   * outcome; otherwise UNDETERMINED.
   * "final": the window has closed. Decide from everything heard; UNDETERMINED means
   * nothing decisive was said and the market's fallback outcome wins.
   */
  mode: "early" | "final";
  /** Every line heard in the market's window so far, oldest first: the judge's context. */
  transcript: TranscriptLine[];
}

export interface Judge {
  /** Model id recorded in the Decision. */
  model: string;
  /** `model`, when set, names what actually decided (a hybrid judge's heuristic, say). */
  judge(input: JudgeInput): Promise<JudgeOutput & { model?: string }>;
}
