import OpenAI from "openai";
import type { SttTokens } from "./types";

export const DEFAULT_STT_MODEL = "gpt-live-transcribe";

/**
 * OpenAI Realtime transcription: mint a short-lived client secret for a transcription-only
 * session. The listener opens wss://api.openai.com/v1/realtime?intent=transcription with it,
 * appends 24 kHz PCM16, commits each spoken line (gpt-live-transcribe has no server VAD) and
 * persists `conversation.item.input_audio_transcription.completed` events.
 * No speaker labels in Realtime, so segments carry speaker: null.
 */
export function openaiSttTokens(opts: {
  apiKey: string;
  model?: string;
  ttlSeconds?: number;
  client?: OpenAI;
}): SttTokens {
  const client = opts.client ?? new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_STT_MODEL;
  return {
    provider: "openai",
    async mint() {
      const secret = await client.realtime.clientSecrets.create({
        expires_after: { anchor: "created_at", seconds: opts.ttlSeconds ?? 600 },
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: { model, languages: ["en"] },
              turn_detection: null,
            },
          },
        },
      });
      return { token: secret.value, expiresAt: new Date(secret.expires_at * 1000) };
    },
  };
}
