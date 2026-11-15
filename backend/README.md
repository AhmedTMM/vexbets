# backend

Next.js route handlers on Vercel, Postgres through Drizzle. Implements every endpoint in
[`contract/src/api.ts`](../contract/src/api.ts) behind one router (`src/http.ts`).

```
app/api/v1/[...path]   every contract endpoint -> src/http.ts -> src/handlers.ts
app/api/health         database check
app/api/cron/tick      closes due markets (daily backstop; requests also close them)
src/services/          users, markets, trading, ingest, resolution
src/judge/             OpenAI judge, prompt, fake judges for dev and tests
src/stt/               short-lived STT tokens for the listener tab (OpenAI, Deepgram, fake)
e2e/                   mock end-to-end test: next start over HTTP with fake STT
scripts/replay.ts      play a transcript file into a backend, as if a band heard it
```

## Run it on your own (no band, no keys)

    npm install                 # in the repo root
    npm run dev -w backend      # http://localhost:3001, data in backend/.pglite

With no `DATABASE_URL` the backend runs PGlite, a real Postgres inside Node, kept in
`backend/.pglite` (delete it to start over). With no `OPENAI_API_KEY` it uses the keyword
judge (it looks for the phrase in quotes in the question) and fake STT tokens.

For the real judge, put your key in `backend/.env.local`. It is gitignored, and `next dev`,
`next start` and the tests all read it:

    OPENAI_API_KEY=sk-...

Then, in a second terminal, the whole flow by hand:

    # 1. create a market (closesAt: some time in the next hours)
    curl -X POST localhost:3001/api/v1/markets -H 'authorization: Bearer you@example.com' \
      -H 'content-type: application/json' -d '{"question":"Will Sam say '"'"'no cap'"'"' tonight?",
      "tagline":"t","criteria":"Anyone near the band says no cap","outcomes":[{"label":"Yes"},{"label":"No"}],
      "fallbackOutcomeIndex":1,"bandNumber":<band>,"subjectName":"Sam","closesAt":"<ISO time>"}'

    # 2. trade as a friend: POST /api/v1/markets/<id>/trades as friend@example.com

    # 3. pretend to be the band
    npx tsx scripts/replay.ts --band <band> --email you@example.com scripts/transcripts/no-cap.txt

    # 4. see the result and the proof
    curl localhost:3001/api/v1/markets/<id>/proof -H 'authorization: Bearer you@example.com'

Write your own transcripts in `scripts/transcripts/`: one line per segment, `[speaker] text`.

## Test it

    npm test -w backend                                    # in-memory PGlite, ~3 s
    TEST_DATABASE_URL=postgres://... npm test -w backend   # a real Postgres server
                                                           # + live OpenAI tests if .env.local has a key
    npm run e2e -w backend                  # mock e2e: build, next start, fake STT, keyword judge
    E2E_REAL_JUDGE=1 npm run e2e -w backend # the same, judged by OpenAI
    E2E_BASE_URL=https://<app>.vercel.app npm run e2e:only -w backend   # against a deployment

Tests start the whole backend in-process (`test/harness.ts`) and call it through the
contract's typed client, with a fake clock (`b.advance(ms)`), the keyword judge and a fake
STT provider. `test/e2e.test.ts` is the whole product: create, trade, listen, judge, pay,
prove, with credits conserved.

## How it works

- **Auth**: `Authorization: Bearer <email>`. First sight of an email creates the user with
  10,000 credits. No passwords, no security: a demo with play money.
- **Credits**: every movement is a `ledger` row, and `users.balance` is updated in the same
  transaction. Users plus market escrows always equal the credits granted (tested).
- **Creating a market** costs its worst-case loss (`lmsr.maxSubsidy`), held in escrow.
- **Trades queue per market**: each trade locks the market row (`SELECT ... FOR UPDATE`), so
  it prices after the one before it. Idempotent on `idempotencyKey`.
- **Ingest**: segments are hash-chained exactly as `hashSegment` in the contract computes.
- **Judging**: OpenAI Responses API, strict structured output shaped like the contract's
  `JudgeOutput`, reasoning effort `none` (fastest; same verdicts as `low` in our timing runs). Every ingested line triggers judging of that band's
  open markets, after the response (Next `after()`), sending everything heard in the window
  as context. One judge call per market at a time: a line that arrives meanwhile marks the
  market `judge_pending` and the running job goes again, so no line is ever skipped. Quotes must appear in the stored
  transcript or the verdict counts as undetermined, so every proof passes `verifyProof`.
- **Closing**: any request closes markets past `closesAt` (at most every 10 s), judging the
  full window; nothing decisive means the fallback outcome wins.
- **Settlement**: 100 credits per winning share; what is left in escrow goes to the creator.

## Deploy on Vercel

1. New Vercel project from this repo, **Root Directory `backend`**.
2. Storage → add **Neon** Postgres. It sets `DATABASE_URL`.
3. Environment variables:

   | Name                      | What                                                                         |
   | ------------------------- | ---------------------------------------------------------------------------- |
   | `DATABASE_URL`            | Neon connection string (set by step 2)                                       |
   | `OPENAI_API_KEY`          | The judge (and STT when there is no Deepgram key). Without it: keyword judge |
   | `OPENAI_JUDGE_MODEL`      | Optional. `gpt-6.1-terra` (default); `gpt-6-luna` ~10x cheaper               |
   | `OPENAI_REASONING_EFFORT` | Optional. `none` (default, fastest), `low`, `medium`, `high`                 |
   | `OPENAI_STT_MODEL`        | Optional. `gpt-live-transcribe` (default)                                    |
   | `DEEPGRAM_API_KEY`        | Live STT, preferred when set: short-lived Deepgram tokens for the Listen bar |
   | `STT_PROVIDER`            | Optional override: `deepgram`, `openai` or `fake`                            |
   | `CRON_SECRET`             | Any random string; protects `/api/cron/tick`                                 |

4. Deploy. `vercel-build` applies migrations, then builds.
5. Check: `curl https://<app>.vercel.app/api/health`, then run `scripts/replay.ts --url ...`.

## Database changes

    # edit src/db/schema.ts, then:
    npm run db:generate -w backend   # writes drizzle/NNNN_*.sql; commit it
