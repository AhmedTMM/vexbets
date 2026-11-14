# backend

Next.js (route handlers only) on Vercel, Postgres. Implements every endpoint in
[`contract/src/api.ts`](../contract/src/api.ts). Not built yet.

To do:

- Route handlers for `/api/v1/*`, parsing bodies with the contract's schemas and
  answering errors with `ContractError#toBody()`.
- Trades in one Postgres transaction (`SELECT ... FOR UPDATE` on the market row), priced with
  `lmsr.quoteTrade`, idempotent on `idempotencyKey`.
- Segment ingest: check `seq`, compute `hashSegment(seg, headHash)`, store.
- Judge job (Vercel Cron, plus after each ingest when `resolveEarly`): send the window's
  transcript to Gemini with `z.toJSONSchema(JudgeOutput)` as the response schema, then
  resolve and pay out.
- Env: `DATABASE_URL`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY` (only to mint STT tokens).
