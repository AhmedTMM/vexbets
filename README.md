# Vexbets

**Prediction markets on what your friends say.**

Someone wears a Vexo band. You open a market ("Will Sam say 'no cap' tonight?"), and friends
trade YES and NO shares. The band listens, and an AI judge settles the market the moment it
hears the answer, quoting the exact words as proof.

**Live:** [vexbets-dashboard.vercel.app](https://vexbets-dashboard.vercel.app) · play money,
sign in with any email · Chrome or Edge to connect the band

## How it works

```
 Vexo band ──Bluetooth──▶ Dashboard (browser) ──audio──▶ Deepgram nova-3
                               │                              │
                               │◀──────── live captions ──────┘
                               │
                               ▼ each finished line
                          Backend (Vercel + Postgres)
                               │  hash-chains the transcript
                               ▼
                          OpenAI judge ──▶ settles the market, pays winners,
                                           publishes a verifiable proof
```

1. **Trade.** Prices come from an automated market maker (LMSR): there is always a price,
   and every trade moves it. A YES share pays $1 if YES happens.
2. **Listen.** Press **Listen**, tick consent and pick the band. What it hears scrolls by as
   big captions at the bottom of the screen.
3. **Judge.** Every finished line goes to the judge with the whole conversation so far as
   context. It answers by meaning ("we broke up last week" counts as talking about an ex), and
   it must quote the transcript.
4. **Settle.** YES settles the moment it's proven. If nothing decisive is heard by closing
   time, the market settles NO. Every transcript line is hash-chained, so anyone can check
   that the quote was really said.

## Repo

| Folder                     | What                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| [`contract/`](contract/)   | The shared contract: types, schemas, pricing (LMSR), proofs, the API client. Start here.            |
| [`backend/`](backend/)     | Next.js API on Vercel, with Postgres (Neon), the transcript intake, the OpenAI judge and settlement |
| [`dashboard/`](dashboard/) | The trading app, with the Listen bar, live captions, trade ticket and portfolio                     |
| [`vexo/`](vexo/)           | The band-side engine: segmenter, OpenAI live speech-to-text, and a standalone test page             |

TypeScript everywhere. Every endpoint is typed by `contract/`, so the dashboard and backend
can't drift apart without CI failing.

## Run it locally

```bash
npm install
npm run dev -w backend      # API on :3001, local Postgres (PGlite), zero setup
NEXT_PUBLIC_API_MODE=live BACKEND_URL=http://localhost:3001 npm run dev -w dashboard   # app on :3000
```

Keys go in `backend/.env.local` (gitignored):

```
OPENAI_API_KEY=...      # the judge
DEEPGRAM_API_KEY=...    # live speech-to-text (needs a Member-role key for short-lived tokens)
```

Without keys it still runs: a keyword judge and fake speech-to-text stand in.

## Test

```bash
npm run check                     # lint + typecheck + every test, the same as CI
npm run e2e -w backend            # the whole product over HTTP: build, serve, trade, listen, settle, prove
```

CI runs all of it on every push and pull request, plus the backend tests against a real
Postgres 17.

## Deploy

Two Vercel projects deploy from `main`: `vexbets-backend` (root directory `backend`) and
`vexbets-dashboard` (root directory `dashboard`). Deploy each with
`npx vercel deploy --prod --project <name>` from the repo root. The backend's build applies
database migrations first.

## Built with

Next.js 16 · React 19 · Tailwind 4 · HeroUI · Drizzle + Postgres (Neon) · OpenAI
(`gpt-6.1-terra`) · Deepgram (`nova-3`) · the Vexo Open kit · Vercel
