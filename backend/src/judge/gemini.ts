import { GoogleGenAI } from "@google/genai";
import { JudgeOutput } from "@vexbets/contract";
import { z } from "zod";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import type { Judge } from "./types";

/** Gemini as the judge, with the contract's JudgeOutput as the enforced response schema. */
export function geminiJudge(opts: { apiKey: string; model: string }): Judge {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const schema = z.toJSONSchema(JudgeOutput);
  return {
    model: opts.model,
    async judge(input) {
      const res = await ai.models.generateContent({
        model: opts.model,
        contents: buildPrompt(input),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0,
        },
      });
      const text = res.text;
      if (!text) throw new Error("Gemini returned no text");
      return JudgeOutput.parse(JSON.parse(text));
    },
  };
}
